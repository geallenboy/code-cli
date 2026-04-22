/**
 * 终端 UI 输出
 *
 * 提供彩色格式化输出函数，用于在终端中显示
 * 工具调用、工具结果、AI 文本和成本信息。
 *
 * 参考 Claude Code: src/screens/ (React + Ink 组件)
 * 简化：纯函数 + chalk 彩色输出
 */

import chalk from 'chalk';
import type { CacheStats } from './cache-tracker.js';
import { renderToolResult as renderToolResultEnhanced } from './tool-result-renderer.js';

/**
 * 禁用颜色输出（--no-color 支持）
 *
 * 设置 chalk level 为 0 以禁用所有 ANSI 颜色。
 */
export function disableColor(): void {
  chalk.level = 0;
}

/** Spinner 模式类型 */
export type SpinnerMode = 'requesting' | 'thinking' | 'responding';

/** 各模式配置 */
const SPINNER_MODES: Record<SpinnerMode, { interval: number; label: string }> = {
  requesting: { interval: 50, label: '请求中...' },
  thinking: { interval: 200, label: '思考中...' },
  responding: { interval: 100, label: '响应中...' },
};

/** 停滞警告阈值（毫秒） */
const STALL_WARNING_MS = 10_000;
const STALL_CRITICAL_MS = 20_000;

/**
 * Spinner 状态机
 *
 * 在模型生成期间显示旋转动画 + 已用时间。
 * 支持三种模式：requesting（50ms/帧）、thinking（200ms/帧）、responding（100ms/帧）。
 * 超过 10s 无新 token 时颜色渐变为黄色，超过 20s 渐变为红色。
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private lastTokenTime = 0;
  private message: string;
  private _mode: SpinnerMode = 'requesting';

  constructor(message = 'Thinking...') {
    this.message = message;
  }

  /** Get current mode */
  get mode(): SpinnerMode {
    return this._mode;
  }

  /**
   * 设置 Spinner 模式
   *
   * 切换模式会更新动画间隔和标签。
   *
   * @param mode - 新模式
   */
  setMode(mode: SpinnerMode): void {
    this._mode = mode;
    const config = SPINNER_MODES[mode];
    this.message = config.label;

    // 如果正在运行，重新设置间隔
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        this.render();
      }, config.interval);
    }
  }

  /** Start the spinner animation */
  start(): void {
    if (this.intervalId) return;
    this.startTime = Date.now();
    this.lastTokenTime = Date.now();
    const config = SPINNER_MODES[this._mode];
    this.intervalId = setInterval(() => {
      this.render();
    }, config.interval);
  }

  /** Notify the spinner that a new token was received */
  tick(): void {
    this.lastTokenTime = Date.now();
  }

  /** Stop the spinner and clear the line */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Clear the spinner line
    process.stderr.write('\r\x1b[K');
  }

  /**
   * 获取停滞时间（毫秒）
   * 用于测试
   */
  getStallTime(): number {
    return Date.now() - this.lastTokenTime;
  }

  private render(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const frame = this.frames[this.frameIndex % this.frames.length];
    this.frameIndex++;

    const stallTime = Date.now() - this.lastTokenTime;

    // 停滞颜色渐变：正常 → 黄色 → 红色
    let frameColor: (text: string) => string;
    let stallIndicator = '';
    if (stallTime > STALL_CRITICAL_MS) {
      frameColor = chalk.red;
      stallIndicator = chalk.red(' (stalled)');
    } else if (stallTime > STALL_WARNING_MS) {
      frameColor = chalk.yellow;
      stallIndicator = chalk.yellow(' (stalled)');
    } else {
      frameColor = chalk.cyan;
    }

    process.stderr.write(
      `\r${frameColor(frame ?? '')} ${this.message} ${chalk.dim(`${elapsed}s`)}${stallIndicator}\x1b[K`,
    );
  }
}

/**
 * 获取工具对应的图标
 * @param name - 工具名称
 * @returns 对应的 emoji 图标
 */
function getToolIcon(name: string): string {
  const icons: Record<string, string> = {
    read_file: '📖',
    write_file: '✏️',
    edit_file: '🔧',
    run_shell: '💻',
    grep_search: '🔍',
    list_files: '📁',
  };
  return icons[name] ?? '🔧';
}

/**
 * 打印工具调用信息（黄色 + 图标）
 * @param name - 工具名称
 * @param input - 工具输入参数
 */
export function printToolCall(name: string, input: Record<string, unknown>): void {
  const icon = getToolIcon(name);
  console.log(chalk.yellow(`\n${icon} ${name}`));
  const summary = Object.entries(input)
    .map(([k, v]) => `  ${k}: ${typeof v === 'string' && v.length > 100 ? v.slice(0, 100) + '...' : v}`)
    .join('\n');
  if (summary) console.log(chalk.dim(summary));
}

/**
 * 打印工具结果（使用增强渲染器：语法高亮 + 行号 + 截断）
 * @param name - 工具名称
 * @param result - 工具执行结果
 */
export function printToolResult(name: string, result: string): void {
  // 尝试从结果中提取文件路径（read_file / grep_search 等工具）
  const filePath = extractFilePath(name, result);
  const rendered = renderToolResultEnhanced(name, result, filePath ?? undefined);
  console.log(chalk.dim('  ↳ ') + rendered.split('\n').join('\n    '));
}

/**
 * 从工具结果中提取文件路径
 */
function extractFilePath(_name: string, result: string): string | null {
  // 尝试匹配常见的文件路径模式
  const match = result.match(/^((?:\/|\.\/|\.\.\/|[a-zA-Z]:[\\/])?[\w./-]+\.\w+)/);
  if (match?.[1] && match[1].includes('.')) {
    return match[1];
  }
  return null;
}

/**
 * 打印 AI 助手文本（流式，绿色）
 * @param text - 文本内容
 */
export function printAssistantText(text: string): void {
  process.stdout.write(chalk.green(text));
}

/**
 * 打印 token 使用量和成本估算
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 */
export function printCost(inputTokens: number, outputTokens: number): void {
  const total = inputTokens + outputTokens;
  // Rough cost estimate (Anthropic Sonnet pricing as baseline)
  const inputCost = (inputTokens / 1_000_000) * 3;    // $3/M input tokens
  const outputCost = (outputTokens / 1_000_000) * 15;  // $15/M output tokens
  const totalCost = inputCost + outputCost;

  console.log(chalk.cyan(
    `\nToken usage: ${inputTokens.toLocaleString()} input + ${outputTokens.toLocaleString()} output = ${total.toLocaleString()} total`,
  ));
  console.log(chalk.cyan(`Estimated cost: $${totalCost.toFixed(4)} (based on Anthropic Sonnet pricing)`));
}

/**
 * 打印权限确认请求（含风险级别）
 * @param toolName - 工具名称
 * @param input - 工具输入参数
 * @param riskLevel - 风险级别 (LOW/MEDIUM/HIGH)
 */
export function printPermissionRequest(toolName: string, input: Record<string, unknown>, riskLevel: string): void {
  const riskColor = riskLevel === 'HIGH' ? chalk.red : riskLevel === 'MEDIUM' ? chalk.yellow : chalk.green;
  console.log(chalk.yellow(`\n⚠️  Permission required: ${toolName}`));
  console.log(chalk.dim(`  Input: ${JSON.stringify(input).slice(0, 200)}`));
  console.log(`  Risk: ${riskColor(riskLevel)}`);
}

/**
 * 打印 token 使用量可视化条
 *
 * 显示 input/output token 占上下文窗口的比例，
 * 颜色随使用率变化：绿色 (<60%) → 黄色 (60-80%) → 红色 (>80%)
 *
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 * @param windowSize - 上下文窗口大小
 */
export function printTokenBar(inputTokens: number, outputTokens: number, windowSize: number): void {
  const total = inputTokens + outputTokens;
  const pct = windowSize > 0 ? Math.round((total / windowSize) * 100) : 0;
  const barLen = 30;
  const filled = Math.round((Math.min(pct, 100) / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  const color = pct > 80 ? chalk.red : pct > 60 ? chalk.yellow : chalk.green;
  console.log(chalk.dim(`  Tokens: [${color(bar)}] ${pct}% (${total.toLocaleString()}/${windowSize.toLocaleString()})`));
}

/**
 * 打印压缩通知
 *
 * 当上下文压缩触发时，显示压缩级别和释放的 token 数量。
 *
 * @param level - 压缩级别 (snip/micro/auto)
 * @param tokensFreed - 释放的 token 数量
 */
export function printCompactNotification(level: string, tokensFreed: number): void {
  console.log(chalk.dim(`  📦 Compacted (${level}): ~${tokensFreed.toLocaleString()} tokens freed`));
}


/**
 * 打印缓存统计信息
 *
 * 显示 Prompt Cache 命中率和累计缓存 token 数。
 * 用于 /cost 命令输出。
 *
 * @param stats - 缓存统计摘要
 */
export function printCacheStats(stats: CacheStats): void {
  console.log(chalk.cyan(`Cache hit rate: ${stats.hitRate}%`));
  console.log(chalk.cyan(
    `Cache tokens: ${stats.totalCached.toLocaleString()} read + ${stats.totalCreated.toLocaleString()} created`,
  ));
}
