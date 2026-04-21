/**
 * Search-and-Replace 编辑器
 *
 * 基于 search-and-replace 的精确文件编辑，通过唯一性约束防止幻觉写入。
 * 核心原则：最小破坏性、可验证性、抗幻觉。
 *
 * 参考 Claude Code: src/tools/FileEditTool/ (14 步验证管线)
 * 简化：核心的唯一性约束 + 精确匹配
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderEnhancedDiff } from '../diff-renderer.js';

/**
 * 执行 search-and-replace 编辑
 *
 * 三种情况：
 * 1. old_string 未找到 → 返回错误消息
 * 2. old_string 出现多次 → 返回错误消息，要求提供更多上下文
 * 3. old_string 唯一匹配 → 替换为 new_string，写回文件
 *
 * 设计理念（参考 Claude Code）：
 * - 位置无关：不依赖行号，多轮编辑不会错位
 * - 抗幻觉：old_string 必须真实存在于文件中
 * - 最小破坏：只改需要改的部分
 *
 * @param filePath - 文件路径
 * @param oldString - 要替换的原始字符串（必须精确匹配）
 * @param newString - 替换后的新字符串
 * @returns 操作结果描述
 */
export function editFile(
  filePath: string,
  oldString: string,
  newString: string,
): string {
  try {
    if (!existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    const content = readFileSync(filePath, 'utf-8');

    // Count occurrences
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const index = content.indexOf(oldString, searchFrom);
      if (index === -1) break;
      count++;
      searchFrom = index + 1;
    }

    if (count === 0) {
      return `Error: old_string not found in ${filePath}. Make sure the string matches exactly, including whitespace and indentation.`;
    }

    if (count > 1) {
      return `Error: old_string found ${count} times in ${filePath}. Please provide more context to make the match unique.`;
    }

    // Exactly one match — perform replacement
    const newContent = content.replace(oldString, newString);
    writeFileSync(filePath, newContent, 'utf-8');

    // Render diff output
    const diffOutput = renderEnhancedDiff(content, newContent, filePath);
    console.log(diffOutput);

    // Calculate what changed for the success message
    const oldLines = oldString.split('\n').length;
    const newLines = newString.split('\n').length;
    return `File edited: ${filePath} (replaced ${oldLines} line${oldLines > 1 ? 's' : ''} with ${newLines} line${newLines > 1 ? 's' : ''})`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error editing file ${filePath}: ${message}`;
  }
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

    // Render diff output (new file: empty old content)
    const diffOutput = renderEnhancedDiff('', content, filePath);
    console.log(diffOutput);

    const lines = content.split('\n').length;
    return `File written: ${filePath} (${lines} lines)`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error writing file ${filePath}: ${message}`;
  }
}
