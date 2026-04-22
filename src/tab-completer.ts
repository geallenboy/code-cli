/**
 * Tab 文件路径补全
 *
 * 纯逻辑模块：根据部分路径输入匹配文件系统中的文件和目录。
 * 支持单一匹配自动补全和多匹配公共前缀补全。
 * 排除 node_modules、.git、dist 等目录。
 *
 * 参考设计文档：P2 Tab 补全
 */

import { readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, sep } from 'node:path';

/** 默认排除的目录名 */
const DEFAULT_EXCLUDES = new Set(['node_modules', '.git', 'dist', '.DS_Store']);

/** 补全结果 */
export interface CompletionResult {
  /** 补全后的完整文本（替换光标前的部分路径） */
  completed: string;
  /** 匹配的候选列表（用于多匹配时显示） */
  candidates: string[];
}

/**
 * 从输入文本中提取光标前的部分路径 token。
 *
 * 取光标前最后一个空白字符之后的文本作为路径 token。
 */
export function extractPathToken(text: string, cursorCol: number): string {
  const before = text.slice(0, cursorCol);
  // Find the last whitespace boundary
  const lastSpace = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t'));
  return before.slice(lastSpace + 1);
}

/**
 * 列出目录中的文件和子目录，排除默认忽略项。
 *
 * @param dir - 要列出的目录路径
 * @param excludes - 要排除的名称集合
 * @returns 文件/目录名列表，目录名以 / 结尾
 */
export function listEntries(dir: string, excludes: Set<string> = DEFAULT_EXCLUDES): string[] {
  try {
    const entries = readdirSync(dir);
    const result: string[] = [];
    for (const entry of entries) {
      if (excludes.has(entry)) continue;
      try {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        result.push(stat.isDirectory() ? entry + sep : entry);
      } catch {
        // Skip entries we can't stat
        result.push(entry);
      }
    }
    return result.sort();
  } catch {
    return [];
  }
}

/**
 * 计算多个字符串的最长公共前缀。
 */
export function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];

  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}

/**
 * 执行 Tab 补全。
 *
 * @param partialPath - 用户输入的部分路径
 * @param cwd - 当前工作目录
 * @param excludes - 要排除的名称集合
 * @returns 补全结果，如果无匹配则返回 null
 */
export function completeFilePath(
  partialPath: string,
  cwd: string,
  excludes: Set<string> = DEFAULT_EXCLUDES,
): CompletionResult | null {
  if (partialPath === '') {
    // List cwd entries
    const entries = listEntries(cwd, excludes);
    if (entries.length === 0) return null;
    return { completed: longestCommonPrefix(entries), candidates: entries };
  }

  // Determine the directory to search and the prefix to match
  const dir = dirname(partialPath);
  const prefix = basename(partialPath);
  const searchDir = join(cwd, dir === '.' ? '' : dir);

  const entries = listEntries(searchDir, excludes);
  const matches = entries.filter((e) => e.startsWith(prefix));

  if (matches.length === 0) return null;

  if (matches.length === 1) {
    // Single match: auto-complete inline
    const completed = dir === '.' ? matches[0] : join(dir, matches[0]);
    return { completed, candidates: matches };
  }

  // Multiple matches: complete common prefix
  const common = longestCommonPrefix(matches);
  const completed = dir === '.' ? common : join(dir, common);
  return { completed, candidates: matches };
}

/**
 * 处理 Tab 键按下事件。
 *
 * 从当前输入行和光标位置提取部分路径，执行补全，
 * 返回更新后的行文本和新光标位置。
 *
 * @param line - 当前输入行文本
 * @param cursorCol - 光标列位置
 * @param cwd - 当前工作目录
 * @returns 更新后的行和光标位置，以及候选列表；无匹配时返回 null
 */
export function handleTabCompletion(
  line: string,
  cursorCol: number,
  cwd: string,
): { line: string; cursorCol: number; candidates: string[] } | null {
  const token = extractPathToken(line, cursorCol);
  const result = completeFilePath(token, cwd);
  if (!result) return null;

  // Replace the token in the line with the completed text
  const before = line.slice(0, cursorCol - token.length);
  const after = line.slice(cursorCol);
  const newLine = before + result.completed + after;
  const newCol = before.length + result.completed.length;

  return { line: newLine, cursorCol: newCol, candidates: result.candidates };
}
