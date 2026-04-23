/**
 * 工具调用面板组件
 *
 * 使用 Ink Box 渲染带边框的工具调用信息。
 * 需求 7：工具调用面板组件
 *
 * - 显示工具图标、名称和参数
 * - 使用 Ink Box 组件实现 Flexbox 布局，自动适应终端宽度
 * - 参数值超过 80 字符时截断并附加省略号
 * - 为不同工具显示对应图标
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * 工具名称到图标的映射表。
 * 需求 7.4：为不同工具显示对应的图标
 */
export const TOOL_ICONS: Record<string, string> = {
  read_file: '📖',
  write_file: '✏️',
  edit_file: '🔧',
  run_shell: '💻',
  grep_search: '🔍',
  list_files: '📁',
  web_search: '🌐',
  task_complete: '✅',
  ask_user: '💬',
};

/** 参数值截断阈值（字符数） */
const PARAM_TRUNCATE_LIMIT = 80;

/**
 * 截断字符串到指定长度，超出部分附加省略号。
 * 需求 7.3：参数值超过 80 个字符时截断显示并附加省略号
 *
 * @param value - 原始字符串
 * @param maxLength - 最大长度，默认 80
 * @returns 截断后的字符串
 */
export function truncateParam(value: string, maxLength: number = PARAM_TRUNCATE_LIMIT): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + '…';
}

/**
 * 获取工具对应的图标。
 * 未知工具返回默认图标 🔧。
 *
 * @param toolName - 工具名称
 * @returns 图标字符串
 */
export function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] ?? '🔧';
}

/**
 * 将参数值转换为可显示的字符串。
 * 处理各种类型：字符串、数字、布尔、null、undefined、对象、数组。
 *
 * @param value - 参数值
 * @returns 字符串表示
 */
export function formatParamValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface ToolCallPanelProps {
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  input?: Record<string, unknown>;
}

/**
 * 工具调用面板组件。
 *
 * 需求 7.1：渲染带边框的工具调用面板，显示工具图标、名称和参数
 * 需求 7.2：使用 Ink Box 组件实现 Flexbox 布局，自动适应终端宽度
 * 需求 7.3：参数值超过 80 个字符时截断显示并附加省略号
 * 需求 7.4：为不同工具显示对应的图标
 */
export function ToolCallPanel({ toolName, input }: ToolCallPanelProps) {
  const icon = getToolIcon(toolName);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginLeft={1}
      width="100%"
    >
      <Box flexDirection="row">
        <Text color="yellow" bold>
          {icon} {toolName}
        </Text>
      </Box>
      {input &&
        Object.entries(input).map(([key, value]) => {
          const formatted = formatParamValue(value);
          const truncated = truncateParam(formatted);
          return (
            <Box key={key} flexDirection="row">
              <Text dimColor>
                {key}: {truncated}
              </Text>
            </Box>
          );
        })}
    </Box>
  );
}
