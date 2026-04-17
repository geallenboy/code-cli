/**
 * Agent Loop 核心
 *
 * 实现"思考 → 调用工具 → 观察结果"的自主循环。
 * 这是整个系统的灵魂，驱动模型与工具之间的交互。
 *
 * 参考 Claude Code: src/query.ts + src/QueryEngine.ts
 * 简化：单层 while(true) 循环代替双层 Generator 架构
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
import { createModel } from './provider.js';
import { buildSystemPrompt, type ToolDescription } from './prompt.js';
import { getToolDefinitions, type ToolContext } from './tools/index.js';
import { printAssistantText, printToolCall, printToolResult } from './ui.js';
import type { AgentConfig, TokenUsage } from './types.js';
import { RETRYABLE_STATUS_CODES } from './types.js';
import * as readline from 'node:readline';

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
      if (!isRetryableError(error) || attempt === maxRetries) throw error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

/**
 * 在终端中提示用户确认操作。
 * @param message - 确认提示消息
 * @returns 用户是否确认（y/Y/回车 = 确认）
 */
async function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message}\nAllow? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * Agent 核心类
 *
 * 管理对话历史、token 追踪和 Agent Loop 执行。
 */
export class Agent {
  private _messages: ModelMessage[] = [];
  private abortController: AbortController | null = null;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private _confirmedCommands: Set<string> = new Set();
  private _isProcessing = false;
  private readonly _config: AgentConfig;
  private readonly modelInstance: LanguageModel;

  constructor(config: AgentConfig) {
    this._config = config;
    this.modelInstance = createModel(config.provider, config.model);
  }

  /**
   * 处理用户输入，进入 Agent Loop。
   *
   * 核心流程：push user message → while(true) {
   *   call streamText → stream text → collect response →
   *   track tokens → check tool calls → if none, break →
   *   execute tools → push messages → continue
   * }
   *
   * @param userMessage - 用户输入的消息
   */
  async chat(userMessage: string): Promise<void> {
    this._isProcessing = true;
    this.abortController = new AbortController();

    try {
      // Push user message
      this._messages.push({ role: 'user', content: userMessage });

      // Build system prompt with tool descriptions
      const toolCtx: ToolContext = {
        yolo: this._config.yolo,
        confirm: askConfirmation,
        confirmedCommands: this._confirmedCommands,
      };
      const tools = getToolDefinitions(toolCtx);
      const toolDescriptions: ToolDescription[] = Object.entries(tools).map(
        ([name, t]) => ({
          name,
          description: 'description' in t ? String(t.description) : '',
        }),
      );
      const systemPrompt = buildSystemPrompt(toolDescriptions);

      while (true) {
        if (this.abortController.signal.aborted) break;

        // Call streamText with retry
        const result = await withRetry(
          () =>
            Promise.resolve(
              streamText({
                model: this.modelInstance,
                system: systemPrompt,
                messages: this._messages,
                tools,
                stopWhen: stepCountIs(1),
                abortSignal: this.abortController?.signal,
              }),
            ),
          3,
          this.abortController.signal,
        );

        // Stream text to terminal
        for await (const textPart of result.textStream) {
          printAssistantText(textPart);
        }

        // Get final response data
        const text = await result.text;
        const usage = await result.usage;
        const toolCalls = await result.toolCalls;
        const toolResults = await result.toolResults;

        // Track token usage
        if (usage) {
          this.totalInputTokens += usage.inputTokens ?? 0;
          this.totalOutputTokens += usage.outputTokens ?? 0;
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
          this._messages.push({ role: 'assistant', content: assistantContent });
        }

        // If no tool calls, the loop terminates
        if (toolCalls.length === 0) {
          // Print a newline after streaming text
          if (text) {
            process.stdout.write('\n');
          }
          break;
        }

        // Print tool calls and results to terminal
        for (const tc of toolCalls) {
          printToolCall(tc.toolName, tc.input as Record<string, unknown>);
        }
        for (const tr of toolResults) {
          const outputStr = typeof tr.output === 'string'
            ? tr.output
            : JSON.stringify(tr.output);
          printToolResult(tr.toolName, outputStr);
        }

        // Build tool result message
        if (toolResults.length > 0) {
          const resultParts: ToolResultPart[] = toolResults.map((tr) => ({
            type: 'tool-result' as const,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            output: { type: 'text' as const, value: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output) },
          }));
          this._messages.push({ role: 'tool', content: resultParts });
        }
      }
    } finally {
      this._isProcessing = false;
    }
  }

  /** 中止当前操作 */
  abort(): void {
    this.abortController?.abort();
  }

  /** 清空对话历史 */
  clearHistory(): void {
    this._messages = [];
  }

  /** 手动触发压缩 */
  async compact(): Promise<void> {
    // TODO: Phase 2 — 实现上下文压缩
    throw new Error('Not implemented');
  }

  /** 显示 token 使用量和成本 */
  showCost(): void {
    // TODO: Phase 3 — 实现成本显示
    throw new Error('Not implemented');
  }

  /** 当前是否正在处理 */
  get isProcessing(): boolean {
    return this._isProcessing;
  }

  /** 获取 Agent 配置 */
  get config(): AgentConfig {
    return this._config;
  }

  /** 获取消息历史 */
  get messages(): ModelMessage[] {
    return this._messages;
  }

  /** 获取已确认的命令集合 */
  get confirmedCommands(): Set<string> {
    return this._confirmedCommands;
  }

  /** 获取 token 使用量 */
  get tokenUsage(): TokenUsage {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
    };
  }
}
