/**
 * 工具注册表 + dispatch
 *
 * 统一的工具声明、验证和调度机制。
 * 使用 Vercel AI SDK 的 tool() 函数 + Zod schema 声明工具，
 * 提供 dispatch 函数将工具名映射到执行函数。
 *
 * 参考 Claude Code: src/Tool.ts + src/tools.ts
 * 简化：AI SDK tool() 声明代替 Tool 泛型接口
 */

/**
 * 获取所有工具定义（传给 AI SDK 的 streamText）
 * @returns 工具名到工具定义的映射
 */
export function getToolDefinitions(): Record<string, unknown> {
  // TODO: Phase 1 — 注册基础工具 (read_file, write_file, run_shell)
  throw new Error('Not implemented');
}

/**
 * 截断超长工具结果（保留首尾各半）
 * @param result - 工具执行结果
 * @param maxChars - 最大字符数，默认 50000
 * @returns 截断后的结果
 */
export function truncateResult(result: string, maxChars = 50_000): string {
  if (result.length <= maxChars) {
    return result;
  }
  const half = Math.floor(maxChars / 2);
  return (
    result.slice(0, half) +
    '\n\n--- [truncated: result too long] ---\n\n' +
    result.slice(-half)
  );
}
