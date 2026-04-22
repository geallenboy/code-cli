/**
 * 工具结果渲染器
 *
 * 实现语法高亮 + 行号 + 截断逻辑，用于格式化工具执行结果。
 *
 * 功能：
 * - 根据文件扩展名使用 cli-highlight 高亮代码内容
 * - 在每行前添加右对齐的行号
 * - 超过 maxLines 行时显示前 headLines 行 + 折叠指示器 + 最后 tailLines 行
 * - 文件路径使用 chalk.underline.cyan() 渲染
 */

import chalk from 'chalk';
import { highlight } from 'cli-highlight';

/** 工具结果渲染选项 */
export interface ToolResultRendererOptions {
  /** 最大显示行数，默认 50 */
  maxLines?: number;
  /** 头部保留行数，默认 30 */
  headLines?: number;
  /** 尾部保留行数，默认 10 */
  tailLines?: number;
}

/** 文件扩展名到语言的映射 */
const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.md': 'markdown',
  '.toml': 'ini',
  '.ini': 'ini',
  '.dockerfile': 'dockerfile',
  '.lua': 'lua',
  '.r': 'r',
  '.php': 'php',
  '.pl': 'perl',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.clj': 'clojure',
  '.vim': 'vim',
  '.tf': 'hcl',
};

/**
 * 从文件路径中提取语言标识
 */
export function detectLanguage(filePath: string): string | undefined {
  // Handle special filenames first
  const basename = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';

  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return undefined;
  const ext = filePath.slice(lastDot).toLowerCase();

  return EXT_TO_LANG[ext];
}

/**
 * 为内容添加行号
 *
 * @param lines - 内容行数组
 * @param startLineNum - 起始行号（1-based）
 * @param totalLines - 总行数（用于计算行号宽度）
 * @returns 带行号的行数组
 */
export function addLineNumbers(
  lines: string[],
  startLineNum: number,
  totalLines: number,
): string[] {
  const width = String(totalLines).length;
  return lines.map((line, i) => {
    const lineNum = String(startLineNum + i).padStart(width, ' ');
    return `${chalk.dim(lineNum)} ${chalk.dim('│')} ${line}`;
  });
}

/**
 * 对内容应用语法高亮
 *
 * @param content - 代码内容
 * @param language - 语言标识
 * @returns 高亮后的内容
 */
export function highlightContent(content: string, language?: string): string {
  if (!language) return content;
  try {
    return highlight(content, { language });
  } catch {
    // 不识别的语言，回退到无高亮
    return content;
  }
}

/**
 * 渲染工具结果
 *
 * @param toolName - 工具名称
 * @param result - 工具执行结果文本
 * @param filePath - 可选的文件路径（用于语法高亮和路径样式）
 * @param options - 渲染选项
 * @returns 格式化的结果字符串
 */
export function renderToolResult(
  toolName: string,
  result: string,
  filePath?: string,
  options?: ToolResultRendererOptions,
): string {
  const maxLines = options?.maxLines ?? 50;
  const headLines = options?.headLines ?? 30;
  const tailLines = options?.tailLines ?? 10;

  const outputParts: string[] = [];

  // 文件路径样式
  if (filePath) {
    outputParts.push(chalk.underline.cyan(filePath));
  }

  // 检测语言并高亮
  const language = filePath ? detectLanguage(filePath) : undefined;
  const highlighted = highlightContent(result, language);
  const allLines = highlighted.split('\n');
  const totalLines = allLines.length;

  if (totalLines <= maxLines) {
    // 不需要截断：显示所有行带行号
    const numbered = addLineNumbers(allLines, 1, totalLines);
    outputParts.push(numbered.join('\n'));
  } else {
    // 需要截断：显示前 headLines + 折叠指示器 + 最后 tailLines
    const head = allLines.slice(0, headLines);
    const tail = allLines.slice(totalLines - tailLines);
    const hiddenCount = totalLines - headLines - tailLines;

    const headNumbered = addLineNumbers(head, 1, totalLines);
    const tailNumbered = addLineNumbers(tail, totalLines - tailLines + 1, totalLines);

    outputParts.push(headNumbered.join('\n'));
    outputParts.push(chalk.dim(`  ... ${hiddenCount} lines hidden ...`));
    outputParts.push(tailNumbered.join('\n'));
  }

  return outputParts.join('\n');
}
