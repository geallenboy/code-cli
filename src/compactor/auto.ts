/**
 * Auto 压缩 — 第3级（全 API 成本）
 *
 * 当 token 使用量接近上下文窗口限制时，请求模型生成摘要替换历史。
 * 保留最后 user 消息 + 最近 3 轮 assistant-tool 交换。
 * 断路器：连续 3 次失败后停止尝试。
 *
 * 参考 Claude Code: src/services/compact/autocompact.ts
 */

import { generateText, type LanguageModel, type ModelMessage } from 'ai';

const COMPACT_THRESHOLD = 0.80; // 80% of context window
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 检查是否需要自动压缩
 * @param inputTokens - 当前输入 token 数
 * @param effectiveWindow - 有效上下文窗口大小
 * @returns 是否需要压缩
 */
export function shouldAutoCompact(inputTokens: number, effectiveWindow: number): boolean {
  return inputTokens > effectiveWindow * COMPACT_THRESHOLD;
}

/**
 * 执行自动对话压缩：请求模型生成摘要，替换历史。
 *
 * 保留最后 user 消息 + 最近 3 轮 assistant-tool 交换。
 * 包含断路器：连续失败达到上限后停止尝试。
 *
 * @param messages - 当前消息历史
 * @param model - 语言模型实例
 * @param consecutiveFailures - 连续失败次数
 * @returns 压缩后的消息 + 是否失败
 */
export async function autoCompact(
  messages: ModelMessage[],
  model: LanguageModel,
  consecutiveFailures: number,
): Promise<{ messages: ModelMessage[]; failed: boolean }> {
  // Skip if fewer than 4 messages
  if (messages.length < 4) return { messages, failed: false };

  // Circuit breaker: stop after MAX_CONSECUTIVE_FAILURES
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return { messages, failed: true };
  }

  try {
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

    // Find the 3 most recent assistant-tool exchanges to preserve
    const recentExchanges: ModelMessage[] = [];
    let exchangeCount = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        exchangeCount++;
        if (exchangeCount > 3) break;
      }
      if (exchangeCount > 0 && exchangeCount <= 3) {
        recentExchanges.unshift(messages[i]);
      }
    }

    // Messages to summarize (everything before the recent exchanges)
    const boundaryIdx = messages.length - recentExchanges.length;
    const toSummarize = messages.slice(0, boundaryIdx);

    if (toSummarize.length === 0) {
      return { messages, failed: false };
    }

    // Generate summary using the model
    const summaryPrompt = `Summarize the following conversation concisely. Preserve:
- Key decisions made
- File paths mentioned and changes made
- Current task context and progress
- Any errors encountered and how they were resolved

Conversation:
${toSummarize.map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n')}`;

    const { text: summary } = await generateText({
      model,
      prompt: summaryPrompt,
    });

    // Build compressed history: summary pair + recent exchanges + last user message
    const compressed: ModelMessage[] = [
      { role: 'user', content: `[Previous conversation summary]: ${summary}` },
      { role: 'assistant', content: 'I understand the context from our previous conversation. I\'ll continue from where we left off.' },
      ...recentExchanges,
    ];

    // Add last user message if not already in recent exchanges
    if (lastUserMsg && !recentExchanges.includes(lastUserMsg)) {
      compressed.push(lastUserMsg);
    }

    return { messages: compressed, failed: false };
  } catch {
    // Graceful degradation: return original messages on failure
    return { messages, failed: true };
  }
}
