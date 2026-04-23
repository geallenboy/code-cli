/**
 * 搜索栏组件
 *
 * 需求 18：搜索高亮
 *
 * - 显示搜索输入框
 * - 显示匹配数量
 * - Escape 退出搜索模式
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

interface SearchBarProps {
  /** 当前搜索关键词 */
  query: string;
  /** 匹配总数 */
  matchCount: number;
  /** 搜索关键词变更回调 */
  onQueryChange: (query: string) => void;
  /** 关闭搜索回调 */
  onClose: () => void;
}

/**
 * 搜索栏组件。
 *
 * 需求 18.1：显示搜索输入框并进入搜索模式
 * 需求 18.3：实时更新高亮匹配结果
 * 需求 18.4：Escape 退出搜索模式
 */
export function SearchBar({ query, matchCount, onQueryChange, onClose }: SearchBarProps) {
  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }

    if (key.backspace || key.delete) {
      onQueryChange(query.slice(0, -1));
      return;
    }

    // Ignore control keys
    if (key.ctrl || key.meta || key.return || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return;
    }

    // Append printable character
    if (input && input.length > 0) {
      onQueryChange(query + input);
    }
  });

  return (
    <Box marginLeft={1}>
      <Text color="yellow">🔍 Search: </Text>
      <Text>{query}</Text>
      <Text color="cyan">█</Text>
      {query.length > 0 && (
        <Text dimColor> ({matchCount} match{matchCount !== 1 ? 'es' : ''})</Text>
      )}
      <Text dimColor>  [Esc to close]</Text>
    </Box>
  );
}
