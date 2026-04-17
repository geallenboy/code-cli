/**
 * Search-and-Replace 编辑器
 *
 * 基于 search-and-replace 的精确文件编辑，通过唯一性约束防止幻觉写入。
 * 核心原则：最小破坏性、可验证性、抗幻觉。
 *
 * 参考 Claude Code: src/tools/FileEditTool/ (14 步验证管线)
 * 简化：核心的唯一性约束 + 精确匹配
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 执行 search-and-replace 编辑
 *
 * 1. old_string 未找到 → 返回错误
 * 2. old_string 出现多次 → 返回错误，要求更多上下文
 * 3. old_string 唯一匹配 → 替换为 new_string
 *
 * @param filePath - 文件路径
 * @param oldString - 要替换的原始字符串
 * @param newString - 替换后的新字符串
 * @returns 操作结果描述
 */
export function editFile(
  _filePath: string,
  _oldString: string,
  _newString: string,
): string {
  // TODO: Phase 2 — 实现 search-and-replace 编辑
  return '';
}

/**
 * 创建或覆写文件（自动创建缺失的父目录）
 *
 * 写入成功时返回包含文件路径和行数的成功消息。
 * 写入失败时返回错误消息字符串（不抛出异常）。
 *
 * @param filePath - 文件路径
 * @param content - 文件内容
 * @returns 操作结果描述
 */
export function writeFile(filePath: string, content: string): string {
  try {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    const lines = content.split('\n').length;
    return `File written: ${filePath} (${lines} lines)`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error writing file ${filePath}: ${message}`;
  }
}
