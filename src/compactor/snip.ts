/**
 * Snip 压缩 — 第1级（零 API 成本）
 *
 * 将超过 10K 字符的旧工具结果（>3 轮前）替换为首尾 200 字符 + 占位符。
 * 保留 tool_call_id 确保消息配对完整。
 *
 * 参考 Claude Code: src/services/compact/snip.ts
 */

import type { ModelMessage, ToolResultPart } from 'ai';

const SNIP_CHAR_THRESHOLD = 10_000;
const PREVIEW_CHARS = 200;
const RECENT_EXCHANGES = 3;

/**
 * 计算最近 N 轮 assistant-tool 交换的边界索引。
 * 从消息末尾向前扫描，找到第 `count` 个 assistant 消息的索引。
 *
 * @returns 边界索引——该索引及之后的消息属于"最近"，不做 snip
 */
function findRecentBoundary(messages: ModelMessage[], count: number): number {
  let exchanges = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      exchanges++;
      if (exchanges >= count) return i;
    }
  }
  return 0; // fewer than `count` exchanges → everything is "recent"
}

/**
 * 对单个 tool-result part 的 output value 执行 snip 截断。
 * @returns [newPart, freedChars] — 新 part 和释放的字符数
 */
function snipToolResultPart(part: ToolResultPart): [ToolResultPart, number] {
  // ToolResultPart output can be various shapes; we handle the text value case
  const output = part.output;
  let value: string | undefined;

  if (typeof output === 'string') {
    value = output;
  } else if (output && typeof output === 'object' && 'value' in output) {
    value = String((output as { value: unknown }).value);
  }

  if (!value || value.length <= SNIP_CHAR_THRESHOLD) {
    return [part, 0];
  }

  const originalLength = value.length;
  const snipped =
    value.slice(0, PREVIEW_CHARS) +
    `\n\n[snipped: original was ${originalLength} chars]\n\n` +
    value.slice(-PREVIEW_CHARS);

  const freedChars = originalLength - snipped.length;

  let newOutput: ToolResultPart['output'];
  if (typeof output === 'string') {
    newOutput = snipped as unknown as ToolResultPart['output'];
  } else {
    newOutput = { ...(output as Record<string, unknown>), value: snipped } as ToolResultPart['output'];
  }

  const newPart: ToolResultPart = { ...part, output: newOutput };
  return [newPart, freedChars];
}

/**
 * Snip 压缩：将超过 10K 字符的旧工具结果替换为首尾 200 字符 + 占位符。
 *
 * @param messages - 当前消息历史
 * @returns 压缩后的消息 + 估算释放的 token 数
 */
export function snipCompact(messages: ModelMessage[]): { messages: ModelMessage[]; tokensFreed: number } {
  const boundary = findRecentBoundary(messages, RECENT_EXCHANGES);
  let totalFreedChars = 0;

  const result = messages.map((msg, idx) => {
    // Only process tool messages before the boundary
    if (idx >= boundary || msg.role !== 'tool') return msg;

    if (!Array.isArray(msg.content)) return msg;

    let changed = false;
    const newContent = msg.content.map((part) => {
      if (part.type !== 'tool-result') return part;
      const [newPart, freed] = snipToolResultPart(part as ToolResultPart);
      if (freed > 0) changed = true;
      totalFreedChars += freed;
      return newPart;
    });

    return changed ? { ...msg, content: newContent } : msg;
  });

  return {
    messages: totalFreedChars > 0 ? result : messages,
    tokensFreed: Math.floor(totalFreedChars / 4), // rough char-to-token ratio
  };
}
