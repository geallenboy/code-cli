/**
 * 工具结果面板组件
 *
 * 需求 8：工具结果面板组件
 *
 * - 成功显示 ✅ 图标，失败显示 ❌ 图标
 * - 使用 cli-highlight 进行语法高亮渲染
 * - 显示工具执行耗时（ms/s/m 自适应格式）
 * - 以 "Error" 或 "Exit code:" 开头的结果自动识别为错误
 */

import React from 'react';
import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';

export interface ToolResultPanelProps {
  /** 工具名称 */
  toolName: string;
  /** 工具执行结果文本 */
  result: string;
  /** 工具执行耗时（毫秒） */
  elapsed?: number;
  /** 是否为错误结果（外部显式指定） */
  isError?: boolean;
}

/**
 * 检测结果文本是否为错误。
 *
 * 需求 8.4：以 "Error" 或 "Exit code:" 开头的结果识别为错误
 *
 * @param text - 结果文本
 * @returns 是否为错误
 */
export function detectError(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('Error') || trimmed.startsWith('Exit code:');
}

/**
 * 格式化耗时为自适应字符串。
 *
 * 需求 8.3：ms/s/m 自适应格式
 * - < 1000ms → "Xms"
 * - < 60s → "X.Ys"
 * - >= 60s → "Xm Ys"
 *
 * @param ms - 耗时（毫秒）
 * @returns 格式化字符串
 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

/**
 * 尝试对内容进行语法高亮。
 *
 * 需求 8.2：使用 cli-highlight 进行语法高亮渲染
 *
 * @param content - 代码内容
 * @returns 高亮后的内容（失败时返回原文）
 */
export function tryHighlight(content: string): string {
  try {
    return highlight(content, { ignoreIllegals: true });
  } catch {
    return content;
  }
}

/**
 * 工具结果面板组件。
 *
 * 需求 8.1：成功显示 ✅，失败显示 ❌
 * 需求 8.2：代码内容使用 cli-highlight 语法高亮
 * 需求 8.3：显示工具执行耗时（自适应格式）
 * 需求 8.4：自动检测错误结果并使用红色样式
 */
export function ToolResultPanel({ toolName, result, elapsed, isError }: ToolResultPanelProps) {
  const hasError = isError ?? detectError(result);
  const icon = hasError ? '❌' : '✅';
  const timeStr = elapsed != null ? ` (${formatElapsed(elapsed)})` : '';

  // Apply syntax highlighting to result content
  const highlightedResult = result ? tryHighlight(result) : '';

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box flexDirection="row">
        <Text color={hasError ? 'red' : 'green'}>
          {icon} {toolName}
        </Text>
        <Text dimColor>{timeStr}</Text>
      </Box>
      {result && (
        <Box marginLeft={2} flexDirection="column">
          <Text color={hasError ? 'red' : undefined}>{highlightedResult}</Text>
        </Box>
      )}
    </Box>
  );
}
