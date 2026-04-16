/**
 * 上下文压缩器
 *
 * 当 token 使用量接近上下文窗口限制时，自动压缩对话历史。
 * 请求模型生成摘要，替换历史消息以释放 token 空间。
 *
 * 参考 Claude Code: src/services/compact/ (5 级渐进管线)
 * 简化：单级自动摘要
 */

/**
 * 检查是否需要压缩
 * @param inputTokens - 当前输入 token 数
 * @param effectiveWindow - 有效上下文窗口大小
 * @returns 是否需要压缩
 */
export function shouldCompact(inputTokens: number, effectiveWindow: number): boolean {
  return inputTokens > effectiveWindow * 0.85;
}

/**
 * 执行对话压缩：请求模型生成摘要，替换历史
 * @param messages - 当前消息历史
 * @returns 压缩后的消息历史
 */
export async function compactConversation(
  messages: unknown[],
): Promise<unknown[]> {
  // TODO: Phase 2 — 实现对话压缩
  throw new Error('Not implemented');
  return messages;
}
