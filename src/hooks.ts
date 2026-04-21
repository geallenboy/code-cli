/**
 * Hook 事件系统
 *
 * 在 Agent 生命周期关键点注入自定义逻辑。
 * 支持 6 个核心事件和 Command Hook 类型。
 *
 * 参考 Claude Code: src/utils/hooks.ts（27 个事件、4 种 Hook 类型）
 * 简化：6 个事件、1 种 Hook 类型（command）
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Hook 事件类型 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit';

/** Hook 配置 */
export interface HookConfig {
  event: HookEvent;
  matcher?: string;
  command: string;
  timeout?: number;
}

/** Hook 执行结果 */
export interface HookResult {
  allow?: boolean;
  deny?: boolean;
  reason?: string;
}

/** settings.json 中的 Hook 配置格式 */
interface HookMatcherConfig {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
}

interface HookSettings {
  hooks?: Record<string, HookMatcherConfig[]>;
}

/**
 * Hook 系统
 *
 * 从 settings.json 加载 hook 配置，在事件触发时执行匹配的 hook。
 * 未信任工作区跳过所有 hook，防止恶意仓库通过 hook 执行代码。
 */
export class HookSystem {
  private hooks: HookConfig[] = [];
  private trusted = false;

  /**
   * @param trusted - 工作区是否已信任
   */
  constructor(trusted = false) {
    this.trusted = trusted;
    if (trusted) this.loadHooks();
  }

  /**
   * 从 settings.json 加载 hook 配置。
   *
   * 配置格式：
   * ```json
   * {
   *   "hooks": {
   *     "PreToolUse": [
   *       { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "echo check" }] }
   *     ]
   *   }
   * }
   * ```
   */
  private loadHooks(): void {
    const settingsPath = join(homedir(), '.code-cli', 'settings.json');
    try {
      if (!existsSync(settingsPath)) return;
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as HookSettings;
      if (!settings.hooks) return;
      for (const [event, matchers] of Object.entries(settings.hooks)) {
        for (const matcher of matchers) {
          for (const hook of matcher.hooks) {
            if (hook.type === 'command') {
              this.hooks.push({
                event: event as HookEvent,
                matcher: matcher.matcher,
                command: hook.command,
                timeout: hook.timeout ?? 30000,
              });
            }
          }
        }
      }
    } catch {
      /* ignore malformed settings */
    }
  }

  /**
   * 执行匹配指定事件的所有 hook。
   *
   * 并行执行所有匹配的 hook，超时则 kill 并返回空结果（no-decision）。
   * 未信任工作区直接返回空数组。
   *
   * @param event - 事件类型
   * @param context - 事件上下文（传给 hook 的 JSON 输入）
   * @returns Hook 执行结果数组
   */
  async executeHooks(
    event: HookEvent,
    context: Record<string, unknown>,
  ): Promise<HookResult[]> {
    if (!this.trusted) return [];
    const matching = this.hooks.filter(
      h => h.event === event && this.matchesPattern(h.matcher, context),
    );
    if (matching.length === 0) return [];

    const results = await Promise.all(matching.map(h => this.runHook(h, context)));
    return results;
  }

  /**
   * 检查 hook 的 matcher 是否匹配当前上下文。
   *
   * 支持三种匹配模式：
   * - 无 matcher → 匹配所有
   * - 精确匹配 / 管道分隔 OR
   * - 正则表达式
   *
   * @param matcher - 匹配模式
   * @param context - 事件上下文
   * @returns 是否匹配
   */
  matchesPattern(
    matcher: string | undefined,
    context: Record<string, unknown>,
  ): boolean {
    if (!matcher) return true; // No matcher = match all
    const toolName = String(context['toolName'] ?? '');
    // Exact match
    if (matcher === toolName) return true;
    // Pipe-delimited OR
    if (matcher.includes('|'))
      return matcher.split('|').some(m => m.trim() === toolName);
    // Regex
    try {
      return new RegExp(matcher).test(toolName);
    } catch {
      return false;
    }
  }

  /**
   * 执行单个 hook。
   *
   * 通过 stdin 传入 JSON 上下文，从 stdout 解析 JSON 结果。
   * 超时或错误返回空结果（no-decision）。
   *
   * @param hook - Hook 配置
   * @param context - 事件上下文
   * @returns Hook 执行结果
   */
  private async runHook(
    hook: HookConfig,
    context: Record<string, unknown>,
  ): Promise<HookResult> {
    try {
      const input = JSON.stringify(context);
      const output = execSync(hook.command, {
        input,
        encoding: 'utf-8',
        timeout: hook.timeout ?? 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return JSON.parse(output) as HookResult;
    } catch {
      return {}; // Timeout or error = no-decision
    }
  }

  /** 获取已加载的 hook 数量（用于测试） */
  get hookCount(): number {
    return this.hooks.length;
  }

  /** 获取是否信任（用于测试） */
  get isTrusted(): boolean {
    return this.trusted;
  }
}
