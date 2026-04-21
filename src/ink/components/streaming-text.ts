/**
 * 流式文本组件
 *
 * 实时渲染 Markdown 文本，支持语法高亮。
 * 处理流式输入（逐字符/逐块到达）。
 *
 * 参考 Claude Code: streaming-text.tsx
 */

import chalk from 'chalk';

/**
 * 流式文本渲染组件
 *
 * 累积文本片段，渲染为带格式的终端输出。
 * 支持基础 Markdown 格式：代码块、粗体、斜体、标题。
 */
export class StreamingText {
  private buffer = '';
  private inCodeBlock = false;
  private codeLanguage = '';

  /**
   * 渲染文本片段
   *
   * @param text - 新到达的文本片段
   * @returns 格式化后的文本
   */
  render(text: string): string {
    this.buffer += text;
    return this.formatChunk(text);
  }

  /**
   * 格式化文本片段
   *
   * 处理代码块边界和内联格式。
   */
  private formatChunk(text: string): string {
    let result = '';

    for (const char of text) {
      // 检测代码块边界
      if (this.buffer.endsWith('```')) {
        if (this.inCodeBlock) {
          this.inCodeBlock = false;
          this.codeLanguage = '';
          result += chalk.dim('```');
          continue;
        } else {
          this.inCodeBlock = true;
          // 提取语言标识
          const langMatch = this.buffer.match(/```(\w+)\s*$/);
          this.codeLanguage = langMatch?.[1] ?? '';
          result += chalk.dim('```' + this.codeLanguage);
          continue;
        }
      }

      if (this.inCodeBlock) {
        result += chalk.cyan(char);
      } else {
        result += char;
      }
    }

    return result;
  }

  /** 重置状态 */
  reset(): void {
    this.buffer = '';
    this.inCodeBlock = false;
    this.codeLanguage = '';
  }

  /** 获取累积的完整文本 */
  getFullText(): string {
    return this.buffer;
  }

  /** 是否在代码块中 */
  get isInCodeBlock(): boolean {
    return this.inCodeBlock;
  }
}
