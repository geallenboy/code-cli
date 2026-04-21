/**
 * Spinner 组件
 *
 * 终端 spinner 动画，显示加载状态。
 * 支持多种样式。
 *
 * 参考 Claude Code: spinner.tsx
 */

import chalk from 'chalk';

/** Spinner 样式 */
export type SpinnerStyle = 'dots' | 'line' | 'arrow' | 'bounce';

/** 各样式的帧序列 */
const SPINNER_STYLES: Record<SpinnerStyle, string[]> = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['-', '\\', '|', '/'],
  arrow: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  bounce: ['⠁', '⠂', '⠄', '⠂'],
};

/**
 * Spinner 组件
 *
 * 渲染终端 spinner 动画。
 */
export class InkSpinner {
  private frameIndex = 0;
  private style: SpinnerStyle;

  constructor(style: SpinnerStyle = 'dots') {
    this.style = style;
  }

  /**
   * 渲染 spinner 帧
   *
   * @param message - 显示消息
   * @returns 格式化的 spinner 文本
   */
  render(message: string): string {
    const frames = SPINNER_STYLES[this.style];
    const frame = frames[this.frameIndex % frames.length];
    this.frameIndex++;
    return `${chalk.cyan(frame)} ${message}`;
  }

  /**
   * 获取当前帧（不递增）
   */
  currentFrame(): string {
    const frames = SPINNER_STYLES[this.style];
    return frames[this.frameIndex % frames.length];
  }

  /** 设置样式 */
  setStyle(style: SpinnerStyle): void {
    this.style = style;
    this.frameIndex = 0;
  }

  /** 重置帧计数 */
  reset(): void {
    this.frameIndex = 0;
  }

  /** 获取当前样式 */
  getStyle(): SpinnerStyle {
    return this.style;
  }
}
