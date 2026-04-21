/**
 * Diff 渲染器
 *
 * 基于 `diff` 库的 `structuredPatch` 实现 git-diff 风格的终端渲染。
 * 支持行号显示、上下文行、红绿着色、截断逻辑和新文件处理。
 *
 * 设计参考：design.md P0 Diff 渲染器章节
 */

import { structuredPatch } from 'diff';

// ANSI escape codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Diff 渲染器选项
 */
export interface DiffRendererOptions {
  /** 上下文行数，默认 3 */
  contextLines?: number;
  /** 最大显示行数，默认 80 */
  maxLines?: number;
}

/**
 * 渲染两段文本之间的 diff，以 git-diff 风格输出带 ANSI 颜色的字符串。
 *
 * 输出格式：
 * - 文件头：📝 filepath
 * - Hunk 头：@@ -oldStart,oldLines +newStart,newLines @@
 * - 上下文行（未修改）：dim 样式，带行号
 * - 删除行：红色，- 前缀，带行号
 * - 新增行：绿色，+ 前缀，带行号
 *
 * 当输出超过 maxLines 行时截断，并显示变更摘要。
 * 当旧内容为空时（新文件），所有行显示为绿色新增。
 *
 * @param oldContent - 原始文件内容
 * @param newContent - 修改后的文件内容
 * @param filePath - 文件路径（用于头部显示）
 * @param options - 渲染选项
 * @returns 带 ANSI 颜色的 diff 字符串
 */
export function renderEnhancedDiff(
  oldContent: string,
  newContent: string,
  filePath: string,
  options?: DiffRendererOptions,
): string {
  const contextLines = options?.contextLines ?? 3;
  const maxLines = options?.maxLines ?? 80;

  // Identical content — no changes
  if (oldContent === newContent) {
    return [
      `📝 ${filePath}`,
      `${DIM}(no changes)${RESET}`,
    ].join('\n');
  }

  const patch = structuredPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    oldContent,
    newContent,
    '',
    '',
    { context: contextLines },
  );

  // Count total additions and deletions across all hunks
  let totalAdded = 0;
  let totalRemoved = 0;
  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) totalAdded++;
      else if (line.startsWith('-')) totalRemoved++;
    }
  }

  // Build output lines
  const output: string[] = [];
  output.push(`📝 ${filePath}`);

  for (const hunk of patch.hunks) {
    // Hunk header
    output.push(
      `${DIM}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${RESET}`,
    );

    let oldLineNum = hunk.oldStart;
    let newLineNum = hunk.newStart;

    // Calculate the max line number width for right-alignment
    const maxOldLine = hunk.oldStart + hunk.oldLines;
    const maxNewLine = hunk.newStart + hunk.newLines;
    const oldWidth = String(maxOldLine).length;
    const newWidth = String(maxNewLine).length;

    for (const line of hunk.lines) {
      // Skip the "\ No newline at end of file" marker
      if (line.startsWith('\\')) {
        continue;
      }

      const content = line.slice(1); // Remove the leading +/- /space

      if (line.startsWith('-')) {
        // Removed line — red
        const oldNum = String(oldLineNum).padStart(oldWidth);
        const newPad = ' '.repeat(newWidth);
        output.push(`${RED}${oldNum} ${newPad} - ${content}${RESET}`);
        oldLineNum++;
      } else if (line.startsWith('+')) {
        // Added line — green
        const oldPad = ' '.repeat(oldWidth);
        const newNum = String(newLineNum).padStart(newWidth);
        output.push(`${GREEN}${oldPad} ${newNum} + ${content}${RESET}`);
        newLineNum++;
      } else {
        // Context line — dim
        const oldNum = String(oldLineNum).padStart(oldWidth);
        const newNum = String(newLineNum).padStart(newWidth);
        output.push(`${DIM}${oldNum} ${newNum}   ${content}${RESET}`);
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  // Truncation logic: if output exceeds maxLines, truncate and add summary
  if (output.length > maxLines) {
    const truncated = output.slice(0, maxLines - 1);
    truncated.push(
      `${DIM}... (truncated) +${totalAdded} -${totalRemoved} lines changed${RESET}`,
    );
    return truncated.join('\n');
  }

  // Add summary line
  output.push(`${DIM} +${totalAdded} -${totalRemoved} lines changed${RESET}`);

  return output.join('\n');
}
