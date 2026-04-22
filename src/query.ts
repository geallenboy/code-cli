/**
 * Query Loop — 内层循环 (async generator)
 *
 * 从 agent.ts 拆分的核心循环层，实现"思考 → 调用工具 → 观察结果"的自主循环。
 * 作为 async generator，yield StreamEvent 事件，return Terminal 终止状态。
 *
 * 参考 Claude Code: src/query.ts (1,729 行)
 * 简化：单层 while(true) generator，Phase 4 后续任务将添加错误恢复
 */

import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolResultPart,
} from 'ai';
import type { LanguageModel } from 'ai';
import { buildSystemPrompt, type ToolDescription } from './prompt.js';
import { getToolDefinitions, type ToolContext } from './tools/index.js';
import type { StreamEvent, Terminal, ContinueReason } from './types.js';
import { RETRYABLE_STATUS_CODES } from './types.js';
import { snipCompact } from './compactor/snip.js';
import { microCompact } from './compactor/micro.js';
import { applyCollapse } from './compactor/collapse.js';
import { shouldAutoCompact, autoCompact } from './compactor/auto.js';
import { normalizeMessages } from './normalizer.js';
import { formatRetryProgress, formatRetryExhausted } from './retry-display.js';

/**
 * 判断错误是否可重试。
 * 可重试的 HTTP 状态码：429 (Rate Limit), 503 (Service Unavailable), 529 (Overloaded)。
 *
 * @param error - 捕获的错误
 * @returns 是否可重试
 */
export function isRetryableError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;

  // Check for status property (AI SDK errors typically have this)
  const statusCode =
    'status' in error ? (error as { status: number }).status :
    'statusCode' in error ? (error as { statusCode: number }).statusCode :
    undefined;

  if (statusCode !== undefined) {
    return (RETRYABLE_STATUS_CODES as readonly number[]).includes(statusCode);
  }

  // Check error message for status codes as fallback
  const message = 'message' in error ? String((error as { message: string }).message) : '';
  return RETRYABLE_STATUS_CODES.some((code) => message.includes(String(code)));
}

/**
 * 带指数退避的重试包装器。
 *
 * 延迟计算：min(1000 * 2^attempt, 30000) + random(0, 1000)
 * 随机抖动防止多客户端同时重试的"惊群效应"。
 *
 * @param fn - 要执行的异步函数
 * @param maxRetries - 最大重试次数（默认 3）
 * @param signal - 可选的 AbortSignal
 * @returns 函数执行结果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!isRetryableError(error) || attempt === maxRetries) {
        if (attempt === maxRetries && isRetryableError(error)) {
          const errMsg = error instanceof Error ? error.message : String(error);
          process.stderr.write(`\r${formatRetryExhausted(maxRetries, errMsg)}\n`);
        }
        throw error;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
      process.stderr.write(`\r${formatRetryProgress({ currentAttempt: attempt + 1, maxRetries, waitMs: delay })}\x1b[K`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

/**
 * 检测 Prompt-Too-Long (PTL) 错误。
 * PTL 错误通常是 HTTP 400，消息中包含 token 限制相关关键词。
 *
 * @param error - 捕获的错误
 * @returns 是否为 PTL 错误
 */
export function isPTLError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const msg = 'message' in error ? String((error as { message: string }).message) : '';
  const status = 'status' in error ? (error as { status: number }).status : 0;
  return (
    status === 400 &&
    (msg.includes('prompt is too long') ||
      msg.includes('too many tokens') ||
      msg.includes('context_length_exceeded'))
  );
}

/**
 * 检测 Max-Output-Tokens (MOT) 错误。
 * MOT 错误表示模型输出被截断。
 *
 * @param error - 捕获的错误
 * @returns 是否为 MOT 错误
 */
export function isMOTError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const msg = 'message' in error ? String((error as { message: string }).message) : '';
  return msg.includes('max_output_tokens') || msg.includes('max_tokens');
}

/** query() 的输入参数 */
export interface QueryParams {
  model: LanguageModel;
  messages: ModelMessage[];
  toolContext: ToolContext;
  effectiveContextWindow: number;
  abortSignal?: AbortSignal;
  maxTurns?: number;
}

/** query() 内部可变状态 */
interface QueryState {
  messages: ModelMessage[];
  maxOutputTokens: number;
  motRecoveryCount: number;
  autocompactFailures: number;
  turnCount: number;
  transition?: ContinueReason;
}

/**
 * 核心查询循环 — async generator 实现。
 *
 * 每次迭代：压缩检查 → API 调用 → 流式输出 → 收集响应 →
 * 工具调用处理 → 状态更新 → continue 或 return。
 *
 * @param params - 查询参数
 * @yields StreamEvent 事件（text/tool_call/tool_result/compact/error/usage）
 * @returns Terminal 终止状态
 */
export async function* query(params: QueryParams): AsyncGenerator<StreamEvent, Terminal> {
  let state: QueryState = {
    messages: params.messages,
    maxOutputTokens: 4096,
    motRecoveryCount: 0,
    autocompactFailures: 0,
    turnCount: 0,
  };

  const tools = getToolDefinitions(params.toolContext);
  const toolDescriptions: ToolDescription[] = Object.entries(tools).map(
    ([name, t]) => ({ name, description: 'description' in t ? String(t.description) : '' }),
  );
  const systemPrompt = buildSystemPrompt(toolDescriptions);

  while (true) {
    // Check abort signal
    if (params.abortSignal?.aborted) {
      return { reason: 'aborted' as const };
    }

    // Check max turns
    if (params.maxTurns && state.turnCount >= params.maxTurns) {
      return { reason: 'max_turns' as const };
    }

    // Normalize messages before API call (Task 23)
    state.messages = normalizeMessages(state.messages);

    // API call with retry + error recovery (Task 22)
    let result;
    try {
      result = await withRetry(
        () =>
          Promise.resolve(
            streamText({
              model: params.model,
              system: systemPrompt,
              messages: state.messages,
              tools,
              stopWhen: stepCountIs(1),
              abortSignal: params.abortSignal,
              maxOutputTokens: state.maxOutputTokens,
            }),
          ),
        3,
        params.abortSignal,
      );
    } catch (error) {
      // === Error Recovery: PTL and MOT Continue Sites ===

      // Detect PTL error → force autocompact and retry
      if (isPTLError(error)) {
        const autoResult = await autoCompact(
          state.messages,
          params.model,
          state.autocompactFailures,
        );
        if (autoResult.failed) {
          state.autocompactFailures++;
          // All recovery exhausted — yield error and terminate
          yield {
            type: 'error' as const,
            error: new Error('Context too long: compression failed'),
            recoverable: false,
          };
          return { reason: 'error' as const };
        }
        state.messages = autoResult.messages;
        state.autocompactFailures = 0;
        yield { type: 'compact' as const, level: 'auto' as const, tokensFreed: 0 };
        state = { ...state, transition: 'ptl_recovery' };
        continue; // Retry the API call
      }

      // Detect MOT error
      if (isMOTError(error)) {
        // MOT Escalation: increase max tokens
        if (state.maxOutputTokens < 16384) {
          state = { ...state, maxOutputTokens: 16384, transition: 'mot_escalation' };
          continue; // Retry with higher limit
        }
        // MOT Continuation: inject continuation prompt
        if (state.motRecoveryCount < 3) {
          state.messages.push({
            role: 'user',
            content: 'Output token limit reached. Continue from where you left off.',
          });
          state = {
            ...state,
            motRecoveryCount: state.motRecoveryCount + 1,
            transition: 'mot_continuation',
          };
          continue;
        }
        // All MOT recovery exhausted
        yield {
          type: 'error' as const,
          error: new Error('Output too long: max recovery attempts reached'),
          recoverable: false,
        };
        return { reason: 'error' as const };
      }

      // Non-recoverable error — yield and terminate
      yield {
        type: 'error' as const,
        error: error instanceof Error ? error : new Error(String(error)),
        recoverable: false,
      };
      return { reason: 'error' as const };
    }

    // Stream text — yield each chunk as StreamEvent
    for await (const textPart of result.textStream) {
      yield { type: 'text' as const, text: textPart };
    }

    // Collect response
    const text = await result.text;
    const usage = await result.usage;
    const toolCalls = await result.toolCalls;
    const toolResults = await result.toolResults;

    // Yield usage event
    if (usage) {
      yield {
        type: 'usage' as const,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      };
    }

    // Build assistant message content parts
    const assistantContent: Array<TextPart | ToolCallPart> = [];
    if (text) {
      assistantContent.push({ type: 'text', text });
    }
    for (const tc of toolCalls) {
      assistantContent.push({
        type: 'tool-call',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
      });
    }

    if (assistantContent.length > 0) {
      state.messages.push({ role: 'assistant', content: assistantContent });
    }

    // No tool calls → complete
    if (toolCalls.length === 0) {
      return { reason: 'complete' as const, lastAssistantText: text || undefined };
    }

    // Yield tool events
    for (const tc of toolCalls) {
      yield {
        type: 'tool_call' as const,
        toolName: tc.toolName,
        input: tc.input as Record<string, unknown>,
      };
    }
    for (const tr of toolResults) {
      const outputStr = typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output);
      yield { type: 'tool_result' as const, toolName: tr.toolName, result: outputStr };
    }

    // Build tool result message
    if (toolResults.length > 0) {
      const resultParts: ToolResultPart[] = toolResults.map((tr) => ({
        type: 'tool-result' as const,
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        output: {
          type: 'text' as const,
          value: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output),
        },
      }));
      state.messages.push({ role: 'tool', content: resultParts });
    }

    // === Three-level compression pipeline ===

    // 1. Snip — zero cost
    const snipResult = snipCompact(state.messages);
    state.messages = snipResult.messages;
    if (snipResult.tokensFreed > 0) {
      yield {
        type: 'compact' as const,
        level: 'snip' as const,
        tokensFreed: snipResult.tokensFreed,
      };
    }

    // 2. Micro — zero cost
    const microResult = microCompact(state.messages);
    state.messages = microResult.messages;
    if (microResult.tokensFreed > 0) {
      yield {
        type: 'compact' as const,
        level: 'micro' as const,
        tokensFreed: microResult.tokensFreed,
      };
    }

    // 2.5. Collapse — zero cost (projection-based folding)
    const collapseResult = applyCollapse(state.messages);
    if (collapseResult.tokensFreed > 0) {
      state.messages = collapseResult.projected;
      yield {
        type: 'compact' as const,
        level: 'collapse' as const,
        tokensFreed: collapseResult.tokensFreed,
      };
    }

    // 3. Auto — full cost (only if needed)
    if (shouldAutoCompact(usage?.inputTokens ?? 0, params.effectiveContextWindow)) {
      const autoResult = await autoCompact(
        state.messages,
        params.model,
        state.autocompactFailures,
      );
      if (autoResult.failed) {
        state.autocompactFailures++;
      } else {
        state.messages = autoResult.messages;
        state.autocompactFailures = 0;
        yield { type: 'compact' as const, level: 'auto' as const, tokensFreed: 0 };
      }
    }

    state.turnCount++;
    state = { ...state, transition: 'next_turn' };
  }
}
