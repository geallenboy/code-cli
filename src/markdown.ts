/**
 * 终端 Markdown 渲染器
 *
 * 将 Markdown 文本转换为带 ANSI 转义码的终端友好格式。
 * 支持 headers、bold、inline code、code blocks、lists。
 *
 * 提供两种模式：
 * 1. 批量模式：renderMarkdown(text) — 一次性渲染完整文本（向后兼容）
 * 2. 流式模式：StreamingMarkdownRenderer — 逐 chunk 增量渲染
 *
 * 同时提供简单的 diff 渲染功能，用于 edit_file 时显示变更。
 *
 * 代码块语法高亮使用 cli-highlight（基于 highlight.js）。
 */

import chalk from 'chalk';
import { renderEnhancedDiff } from './diff-renderer.js';
import { renderCodeBlock as renderCodeBlockBox } from './box.js';

// ANSI escape codes
const BOLD = '\x1b[1m';
const UNDERLINE = '\x1b[4m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

/**
 * Get terminal color capability level.
 * Returns chalk's detected color level:
 * 0 = no color, 1 = basic 16 colors, 2 = 256 colors, 3 = TrueColor
 *
 * Used internally to determine rendering strategy.
 */
export function getColorLevel(): number {
  return chalk.level;
}

/**
 * Render a single line of Markdown to ANSI-formatted text.
 * Handles headers, bold, inline code, and list items.
 */
function renderLine(line: string): string {
  let result = line;

  // Headers (must be at start of line)
  if (/^### (.+)$/.test(result)) {
    result = result.replace(/^### (.+)$/, `${BOLD}$1${RESET}`);
  } else if (/^## (.+)$/.test(result)) {
    result = result.replace(/^## (.+)$/, `${BOLD}${UNDERLINE}$1${RESET}`);
  } else if (/^# (.+)$/.test(result)) {
    result = result.replace(/^# (.+)$/, `${BOLD}${UNDERLINE}${CYAN}$1${RESET}`);
  } else {
    // List items: - or * at start of line
    const listMatch = result.match(/^(\s*)([-*])\s+(.*)$/);
    if (listMatch) {
      const [, indent, , content] = listMatch;
      // Render inline formatting within list item content
      let formatted = content ?? '';
      formatted = formatted.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
      formatted = formatted.replace(/`([^`]+)`/g, `${YELLOW}$1${RESET}`);
      result = `${indent ?? ''}  • ${formatted}`;
    } else {
      // Bold: **text**
      result = result.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
      // Inline code: `text`
      result = result.replace(/`([^`]+)`/g, `${YELLOW}$1${RESET}`);
    }
  }

  return result;
}

/**
 * Render Markdown text for terminal display using ANSI escape codes.
 *
 * Supports:
 * - # h1 → bold + underline + cyan
 * - ## h2 → bold + underline
 * - ### h3 → bold
 * - **bold** → bold
 * - `code` → yellow
 * - ```code blocks``` → syntax highlighted (or dim fallback)
 * - - list items → indented with bullet
 *
 * @param text - Markdown text to render
 * @returns Text with ANSI escape codes
 */
export function renderMarkdown(text: string): string {
  if (text === '') return '';

  const renderer = new StreamingMarkdownRenderer();
  const result = renderer.push(text) + renderer.flush();
  return result;
}

/**
 * Render a simple diff between old and new content.
 *
 * Shows removed lines in red and added lines in green,
 * in a git diff-like format.
 *
 * This is a compatibility wrapper that delegates to the enhanced
 * DiffRenderer in src/diff-renderer.ts.
 *
 * @param oldContent - Original file content
 * @param newContent - Modified file content
 * @param filePath - File path for the diff header
 * @returns Formatted diff string with ANSI colors
 */
export function renderDiff(oldContent: string, newContent: string, filePath: string): string {
  return renderEnhancedDiff(oldContent, newContent, filePath);
}

/**
 * 流式 Markdown 渲染器
 *
 * 支持逐 chunk 增量渲染 Markdown 文本。
 * 策略：缓冲行，完整行立即渲染，不完整行暂存。
 * 代码块在关闭时一次性使用 cli-highlight 高亮。
 */
export class StreamingMarkdownRenderer {
  /** Accumulated text buffer (incomplete line at the end) */
  private buffer = '';
  /** Whether we are currently inside a fenced code block */
  private inCodeBlock = false;
  /** Language identifier for the current code block */
  private codeBlockLang = '';
  /** Accumulated code block content lines */
  private codeBlockLines: string[] = [];
  /** Number of lines already rendered */
  private renderedLines = 0;

  /**
   * Push a new text chunk into the renderer.
   * Returns ANSI-formatted text that can be immediately written to stdout.
   * Incomplete lines are buffered until the next push or flush.
   *
   * @param chunk - New text fragment from the stream
   * @returns Rendered ANSI string ready for output (may be empty)
   */
  push(chunk: string): string {
    this.buffer += chunk;
    return this.processBuffer(false);
  }

  /**
   * Flush all remaining buffered content.
   * Call this when the stream ends to render any incomplete trailing line.
   *
   * @returns Rendered ANSI string for remaining content
   */
  flush(): string {
    return this.processBuffer(true);
  }

  /**
   * Reset the renderer to its initial state.
   */
  reset(): void {
    this.buffer = '';
    this.inCodeBlock = false;
    this.codeBlockLang = '';
    this.codeBlockLines = [];
    this.renderedLines = 0;
  }

  /**
   * Process the buffer, rendering complete lines.
   * When flushing, also renders the last incomplete line.
   */
  private processBuffer(isFlushing: boolean): string {
    const output: string[] = [];
    const lines = this.buffer.split('\n');

    // If not flushing, the last element is the incomplete line — keep it in buffer
    const completeLines = isFlushing ? lines : lines.slice(0, -1);
    this.buffer = isFlushing ? '' : (lines[lines.length - 1] ?? '');

    for (const line of completeLines) {
      const rendered = this.processLine(line);
      if (rendered !== null) {
        output.push(rendered);
      }
    }

    // Join with newlines, but only add separator between rendered lines
    if (output.length === 0) return '';

    // Add newline prefix if we've already rendered lines before
    const prefix = this.renderedLines > 0 ? '\n' : '';
    this.renderedLines += output.length;
    return prefix + output.join('\n');
  }

  /**
   * Process a single complete line.
   * Returns the rendered line, or null if the line is being accumulated
   * (e.g., inside a code block that hasn't closed yet).
   */
  private processLine(line: string): string | null {
    const trimmed = line.trimStart();

    // Check for code block fence
    if (trimmed.startsWith('```')) {
      if (!this.inCodeBlock) {
        // Opening fence — extract language
        this.inCodeBlock = true;
        this.codeBlockLang = trimmed.slice(3).trim();
        this.codeBlockLines = [];
        return null; // Don't render the opening fence yet
      } else {
        // Closing fence — render the accumulated code block with box border
        this.inCodeBlock = false;
        const code = this.codeBlockLines.join('\n');
        const lang = this.codeBlockLang || 'code';
        this.codeBlockLang = '';
        this.codeBlockLines = [];
        return renderCodeBlockBox(lang, code);
      }
    }

    // Inside code block — accumulate
    if (this.inCodeBlock) {
      this.codeBlockLines.push(line);
      return null;
    }

    // Regular line — render inline formatting
    return renderLine(line);
  }
}
