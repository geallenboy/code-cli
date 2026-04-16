/**
 * 文件操作工具集
 *
 * 提供文件读取（带行号）、递归内容搜索和 glob 文件列表功能。
 * 这些是 Agent 理解代码库的基础能力。
 *
 * 参考 Claude Code: src/tools/FileReadTool/ + src/tools/GrepTool/ + src/tools/GlobTool/
 * 简化：纯文本读取（不支持图片/PDF），系统 grep（不用 ripgrep）
 */

import { readFileSync, existsSync } from 'node:fs';

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

/**
 * 递归搜索文件内容，返回匹配行（最多 100 行）
 * @param pattern - 搜索模式
 * @param searchPath - 搜索路径（默认当前目录）
 * @param include - 文件过滤模式
 * @returns 匹配结果
 */
export function grepSearch(
  _pattern: string,
  _searchPath?: string,
  _include?: string,
): string {
  // TODO: Phase 2 — 实现 grep 搜索
  return '';
}

/**
 * glob 模式匹配文件列表（最多 200 个，排除 node_modules/.git）
 * @param pattern - glob 模式
 * @param basePath - 基础路径
 * @returns 匹配的文件路径列表
 */
export async function listFiles(
  _pattern: string,
  _basePath?: string,
): Promise<string> {
  // TODO: Phase 2 — 实现文件列表
  return '';
}
