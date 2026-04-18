/**
 * 消息规范化器
 *
 * 在 API 调用前对消息列表进行规范化处理，确保：
 * 1. tool_use/tool_result 配对完整（孤立 tool_use → 合成错误结果）
 * 2. 孤立 tool_result → 移除
 * 3. 连续同角色消息 → 合并
 * 4. 空消息列表 → 跳过 API 调用
 *
 * 参考 Claude Code: normalizeMessagesForAPI()（约 200 行）
 */

import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';

/**
 * Normalize message list before API call.
 *
 * 1. Fix orphaned tool_use (no matching tool_result) → generate synthetic error result
 * 2. Remove orphaned tool_result (no matching tool_use)
 * 3. Merge consecutive same-role messages
 *
 * This function is idempotent: normalizing an already-normalized list produces
 * an equivalent result.
 *
 * @param messages - 当前消息历史
 * @returns 规范化后的消息列表
 */
export function normalizeMessages(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages;

  let result = [...messages];

  // Step 1: Collect all tool_call_ids from assistant messages
  const toolCallIds = new Set<string>();
  for (const msg of result) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-call') {
          toolCallIds.add((part as ToolCallPart).toolCallId);
        }
      }
    }
  }

  // Step 2: Collect all tool_result toolCallIds
  const toolResultIds = new Set<string>();
  for (const msg of result) {
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-result') {
          toolResultIds.add((part as ToolResultPart).toolCallId);
        }
      }
    }
  }

  // Step 3: For tool_calls without results, inject synthetic error results
  const missingResults = [...toolCallIds].filter((id) => !toolResultIds.has(id));
  if (missingResults.length > 0) {
    const syntheticParts: ToolResultPart[] = missingResults.map((id) => ({
      type: 'tool-result' as const,
      toolCallId: id,
      toolName: 'unknown',
      output: { type: 'text' as const, value: 'Tool execution was interrupted' },
    }));
    result.push({ role: 'tool', content: syntheticParts });
  }

  // Step 4: Remove orphaned tool_results (referencing non-existent tool_calls)
  result = result
    .map((msg) => {
      if (msg.role !== 'tool' || !Array.isArray(msg.content)) return msg;
      const filtered = msg.content.filter((part) => {
        if (part.type !== 'tool-result') return true;
        return toolCallIds.has((part as ToolResultPart).toolCallId);
      });
      if (filtered.length === 0) return null; // Remove empty tool messages
      if (filtered.length === msg.content.length) return msg;
      return { ...msg, content: filtered };
    })
    .filter((msg): msg is ModelMessage => msg !== null);

  // Step 5: Merge consecutive same-role messages (user messages only)
  const merged: ModelMessage[] = [];
  for (const msg of result) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role && last.role === 'user') {
      // Merge user messages
      const lastContent =
        typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
      const thisContent =
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      merged[merged.length - 1] = { ...last, content: `${lastContent}\n\n${thisContent}` };
    } else {
      merged.push(msg);
    }
  }

  return merged;
}
