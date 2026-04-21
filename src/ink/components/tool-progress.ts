/**
 * 工具进度组件
 *
 * 显示工具执行进度：工具名、耗时、spinner。
 * 支持嵌套显示（子 Agent 工具缩进）。
 *
 * 参考 Claude Code: tool-progress.tsx
 */

import chalk from 'chalk';

/** 工具进度状态 */
export interface ToolProgressState {
  /** 工具名称 */
  toolName: string;
  /** 执行状态 */
  status: 'running' | 'completed' | 'failed';
  /** 耗时（ms） */
  elapsed?: number;
  /** 嵌套深度（0 = 顶层） */
  depth?: number;
  /** 输入参数摘要 */
  inputSummary?: string;
  /** 结果摘要 */
  resultSummary?: string;
}

/** Spinner 帧 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 工具进度渲染组件
 *
 * 渲染工具执行进度指示器：
 * - 运行中：spinner + 工具名 + 耗时
 * - 完成：✅ + 工具名 + 耗时
 * - 失败：❌ + 工具名 + 错误
 * - 嵌套：缩进显示子 Agent 工具
 */
export class ToolProgress {
  private frameIndex = 0;

  /**
   * 渲染工具进度
   *
   * @param state - 工具进度状态
   * @returns 格式化的进度文本
   */
  render(state: ToolProgressState): string {
    const indent = '  '.repeat(state.depth ?? 0);
    const elapsed = state.elapsed ? chalk.dim(` (${this.formatElapsed(state.elapsed)})`) : '';

    switch (state.status) {
      case 'running': {
        const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
        this.frameIndex++;
        const input = state.inputSummary ? chalk.dim(` — ${state.inputSummary}`) : '';
        return `${indent}${chalk.cyan(frame)} ${chalk.white(state.toolName)}${input}${elapsed}`;
      }
      case 'completed': {
        const result = state.resultSummary ? chalk.dim(` — ${state.resultSummary}`) : '';
        return `${indent}${chalk.green('✅')} ${chalk.white(state.toolName)}${result}${elapsed}`;
      }
      case 'failed': {
        const result = state.resultSummary ? chalk.dim(` — ${state.resultSummary}`) : '';
        return `${indent}${chalk.red('❌')} ${chalk.white(state.toolName)}${result}${elapsed}`;
      }
    }
  }

  /**
   * 渲染多个工具的进度列表
   *
   * @param states - 工具进度状态列表
   * @returns 格式化的进度列表
   */
  renderList(states: ToolProgressState[]): string {
    return states.map(s => this.render(s)).join('\n');
  }

  /**
   * 格式化耗时
   */
  private formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  /** 重置 spinner 帧 */
  reset(): void {
    this.frameIndex = 0;
  }
}
