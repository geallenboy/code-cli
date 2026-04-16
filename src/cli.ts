/**
 * 命令行参数解析 + REPL 循环
 *
 * 提供命令行参数解析和交互式 REPL 输入循环。
 * 支持交互模式（默认）和一次性模式（带 prompt 参数）。
 *
 * 参考 Claude Code: src/screens/REPL.tsx
 * 简化：readline + chalk 代替 React + Ink
 */

import type { Agent } from './agent.js';
import type { CliArgs } from './types.js';

/**
 * 解析命令行参数
 * @returns 解析后的 CLI 参数
 */
export function parseArgs(): CliArgs {
  // TODO: Phase 1 — 实现参数解析
  throw new Error('Not implemented');
}

/**
 * 运行交互式 REPL
 * @param _agent - Agent 实例
 */
export async function runRepl(_agent: Agent): Promise<void> {
  // TODO: Phase 1 — 实现 REPL 循环
  throw new Error('Not implemented');
}
