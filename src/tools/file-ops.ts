/**
 * 文件操作工具集
 *
 * 提供文件读取（带行号）、递归内容搜索和 glob 文件列表功能。
 * 这些是 Agent 理解代码库的基础能力。
 *
 * 参考 Claude Code: src/tools/FileReadTool/ + src/tools/GrepTool/ + src/tools/GlobTool/
 * 简化：纯文本读取（不支持图片/PDF），系统 grep（不用 ripgrep）
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * 读取文件内容，每行添加行号前缀
 *
 * 行号格式为右对齐，使用 ` | ` 分隔符。
 * 文件不存在或读取失败时返回错误消息字符串（不抛出异常）。
 *
 * @param filePath - 文件路径
 * @returns 带行号的文件内容，或错误消息
 */
export function readFileContent(filePath: string): string {
  try {
    if (!existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const maxLineNumWidth = String(lines.length).length;

    return lines
      .map((line, index) => {
        const lineNum = String(index + 1).padStart(maxLineNumWidth, ' ');
        return `${lineNum} | ${line}`;
      })
      .join('\n');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error reading file ${filePath}: ${message}`;
  }
}

/** 默认排除的目录 */
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '__pycache__']);

/** grep 结果最大行数 */
const MAX_GREP_LINES = 100;

/** list_files 结果最大数量 */
const MAX_LIST_FILES = 200;

/**
 * 递归搜索文件内容，返回匹配行（最多 100 行）。
 *
 * 使用系统 grep 命令实现（Claude Code 使用 ripgrep）。
 * 排除 node_modules、.git 等目录。
 *
 * @param pattern - 搜索模式（正则表达式）
 * @param searchPath - 搜索路径（默认当前目录）
 * @param include - 文件名过滤模式（如 "*.ts"）
 * @returns 匹配结果，格式为 "文件路径:行号:内容"
 */
export function grepSearch(
  pattern: string,
  searchPath?: string,
  include?: string,
): string {
  try {
    const dir = searchPath ?? process.cwd();
    if (!existsSync(dir)) {
      return `Error: Directory not found: ${dir}`;
    }

    // Build grep command with exclusions
    const excludeArgs = Array.from(EXCLUDED_DIRS)
      .map((d) => `--exclude-dir=${d}`)
      .join(' ');
    const includeArg = include ? `--include="${include}"` : '';

    const cmd = `grep -rn ${excludeArgs} ${includeArg} -- ${JSON.stringify(pattern)} ${JSON.stringify(dir)}`;

    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = result.trim().split('\n').filter(Boolean);

    if (lines.length > MAX_GREP_LINES) {
      const omitted = lines.length - MAX_GREP_LINES;
      return lines.slice(0, MAX_GREP_LINES).join('\n') +
        `\n\n... (${omitted} more matches omitted, ${lines.length} total)`;
    }

    return lines.length > 0 ? lines.join('\n') : 'No matches found.';
  } catch (error: unknown) {
    // grep returns exit code 1 when no matches found — that's not an error
    if (error instanceof Error && 'status' in error && (error as { status: number }).status === 1) {
      return 'No matches found.';
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Error searching: ${message}`;
  }
}

/**
 * 递归收集目录中的文件路径，排除指定目录。
 */
function collectFiles(dir: string, basePath: string, results: string[], maxCount: number): void {
  if (results.length >= maxCount) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // Permission denied or other error — skip
  }

  for (const entry of entries) {
    if (results.length >= maxCount) return;
    if (EXCLUDED_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectFiles(fullPath, basePath, results, maxCount);
      } else if (stat.isFile()) {
        results.push(relative(basePath, fullPath));
      }
    } catch {
      // Skip files we can't stat
    }
  }
}

/**
 * 列出目录中的文件（最多 200 个，排除 node_modules/.git 等）。
 *
 * 如果 pattern 包含通配符，使用简单的后缀匹配过滤。
 * 否则列出指定目录下的所有文件。
 *
 * @param pattern - 文件模式（如 "*.ts"）或目录路径
 * @param basePath - 基础路径（默认当前目录）
 * @returns 匹配的文件路径列表
 */
export function listFiles(
  pattern: string,
  basePath?: string,
): string {
  try {
    const dir = basePath ?? process.cwd();
    if (!existsSync(dir)) {
      return `Error: Directory not found: ${dir}`;
    }

    const results: string[] = [];
    collectFiles(dir, dir, results, MAX_LIST_FILES + 1); // Collect one extra to detect overflow

    // Apply pattern filter if it looks like a glob (contains * or .)
    let filtered = results;
    if (pattern && pattern !== '.' && pattern !== '*') {
      // Simple suffix matching: "*.ts" → endsWith(".ts")
      const suffix = pattern.startsWith('*') ? pattern.slice(1) : null;
      if (suffix) {
        filtered = results.filter((f) => f.endsWith(suffix));
      } else {
        // Treat as substring match
        filtered = results.filter((f) => f.includes(pattern));
      }
    }

    if (filtered.length === 0) {
      return 'No files found.';
    }

    if (filtered.length > MAX_LIST_FILES) {
      const omitted = filtered.length - MAX_LIST_FILES;
      return filtered.slice(0, MAX_LIST_FILES).join('\n') +
        `\n\n... (${omitted} more files omitted, showing first ${MAX_LIST_FILES})`;
    }

    return filtered.join('\n');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error listing files: ${message}`;
  }
}
