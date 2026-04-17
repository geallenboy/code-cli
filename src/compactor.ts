/**
 * 上下文压缩器
 *
 * 当 token 使用量接近上下文窗口限制时，自动压缩对话历史。
 * 请求模型生成摘要，替换历史消息以释放 token 空间。
 *
 * 参考 Claude Code: src/services/compact/ (5 级渐进管线)
 * 简化：单级自动摘要
 */

import { generateText, type LanguageModel, type ModelMessage } from 'ai';

const COMPACT_THRESHOLD = 0.85; // 85% of context window

/**
 * 检查是否需要压缩
 * @param inputTokens - 当前输入 token 数
 * @param effectiveWindow - 有效上下文窗口大小
 * @returns 是否需要压缩
 */
export function shouldCompact(inputTokens: number, effectiveWindow: number): boolean {
  return inputTokens > effectiveWindow * COMPACT_THRESHOLD;
}

/**
 * 执行对话压缩：请求模型生成摘要，替换历史
 * @param messages - 当前消息历史
 * @param model - 语言模型实例
 * @returns 压缩后的消息历史
 */
export async function compactConversation(
  messages: ModelMessage[],
  model: LanguageModel,
): Promise<ModelMessage[]> {
  // Skip if fewer than 4 messages
  if (messages.length < 4) return messages;

  try {
    // Preserve the last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

    // Generate summary using the model
    const summaryPrompt = `Summarize the following conversation concisely. Preserve:
- Key decisions made
- File paths mentioned and changes made
- Current task context and progress
- Any errors encountered and how they were resolved

Conversation:
${messages.map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n')}`;

    const { text: summary } = await generateText({
      model,
      prompt: summaryPrompt,
    });

    // Build compressed history: summary pair + last user message
    const compressed: ModelMessage[] = [
      { role: 'user', content: `[Previous conversation summary]: ${summary}` },
      { role: 'assistant', content: 'I understand the context from our previous conversation. I\'ll continue from where we left off.' },
    ];

    if (lastUserMsg) {
      compressed.push(lastUserMsg);
    }

    return compressed;
  } catch {
    // Graceful degradation: return original messages on failure
    return messages;
  }
}
