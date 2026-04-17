/**
 * Shell 执行器
 *
 * 执行 Shell 命令，带危险命令检测和用户确认机制。
 * 实现 2 层安全防御：正则检测 + 用户确认。
 *
 * 参考 Claude Code: src/tools/BashTool/ (7 层安全防御)
 * 简化：正则检测 + 用户确认（2 层防御）
 */

import { execSync } from 'node:child_process';

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
 * 判断工具调用是否需要用户确认。
 *
 * 需要确认的场景：
 * 1. run_shell 执行危险命令（匹配 DANGEROUS_PATTERNS）
 * 2. write_file 创建新文件（Phase 2 中由 Agent 层处理）
 *
 * @param toolName - 工具名称
 * @param input - 工具输入参数
 * @returns 确认提示消息，不需要确认时返回 null
 */
export function needsConfirmation(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  if (toolName === 'run_shell' && typeof input['command'] === 'string') {
    if (isDangerousCommand(input['command'])) {
      return `⚠️  Dangerous command detected: ${input['command']}`;
    }
  }
  return null;
}

/**
 * 执行 Shell 命令（30s 超时，5MB 输出上限）
 *
 * 成功时返回 stdout 内容。
 * 失败时返回包含 exit code、stdout 和 stderr 的错误信息。
 * 超时时返回超时消息和已获取的部分输出。
 * 所有情况均返回字符串，不抛出异常。
 *
 * @param command - 要执行的命令
 * @param timeout - 超时时间（毫秒），默认 30000
 * @returns 命令输出或错误信息
 */
export function executeShellCommand(command: string, timeout = 30_000): string {
  try {
    const result = execSync(command, {
      timeout,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result;
  } catch (error: unknown) {
    // execSync throws on non-zero exit, timeout, or other failures
    if (error instanceof Error && 'status' in error) {
      const execError = error as Error & {
        status: number | null;
        signal: string | null;
        code: string | undefined;
        stdout: string | null;
        stderr: string | null;
      };

      // Timeout case: ETIMEDOUT code or SIGTERM signal
      if (execError.code === 'ETIMEDOUT' || execError.signal === 'SIGTERM') {
        const stdout = execError.stdout ?? '';
        return `Command timed out after ${timeout}ms\n\nPartial output:\n${stdout}`;
      }

      // Non-zero exit code
      const code = execError.status ?? 1;
      const stdout = execError.stdout ?? '';
      const stderr = execError.stderr ?? '';
      return `Exit code: ${code}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
    }

    // Unexpected error
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing command: ${message}`;
  }
}
