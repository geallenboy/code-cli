/**
 * 状态栏组件
 *
 * 需求 12：状态栏组件
 *
 * - 渲染状态行，显示 token 总量、估算成本和耗时
 * - 自适应格式：token（<1K 原数字，≥1K X.YK，≥1M X.YM），成本（>$0.50 保留 2 位，≤$0.50 保留 4 位）
 * - API 调用次数 > 0 时额外显示平均 API 响应时间
 * - 使用 Ink Box 居中显示，用 ─ 字符填充两侧
 */

import React from 'react';
import { Box, Text } from 'ink';
import { formatTokenCount, formatCost } from '../box.js';
import { formatElapsed } from './ToolResultPanel.js';

export interface StatusBarProps {
  /** 输入 token 数量 */
  inputTokens: number;
  /** 输出 token 数量 */
  outputTokens: number;
  /** 本轮耗时（毫秒） */
  elapsed: number;
  /** API 调用次数 */
  apiCallCount?: number;
  /** API 总响应时间（毫秒） */
  totalApiTime?: number;
}

/**
 * 构建状态栏显示文本。
 *
 * 需求 12.1：显示 token 总量、估算成本和耗时
 * 需求 12.2：自适应格式
 * 需求 12.3：API 调用次数 > 0 时显示平均 API 响应时间
 *
 * @returns 状态文本部分数组，用 " · " 连接
 */
export function buildStatusParts(props: StatusBarProps): string[] {
  const { inputTokens, outputTokens, elapsed, apiCallCount = 0, totalApiTime = 0 } = props;

  const total = inputTokens + outputTokens;
  const tokens = formatTokenCount(total);
  const cost = formatCost((inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15);
  const time = (elapsed / 1000).toFixed(1);

  const parts = [`${tokens} tokens`, cost, `${time}s`];

  // 需求 12.3：API 调用次数 > 0 时显示平均 API 响应时间
  if (apiCallCount > 0 && totalApiTime > 0) {
    const avgTime = totalApiTime / apiCallCount;
    parts.push(`avg ${formatElapsed(avgTime)}/call`);
  }

  return parts;
}

/**
 * 构建居中填充行。
 *
 * 需求 12.4：居中显示并用 ─ 字符填充两侧
 *
 * @param content - 中间内容文本
 * @param width - 终端宽度
 * @returns { left, right } 左右填充的 ─ 字符串
 */
export function buildFillLine(content: string, width: number): { left: string; right: string } {
  const contentWidth = content.length + 2; // +2 for spaces around content
  const totalFill = Math.max(0, width - contentWidth);
  const leftFill = Math.floor(totalFill / 2);
  const rightFill = totalFill - leftFill;
  return {
    left: '─'.repeat(leftFill),
    right: '─'.repeat(rightFill),
  };
}

/**
 * 状态栏组件。
 *
 * 需求 12.1：一轮对话处理完成时渲染状态行
 * 需求 12.4：使用 Ink Box 居中显示，用 ─ 字符填充两侧
 */
export function StatusBar(props: StatusBarProps) {
  const { inputTokens, outputTokens } = props;
  const total = inputTokens + outputTokens;
  if (total === 0) return null;

  const parts = buildStatusParts(props);
  const content = parts.join(' · ');

  return (
    <Box justifyContent="center" marginY={0}>
      <Text dimColor>─── {content} ───</Text>
    </Box>
  );
}
