/**
 * Micro 压缩 — 第2级（零 API 成本）
 *
 * 将超过 5 轮前的工具结果压缩到 500 字符 + [compressed] 标记。
 *
 * 参考 Claude Code: src/services/compact/microcompact.ts
 */

import type { ModelMessage, ToolResultPart } from 'ai';

const MICRO_MAX_CHARS = 500;
const RECENT_EXCHANGES = 5;

/**
 * 计算最近 N 轮 assistant-tool 交换的边界索引。
 */
function findRecentBoundary(messages: ModelMessage[], count: number): number {
  let exchanges = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      exchanges++;
      if (exchanges >= count) return i;
    }
  }
  return 0;
}

/**
 * 对单个 tool-result part 执行 micro 压缩。
 * @returns [newPart, freedChars]
 */
function microCompressPart(part: ToolResultPart): [ToolResultPart, number] {
  const output = part.output;
  let value: string | undefined;

  if (typeof output === 'string') {
    value = output;
  } else if (output && typeof output === 'object' && 'value' in output) {
    value = String((output as { value: unknown }).value);
  }

  if (!value || value.length <= MICRO_MAX_CHARS) {
    return [part, 0];
  }

  const originalLength = value.length;
  const compressed = value.slice(0, MICRO_MAX_CHARS) + ' [compressed]';
  const freedChars = originalLength - compressed.length;

  let newOutput: ToolResultPart['output'];
  if (typeof output === 'string') {
    newOutput = compressed as unknown as ToolResultPart['output'];
  } else {
    newOutput = { ...(output as Record<string, unknown>), value: compressed } as ToolResultPart['output'];
  }

  const newPart: ToolResultPart = { ...part, output: newOutput };
  return [newPart, freedChars];
}

/**
 * Micro 压缩：将超过 5 轮前的工具结果压缩到 500 字符 + [compressed] 标记。
 *
 * @param messages - 当前消息历史
 * @returns 压缩后的消息 + 估算释放的 token 数
 */
export function microCompact(messages: ModelMessage[]): { messages: ModelMessage[]; tokensFreed: number } {
  const boundary = findRecentBoundary(messages, RECENT_EXCHANGES);
  let totalFreedChars = 0;

  const result = messages.map((msg, idx) => {
    if (idx >= boundary || msg.role !== 'tool') return msg;

    if (!Array.isArray(msg.content)) return msg;

    let changed = false;
    const newContent = msg.content.map((part) => {
      if (part.type !== 'tool-result') return part;
      const [newPart, freed] = microCompressPart(part as ToolResultPart);
      if (freed > 0) changed = true;
      totalFreedChars += freed;
      return newPart;
    });

    return changed ? { ...msg, content: newContent } : msg;
  });

  return {
    messages: totalFreedChars > 0 ? result : messages,
    tokensFreed: Math.floor(totalFreedChars / 4),
  };
}
