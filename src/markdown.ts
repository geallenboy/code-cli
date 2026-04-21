/**
 * 终端 Markdown 渲染器
 *
 * 将 Markdown 文本转换为带 ANSI 转义码的终端友好格式。
 * 支持 headers、bold、inline code、code blocks、lists。
 *
 * 同时提供简单的 diff 渲染功能，用于 edit_file 时显示变更。
 *
 * 参考 Claude Code: src/screens/ (React + Ink 组件)
 * 简化：纯 ANSI 转义码
 */

// ANSI escape codes
const BOLD = '\x1b[1m';
const UNDERLINE = '\x1b[4m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Render Markdown text for terminal display using ANSI escape codes.
 *
 * Supports:
 * - # h1 → bold + underline + cyan
 * - ## h2 → bold + underline
 * - ### h3 → bold
 * - **bold** → bold
 * - `code` → yellow
 * - ```code blocks``` → dim
 * - - list items → indented with bullet
 *
 * @param text - Markdown text to render
 * @returns Text with ANSI escape codes
 */
export function renderMarkdown(text: string): string {
  let inCodeBlock = false;
  const lines = text.split('\n');
  const rendered: string[] = [];

  for (const line of lines) {
    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      rendered.push(`${DIM}${line}${RESET}`);
      continue;
    }

    // Inside code block — dim
    if (inCodeBlock) {
      rendered.push(`${DIM}${line}${RESET}`);
      continue;
    }

    let result = line;

    // Headers (must be at start of line)
    if (/^### (.+)$/.test(result)) {
      result = result.replace(/^### (.+)$/, `${BOLD}$1${RESET}`);
    } else if (/^## (.+)$/.test(result)) {
      result = result.replace(/^## (.+)$/, `${BOLD}${UNDERLINE}$1${RESET}`);
    } else if (/^# (.+)$/.test(result)) {
      result = result.replace(/^# (.+)$/, `${BOLD}${UNDERLINE}${CYAN}$1${RESET}`);
    } else {
      // Bold: **text**
      result = result.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
      // Inline code: `text`
      result = result.replace(/`([^`]+)`/g, `${YELLOW}$1${RESET}`);
    }

    rendered.push(result);
  }

  return rendered.join('\n');
}

/**
 * Render a simple diff between old and new content.
 *
 * Shows removed lines in red and added lines in green,
 * in a git diff-like format.
 *
 * @param oldContent - Original file content
 * @param newContent - Modified file content
 * @param filePath - File path for the diff header
 * @returns Formatted diff string with ANSI colors
 */
export function renderDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const output: string[] = [
    `${DIM}--- a/${filePath}${RESET}`,
    `${DIM}+++ b/${filePath}${RESET}`,
  ];

  // Simple line-by-line comparison
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  for (const line of oldLines) {
    if (!newSet.has(line)) {
      output.push(`${RED}- ${line}${RESET}`);
    }
  }
  for (const line of newLines) {
    if (!oldSet.has(line)) {
      output.push(`${GREEN}+ ${line}${RESET}`);
    }
  }

  if (output.length === 2) {
    output.push(`${DIM}(no changes)${RESET}`);
  }

  return output.join('\n');
}
