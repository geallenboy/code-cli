/**
 * 流式 Markdown 增量渲染组件
 *
 * 核心策略：
 * 1. 将 Markdown 文本按块（段落/标题/代码块/列表）拆分
 * 2. 维护单调递增的稳定前缀边界：已关闭的块为稳定块
 * 3. 稳定前缀使用 React.memo 跳过重渲染
 * 4. 未关闭的代码块作为不稳定后缀持续更新
 * 5. 代码块关闭后一次性渲染带边框 + 语法高亮
 *
 * 需求 5：流式 Markdown 增量渲染组件
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { highlight, supportsLanguage } from 'cli-highlight';

// ─── ANSI escape codes ───
const BOLD = '\x1b[1m';
const UNDERLINE = '\x1b[4m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// ─── Block types ───

interface TextBlock {
  type: 'text';
  /** Raw Markdown lines (without code fence) */
  lines: string[];
}

interface CodeBlock {
  type: 'code';
  lang: string;
  lines: string[];
  closed: boolean;
}

type Block = TextBlock | CodeBlock;

// ─── Markdown line renderer (reuses logic from markdown.ts) ───

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

// ─── Block parsing ───

/**
 * Parse Markdown text into a sequence of blocks.
 * A block is either a text block (paragraphs, headers, lists)
 * or a code block (fenced with ```).
 *
 * The last code block may be unclosed (closed === false) during streaming.
 */
export function parseBlocks(content: string): Block[] {
  if (!content) return [];

  const lines = content.split('\n');
  const blocks: Block[] = [];
  let currentTextLines: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('```')) {
      if (!inCode) {
        // Flush accumulated text lines as a text block
        if (currentTextLines.length > 0) {
          blocks.push({ type: 'text', lines: currentTextLines });
          currentTextLines = [];
        }
        // Start code block
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        codeLines = [];
      } else {
        // Close code block
        inCode = false;
        blocks.push({ type: 'code', lang: codeLang, lines: codeLines, closed: true });
        codeLang = '';
        codeLines = [];
      }
    } else if (inCode) {
      codeLines.push(line);
    } else {
      currentTextLines.push(line);
    }
  }

  // Flush remaining
  if (inCode) {
    // Unclosed code block — unstable
    blocks.push({ type: 'code', lang: codeLang, lines: codeLines, closed: false });
  } else if (currentTextLines.length > 0) {
    blocks.push({ type: 'text', lines: currentTextLines });
  }

  return blocks;
}

/**
 * Compute the stable prefix boundary.
 *
 * Stable blocks are all blocks up to (but not including) the last block,
 * UNLESS the last block is a closed code block — then all blocks are stable.
 *
 * During streaming, the last block is typically unstable (either an unclosed
 * code block or a text block that may still receive more content).
 *
 * Returns the index of the first unstable block (i.e., stableBlocks = blocks[0..boundary)).
 */
export function computeStableBoundary(blocks: Block[]): number {
  if (blocks.length === 0) return 0;

  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock) return 0;

  // If the last block is an unclosed code block, everything before it is stable
  if (lastBlock.type === 'code' && !lastBlock.closed) {
    return blocks.length - 1;
  }

  // If the last block is a text block, it might still receive more content
  // during streaming, so it's unstable. Everything before it is stable.
  // Exception: if there's only one block, nothing is stable yet.
  if (blocks.length <= 1) return 0;

  return blocks.length - 1;
}

// ─── Block rendering ───

/**
 * Render a text block to ANSI-formatted string.
 */
function renderTextBlock(block: TextBlock): string {
  return block.lines.map(renderLine).join('\n');
}

/**
 * Render a closed code block with box border and syntax highlighting.
 * Uses cli-highlight for syntax highlighting and Unicode box drawing for borders.
 */
function renderCodeBlockWithBorder(block: CodeBlock): string {
  const lang = block.lang || 'code';
  const code = block.lines.join('\n').replace(/\t/g, '  ');

  // Syntax highlight
  let highlighted: string;
  if (lang !== 'code' && supportsLanguage(lang)) {
    try {
      highlighted = highlight(code, { language: lang });
    } catch {
      highlighted = code
        .split('\n')
        .map((line) => chalk.dim(line))
        .join('\n');
    }
  } else {
    highlighted = code
      .split('\n')
      .map((line) => chalk.dim(line))
      .join('\n');
  }

  const codeLines = highlighted.split('\n');
  const width = process.stdout.columns || 80;
  const innerWidth = width - 2;
  const padding = 1;
  const contentWidth = innerWidth - padding * 2;
  const pad = ' '.repeat(padding);

  if (contentWidth < 1) {
    return [lang, ...codeLines].join('\n');
  }

  const output: string[] = [];

  // Top border: ╭─ lang ─────╮
  const headerVisWidth = lang.length;
  const headerSpace = innerWidth - 2 - headerVisWidth;
  if (headerSpace < 1) {
    const remaining = Math.max(0, innerWidth - 4);
    output.push(
      chalk.dim('╭─ ') + chalk.bold(lang.slice(0, remaining)) + chalk.dim(' ╮'),
    );
  } else {
    output.push(
      chalk.dim('╭─ ') + chalk.bold(lang) + chalk.dim(' ' + '─'.repeat(headerSpace - 1) + '╮'),
    );
  }

  // Content lines
  for (const line of codeLines) {
    // Truncate and pad to content width
    const padded = padToWidth(truncateToWidth(line, contentWidth), contentWidth);
    output.push(chalk.dim('│') + pad + padded + pad + chalk.dim('│'));
  }

  // Empty box body if no lines
  if (codeLines.length === 0) {
    output.push(chalk.dim('│') + ' '.repeat(innerWidth) + chalk.dim('│'));
  }

  // Bottom border
  output.push(chalk.dim('╰' + '─'.repeat(innerWidth) + '╯'));

  return output.join('\n');
}

/**
 * Render an unclosed (in-progress) code block.
 * Shows the content with dim styling and a "streaming..." indicator.
 */
function renderUnstableCodeBlock(block: CodeBlock): string {
  const lang = block.lang || 'code';
  const code = block.lines.join('\n');
  const dimCode = code
    .split('\n')
    .map((line) => chalk.dim(line))
    .join('\n');

  return chalk.dim(`\`\`\`${lang}`) + (dimCode ? '\n' + dimCode : '');
}

/**
 * Render a single block to ANSI string.
 */
function renderBlock(block: Block): string {
  if (block.type === 'text') {
    return renderTextBlock(block);
  }
  // Code block
  if (block.closed) {
    return renderCodeBlockWithBorder(block);
  }
  return renderUnstableCodeBlock(block);
}

// ─── Utility: ANSI-aware string helpers ───

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleWidth(str: string): number {
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    const cp = char.codePointAt(0);
    if (cp !== undefined && cp >= 0x4e00 && cp <= 0x9fff) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function truncateToWidth(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (visibleWidth(str) <= maxWidth) return str;

  const ellipsis = '...';
  const targetWidth = maxWidth - 3;
  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[[0-9;]*m/g;
  let result = '';
  let currentWidth = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const segments: Array<{ type: 'text'; text: string } | { type: 'ansi'; text: string }> = [];
  ansiRegex.lastIndex = 0;

  while ((match = ansiRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: str.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'ansi', text: match[0] });
    lastIndex = ansiRegex.lastIndex;
  }
  if (lastIndex < str.length) {
    segments.push({ type: 'text', text: str.slice(lastIndex) });
  }

  for (const seg of segments) {
    if (seg.type === 'ansi') {
      result += seg.text;
      continue;
    }
    for (const char of seg.text) {
      const cp = char.codePointAt(0);
      const charWidth = cp !== undefined && cp >= 0x4e00 && cp <= 0x9fff ? 2 : 1;
      if (currentWidth + charWidth > targetWidth) {
        return result + ellipsis + '\x1b[0m';
      }
      result += char;
      currentWidth += charWidth;
    }
  }

  return result + ellipsis + '\x1b[0m';
}

function padToWidth(str: string, targetWidth: number): string {
  const currentWidth = visibleWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - currentWidth);
}

// ─── Printer: serialize blocks back to Markdown ───

/**
 * Serialize parsed blocks back to valid Markdown text.
 * Satisfies requirement 5.5: StreamingText_Printer.
 */
export function printBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.lines.join('\n');
      }
      // Code block
      const fence = '```' + block.lang;
      const body = block.lines.join('\n');
      if (block.closed) {
        return fence + '\n' + body + '\n```';
      }
      // Unclosed code block — no closing fence
      return fence + (body ? '\n' + body : '');
    })
    .join('\n');
}

// ─── React Components ───

interface StablePrefixProps {
  /** Pre-rendered ANSI string for the stable prefix */
  rendered: string;
}

/**
 * Memoized component for the stable prefix.
 * Only re-renders when the rendered string changes.
 * Since the stable boundary monotonically increases, this string
 * only changes when new blocks become stable (appended).
 */
const StablePrefix = React.memo(function StablePrefix({ rendered }: StablePrefixProps) {
  if (!rendered) return null;
  return <Text>{rendered}</Text>;
});

interface StreamingTextProps {
  content: string;
}

/**
 * 流式 Markdown 增量渲染组件。
 *
 * 将 content 拆分为稳定前缀和不稳定后缀：
 * - 稳定前缀：已完成的块（关闭的代码块、完整段落），使用 memo 跳过重渲染
 * - 不稳定后缀：最后一个块（可能是未关闭的代码块或正在输入的段落）
 *
 * 代码块在关闭后一次性渲染带边框 + 语法高亮。
 */
export const StreamingText = React.memo(function StreamingText({ content }: StreamingTextProps) {
  // Parse content into blocks
  const blocks = useMemo(() => parseBlocks(content), [content]);

  // Compute stable boundary
  const boundary = useMemo(() => computeStableBoundary(blocks), [blocks]);

  // Render stable prefix (memoized — only changes when boundary advances)
  const stableRendered = useMemo(() => {
    if (boundary === 0) return '';
    const stableBlocks = blocks.slice(0, boundary);
    return stableBlocks.map(renderBlock).join('\n');
  }, [blocks, boundary]);

  // Render unstable suffix (re-rendered on every content change)
  const unstableRendered = useMemo(() => {
    const unstableBlocks = blocks.slice(boundary);
    if (unstableBlocks.length === 0) return '';
    return unstableBlocks.map(renderBlock).join('\n');
  }, [blocks, boundary]);

  if (!stableRendered && !unstableRendered) return null;

  return (
    <Box flexDirection="column">
      <StablePrefix rendered={stableRendered} />
      {unstableRendered && <Text>{unstableRendered}</Text>}
    </Box>
  );
});
