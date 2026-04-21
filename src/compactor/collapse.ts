/**
 * Context Collapse — 投影式折叠（第 2.5 级压缩）
 *
 * 识别不活跃的对话段并折叠为一行摘要，同时保留原始历史。
 * 返回折叠后的投影视图（发给 API）和释放的 token 估算。
 *
 * 关键原则：这是 READ-ONLY 投影 — 原始消息保留在内存中不变。
 *
 * 参考 Claude Code: src/services/compact/ 中的 context collapse 逻辑
 */

import type { ModelMessage, ToolCallPart } from 'ai';

/** 最小折叠阈值（字符数），低于此值不值得折叠 */
const MIN_COLLAPSE_CHARS = 2000;

/** 最少消息数才考虑折叠 */
const MIN_MESSAGES_FOR_COLLAPSE = 8;

/**
 * 对消息历史应用投影式折叠。
 *
 * 识别不活跃段（最近 recentTurns 轮无引用）并折叠为摘要。
 * 返回折叠后的投影视图和释放的 token 估算。
 *
 * @param messages - 当前消息历史
 * @param recentTurns - 保留的最近 assistant 轮数（默认 5）
 * @returns projected 视图 + tokensFreed 估算
 */
export function applyCollapse(
  messages: ModelMessage[],
  recentTurns: number = 5,
): { projected: ModelMessage[]; tokensFreed: number } {
  if (messages.length < MIN_MESSAGES_FOR_COLLAPSE) {
    return { projected: messages, tokensFreed: 0 };
  }

  // Find boundary: last `recentTurns` assistant messages
  let boundary = messages.length;
  let assistantCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      assistantCount++;
      if (assistantCount >= recentTurns) {
        boundary = i;
        break;
      }
    }
  }

  // If boundary is too early, nothing to collapse
  if (boundary <= 2) {
    return { projected: messages, tokensFreed: 0 };
  }

  // Everything before boundary is candidate for collapse (keep first user message)
  const toCollapse = messages.slice(1, boundary);
  const recent = messages.slice(boundary);

  // Calculate content size of collapsed section
  const collapsedSize = toCollapse.reduce((sum, m) => {
    const content = typeof m.content === 'string'
      ? m.content
      : JSON.stringify(m.content);
    return sum + content.length;
  }, 0);

  // Not worth collapsing if too small
  if (collapsedSize < MIN_COLLAPSE_CHARS) {
    return { projected: messages, tokensFreed: 0 };
  }

  // Build summary of collapsed section
  const summary = buildCollapseSummary(toCollapse);

  // Build projected view preserving first user message
  const projected: ModelMessage[] = [
    messages[0], // First user message
    {
      role: 'user' as const,
      content: `[Collapsed ${toCollapse.length} messages]: ${summary}`,
    },
    {
      role: 'assistant' as const,
      content: 'I understand the context from the collapsed conversation segment.',
    },
    ...recent,
  ];

  // Estimate tokens freed: (collapsed chars / 4) - (summary chars / 4)
  const summarySize = summary.length + 80; // account for wrapper text
  const tokensFreed = Math.floor(collapsedSize / 4) - Math.floor(summarySize / 4);

  return {
    projected,
    tokensFreed: Math.max(0, tokensFreed),
  };
}

/**
 * Build a concise summary of collapsed messages.
 * Extracts tool call names to preserve awareness of what happened.
 */
function buildCollapseSummary(messages: ModelMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-call') {
          const tc = part as ToolCallPart;
          parts.push(`Called ${tc.toolName}`);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'General conversation';
}
