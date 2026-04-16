/**
 * Shell 执行器
 *
 * 执行 Shell 命令，带危险命令检测和用户确认机制。
 * 实现 2 层安全防御：正则检测 + 用户确认。
 *
 * 参考 Claude Code: src/tools/BashTool/ (7 层安全防御)
 * 简化：正则检测 + 用户确认（2 层防御）
 */

/** 危险命令模式列表 */
export const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s/,
  /\bgit\s+(push|reset|clean|checkout\s+\.)/,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s/,
  />\s*\/dev\//,
  /\bkill\b/,
  /\bpkill\b/,
  /\breboot\b/,
  /\bshutdown\b/,
];

/**
 * 检测命令是否危险
 * @param command - Shell 命令
 * @returns 是否匹配危险模式
 */
export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * 判断工具调用是否需要用户确认
 * @param toolName - 工具名称
 * @param input - 工具输入参数
 * @returns 确认提示消息，不需要确认时返回 null
 */
export function needsConfirmation(
  _toolName: string,
  _input: Record<string, unknown>,
): string | null {
  // TODO: Phase 2 — 实现确认逻辑
  return null;
}

/**
 * 执行 Shell 命令（30s 超时，5MB 输出上限）
 * @param command - 要执行的命令
 * @param timeout - 超时时间（毫秒），默认 30000
 * @returns 命令输出
 */
export function executeShellCommand(_command: string, _timeout = 30_000): string {
  // TODO: Phase 1 — 实现 Shell 命令执行
  return '';
}
