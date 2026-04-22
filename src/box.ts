/**
 * Box Drawing 渲染模块
 *
 * 纯函数工具模块，提供 Unicode Box Drawing 字符边框渲染。
 * 所有函数签名为 (输入数据) → ANSI 字符串，无副作用。
 *
 * 边框字符：╭(U+256D) ╮(U+256E) ╰(U+2570) ╯(U+256F) │(U+2502) ─(U+2500)
 */

import chalk from 'chalk';
import { highlight, supportsLanguage } from 'cli-highlight';

/** Box 渲染选项 */
export interface BoxOptions {
  /** 边框宽度，默认 process.stdout.columns 或 80 */
  width?: number;
  /** 内容左侧内边距，默认 1 */
  padding?: number;
  /** 头部图标 */
  icon?: string;
  /** 头部样式函数（chalk） */
  headerStyle?: (s: string) => string;
}

/**
 * 剥离 ANSI SGR 转义序列，返回可见文本。
 *
 * @param str - 可能包含 ANSI 码的字符串
 * @returns 纯文本
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * 判断字符是否为 CJK 双宽字符。
 *
 * 检查 Unicode 码点范围：
 * - U+4E00-U+9FFF: CJK 统一表意文字
 * - U+3000-U+303F: CJK 符号和标点
 * - U+FF00-U+FFEF: 全角形式
 * - U+3400-U+4DBF: CJK 统一表意文字扩展 A
 */
function isCJK(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf)
  );
}

/**
 * 计算字符串的可见宽度（终端列数）。
 *
 * - 剥离 ANSI 转义码
 * - CJK 字符计为 2 列
 * - 其他字符计为 1 列
 *
 * @param str - 输入字符串
 * @returns 可见宽度（列数）
 */
export function visibleWidth(str: string): number {
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    const cp = char.codePointAt(0);
    if (cp !== undefined && isCJK(cp)) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * 将字符串截断到指定可见宽度，超出部分替换为 "..."。
 *
 * 正确处理 ANSI 转义码：保留截断范围内的 ANSI 码，
 * 并在末尾添加 RESET 确保不泄漏样式。
 *
 * @param str - 输入字符串
 * @param maxWidth - 最大可见宽度
 * @returns 截断后的字符串
 */
export function truncateToWidth(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (visibleWidth(str) <= maxWidth) return str;

  const ellipsis = '...';
  const ellipsisWidth = 3;
  const targetWidth = maxWidth - ellipsisWidth;
  if (targetWidth <= 0) return ellipsis.slice(0, maxWidth);

  // Walk through the string preserving ANSI codes
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[[0-9;]*m/g;
  let result = '';
  let currentWidth = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Collect all ANSI sequences and their positions
  const segments: Array<{ type: 'text'; text: string } | { type: 'ansi'; text: string }> = [];
  const original = str;
  ansiRegex.lastIndex = 0;

  while ((match = ansiRegex.exec(original)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: original.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'ansi', text: match[0] });
    lastIndex = ansiRegex.lastIndex;
  }
  if (lastIndex < original.length) {
    segments.push({ type: 'text', text: original.slice(lastIndex) });
  }

  for (const seg of segments) {
    if (seg.type === 'ansi') {
      result += seg.text;
      continue;
    }
    // Text segment — iterate character by character
    for (const char of seg.text) {
      const cp = char.codePointAt(0);
      const charWidth = cp !== undefined && isCJK(cp) ? 2 : 1;
      if (currentWidth + charWidth > targetWidth) {
        return result + ellipsis + '\x1b[0m';
      }
      result += char;
      currentWidth += charWidth;
    }
  }

  return result + ellipsis + '\x1b[0m';
}

/**
 * 将字符串右侧补空格到指定可见宽度。
 *
 * @param str - 输入字符串
 * @param targetWidth - 目标宽度
 * @returns 填充后的字符串
 */
export function padToWidth(str: string, targetWidth: number): string {
  const currentWidth = visibleWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - currentWidth);
}

/**
 * 渲染带边框的文本块。纯函数。
 *
 * 输出格式：
 *   ╭─ header ──────────────────╮
 *   │  line 1                   │
 *   │  line 2                   │
 *   ╰──────────────────────────╯
 *
 * @param header - 头部文本
 * @param lines - 内容行数组
 * @param options - 渲染选项
 * @returns 带 ANSI 颜色的边框文本
 */
export function renderBox(header: string, lines: string[], options?: BoxOptions): string {
  const width = options?.width ?? (process.stdout.columns || 80);
  const padding = options?.padding ?? 1;
  const headerStyle = options?.headerStyle ?? ((s: string) => s);

  // Inner width = total width - 2 (for │ on each side)
  const innerWidth = width - 2;
  // Content width = inner width - padding on each side
  const contentWidth = innerWidth - padding * 2;

  if (contentWidth < 1) {
    // Too narrow for box, return plain text
    return [header, ...lines].join('\n');
  }

  const pad = ' '.repeat(padding);
  const output: string[] = [];

  // Top border: ╭─ header ─────╮
  const headerVisWidth = visibleWidth(header);
  const headerSpace = innerWidth - 2 - headerVisWidth; // 2 for "─ " before header
  if (headerSpace < 1) {
    // Header too long, truncate
    const truncatedHeader = truncateToWidth(header, innerWidth - 4);
    const truncatedVisWidth = visibleWidth(truncatedHeader);
    const remaining = innerWidth - 2 - truncatedVisWidth;
    output.push(
      chalk.dim('╭─ ') +
        headerStyle(truncatedHeader) +
        chalk.dim(' ' + '─'.repeat(Math.max(0, remaining - 1)) + '╮'),
    );
  } else {
    output.push(
      chalk.dim('╭─ ') +
        headerStyle(header) +
        chalk.dim(' ' + '─'.repeat(headerSpace - 1) + '╮'),
    );
  }

  // Content lines
  for (const line of lines) {
    const truncated = truncateToWidth(line, contentWidth);
    const padded = padToWidth(truncated, contentWidth);
    output.push(chalk.dim('│') + pad + padded + pad + chalk.dim('│'));
  }

  // If no lines, render empty box body
  if (lines.length === 0) {
    const emptyLine = ' '.repeat(innerWidth);
    output.push(chalk.dim('│') + emptyLine + chalk.dim('│'));
  }

  // Bottom border: ╰──────────────╯
  output.push(chalk.dim('╰' + '─'.repeat(innerWidth) + '╯'));

  return output.join('\n');
}

/**
 * 渲染带边框的代码块。纯函数。
 *
 * Tab 扩展为 2 空格，使用 cli-highlight 语法高亮，
 * 然后用 renderBox 包裹。
 *
 * @param language - 语言标签（如 "typescript"），空字符串时默认 "code"
 * @param code - 代码内容
 * @param options - 渲染选项
 * @returns 带 ANSI 颜色和语法高亮的边框代码块
 */
export function renderCodeBlock(language: string, code: string, options?: BoxOptions): string {
  const lang = language || 'code';

  // Tab → 2 spaces
  const expandedCode = code.replace(/\t/g, '  ');

  // Syntax highlight
  let highlighted: string;
  if (lang !== 'code' && supportsLanguage(lang)) {
    try {
      highlighted = highlight(expandedCode, { language: lang });
    } catch {
      highlighted = expandedCode
        .split('\n')
        .map((line) => chalk.dim(line))
        .join('\n');
    }
  } else {
    highlighted = expandedCode
      .split('\n')
      .map((line) => chalk.dim(line))
      .join('\n');
  }

  const codeLines = highlighted.split('\n');
  return renderBox(lang, codeLines, options);
}

/**
 * 渲染状态行。纯函数。
 *
 * 输出格式：
 *   ─── 1.2K tokens · $0.0012 · 3.2s ───
 *
 * @param parts - 状态项数组
 * @param width - 终端宽度
 * @returns 带 ANSI dim 样式的状态行
 */
export function renderStatusLine(parts: string[], width?: number): string {
  const w = width ?? (process.stdout.columns || 80);
  const content = parts.join(' · ');
  const contentWidth = visibleWidth(content);

  // Content + 2 spaces (one on each side) exceeds width — truncate and pad
  if (contentWidth + 2 > w) {
    const truncated = truncateToWidth(content, w);
    return chalk.dim(padToWidth(truncated, w));
  }

  // Fill remaining space with ─ on both sides
  const totalFill = w - contentWidth - 2;
  const leftFill = Math.floor(totalFill / 2);
  const rightFill = totalFill - leftFill;
  // Use dim for fill characters but slightly brighter (gray) for content text
  // so the status info stands out from the decorative line
  return chalk.dim('─'.repeat(leftFill)) + ' ' + chalk.gray(content) + ' ' + chalk.dim('─'.repeat(rightFill));
}

/**
 * 渲染水平分隔线。纯函数。
 *
 * 使用 ─ 字符填充至指定宽度，dim 样式。
 *
 * @param width - 终端宽度
 * @returns 带 ANSI dim 样式的分隔线
 */
export function renderSeparator(width?: number): string {
  const w = width ?? (process.stdout.columns || 80);
  return chalk.dim('─'.repeat(w));
}

/**
 * 格式化 token 数量为人类可读格式。
 *
 * < 1000 → 原数字字符串
 * ≥ 1000 → X.YK
 * ≥ 1000000 → X.YM
 *
 * @param count - token 数量
 * @returns 格式化后的字符串
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return (count / 1_000_000).toFixed(1) + 'M';
}

/**
 * 格式化成本，根据金额自动选择精度。
 *
 * > $0.50 → 2 位小数（$1.23）
 * ≤ $0.50 → 4 位小数（$0.0012）
 *
 * @param cost - 成本金额
 * @returns 格式化后的字符串
 */
export function formatCost(cost: number): string {
  if (cost > 0.50) {
    return '$' + cost.toFixed(2);
  }
  return '$' + cost.toFixed(4);
}
