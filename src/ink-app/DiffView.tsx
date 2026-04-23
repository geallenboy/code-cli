/**
 * Diff 视图组件
 *
 * 需求 9：文件编辑差异视图组件
 *
 * - 渲染删除行（红色）和新增行（绿色）的差异视图
 * - 显示 3 行上下文（与 git diff 一致）
 * - 显示行号和文件路径头部信息
 * - 复用 renderEnhancedDiff 的差异计算逻辑（structuredPatch），仅替换渲染层为 React 组件
 */

import React from 'react';
import { Box, Text } from 'ink';
import { structuredPatch } from 'diff';

export interface DiffViewProps {
  /** 原始文件内容 */
  oldContent: string;
  /** 修改后的文件内容 */
  newContent: string;
  /** 文件路径 */
  filePath: string;
  /** 上下文行数，默认 3 */
  contextLines?: number;
}

/**
 * 表示 diff 输出中的一行。
 */
export interface DiffLine {
  /** 行类型：context（上下文）、added（新增）、removed（删除） */
  type: 'context' | 'added' | 'removed';
  /** 行内容（不含前缀符号） */
  content: string;
  /** 旧文件行号（removed 和 context 行有值） */
  oldLineNum?: number;
  /** 新文件行号（added 和 context 行有值） */
  newLineNum?: number;
}

/**
 * 表示一个 diff hunk（变更块）。
 */
export interface DiffHunk {
  /** Hunk 头部信息 */
  header: string;
  /** Hunk 中的行 */
  lines: DiffLine[];
}

/**
 * 计算两段文本之间的结构化 diff。
 *
 * 复用 renderEnhancedDiff 中相同的 structuredPatch 逻辑，
 * 返回结构化数据而非 ANSI 字符串，供 React 组件渲染。
 *
 * @param oldContent - 原始文件内容
 * @param newContent - 修改后的文件内容
 * @param filePath - 文件路径
 * @param contextLines - 上下文行数，默认 3
 * @returns 结构化 diff 数据
 */
export function computeDiffHunks(
  oldContent: string,
  newContent: string,
  filePath: string,
  contextLines: number = 3,
): { hunks: DiffHunk[]; totalAdded: number; totalRemoved: number } {
  const patch = structuredPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    oldContent,
    newContent,
    '',
    '',
    { context: contextLines },
  );

  let totalAdded = 0;
  let totalRemoved = 0;

  const hunks: DiffHunk[] = patch.hunks.map((hunk) => {
    const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    const lines: DiffLine[] = [];

    let oldLineNum = hunk.oldStart;
    let newLineNum = hunk.newStart;

    for (const line of hunk.lines) {
      // Skip the "\ No newline at end of file" marker
      if (line.startsWith('\\')) {
        continue;
      }

      const content = line.slice(1); // Remove the leading +/- /space

      if (line.startsWith('-')) {
        totalRemoved++;
        lines.push({
          type: 'removed',
          content,
          oldLineNum,
        });
        oldLineNum++;
      } else if (line.startsWith('+')) {
        totalAdded++;
        lines.push({
          type: 'added',
          content,
          newLineNum,
        });
        newLineNum++;
      } else {
        lines.push({
          type: 'context',
          content,
          oldLineNum,
          newLineNum,
        });
        oldLineNum++;
        newLineNum++;
      }
    }

    return { header, lines };
  });

  return { hunks, totalAdded, totalRemoved };
}

/**
 * 格式化行号显示。
 *
 * @param num - 行号（undefined 时显示空白）
 * @param width - 对齐宽度
 * @returns 格式化后的行号字符串
 */
export function formatLineNum(num: number | undefined, width: number): string {
  if (num == null) {
    return ' '.repeat(width);
  }
  return String(num).padStart(width);
}

/**
 * Diff 视图组件。
 *
 * 需求 9.1：渲染删除行（红色）和新增行（绿色）的差异视图
 * 需求 9.2：显示 3 行上下文（与 git diff 一致）
 * 需求 9.3：显示行号和文件路径头部信息
 * 需求 9.4：复用 renderEnhancedDiff 的差异计算逻辑
 */
export function DiffView({ oldContent, newContent, filePath, contextLines = 3 }: DiffViewProps) {
  // Identical content — no changes
  if (oldContent === newContent) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <Text>📝 {filePath}</Text>
        <Text dimColor>(no changes)</Text>
      </Box>
    );
  }

  const { hunks, totalAdded, totalRemoved } = computeDiffHunks(
    oldContent,
    newContent,
    filePath,
    contextLines,
  );

  // Calculate max line number widths for alignment across all hunks
  let maxOldLine = 0;
  let maxNewLine = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.oldLineNum != null && line.oldLineNum > maxOldLine) {
        maxOldLine = line.oldLineNum;
      }
      if (line.newLineNum != null && line.newLineNum > maxNewLine) {
        maxNewLine = line.newLineNum;
      }
    }
  }
  const oldWidth = Math.max(String(maxOldLine).length, 1);
  const newWidth = Math.max(String(maxNewLine).length, 1);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* File path header */}
      <Text bold>📝 {filePath}</Text>

      {hunks.map((hunk, hunkIdx) => (
        <Box key={hunkIdx} flexDirection="column">
          {/* Hunk header */}
          <Text dimColor>{hunk.header}</Text>

          {/* Diff lines */}
          {hunk.lines.map((line, lineIdx) => {
            const oldNum = formatLineNum(line.oldLineNum, oldWidth);
            const newNum = formatLineNum(line.newLineNum, newWidth);

            if (line.type === 'removed') {
              return (
                <Text key={lineIdx} color="red">
                  {oldNum} {newNum} - {line.content}
                </Text>
              );
            }
            if (line.type === 'added') {
              return (
                <Text key={lineIdx} color="green">
                  {oldNum} {newNum} + {line.content}
                </Text>
              );
            }
            // context
            return (
              <Text key={lineIdx} dimColor>
                {oldNum} {newNum}   {line.content}
              </Text>
            );
          })}
        </Box>
      ))}

      {/* Summary line */}
      <Text dimColor> +{totalAdded} -{totalRemoved} lines changed</Text>
    </Box>
  );
}
