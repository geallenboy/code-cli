/**
 * 搜索 Hook
 *
 * 需求 18：搜索高亮
 *
 * - Ctrl+F 进入搜索模式
 * - 实时高亮匹配关键词
 * - Escape 退出搜索模式
 *
 * 导出纯函数用于测试：highlightMatches, countMatches
 */

import { useState, useCallback } from 'react';
import type { ChatMessage } from './types.js';

/** 高亮匹配结果片段 */
export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/**
 * 转义正则表达式特殊字符。
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * 将文本按搜索关键词拆分为高亮片段。
 *
 * 需求 18.2：在所有可见消息中高亮显示匹配的关键词
 *
 * @param text - 原始文本
 * @param query - 搜索关键词（大小写不敏感）
 * @returns 高亮片段数组
 */
export function highlightMatches(text: string, query: string): HighlightSegment[] {
  if (!query || !text) {
    return [{ text: text || '', isMatch: false }];
  }

  const escaped = escapeRegex(query);
  const regex = new RegExp(escaped, 'gi');
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add non-matching text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isMatch: false });
    }
    // Add the matching text
    segments.push({ text: match[0], isMatch: true });
    lastIndex = regex.lastIndex;

    // Prevent infinite loop on zero-length matches
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMatch: false });
  }

  // If no matches found, return the whole text as non-matching
  if (segments.length === 0) {
    return [{ text, isMatch: false }];
  }

  return segments;
}

/**
 * 统计消息列表中匹配关键词的总数。
 *
 * 需求 18.3：实时更新高亮匹配结果
 *
 * @param messages - 消息列表
 * @param query - 搜索关键词（大小写不敏感）
 * @returns 匹配总数
 */
export function countMatches(messages: ChatMessage[], query: string): number {
  if (!query) return 0;

  const escaped = escapeRegex(query);
  const regex = new RegExp(escaped, 'gi');
  let total = 0;

  for (const msg of messages) {
    const matches = msg.content.match(regex);
    if (matches) {
      total += matches.length;
    }
  }

  return total;
}

/** useSearch hook 返回值 */
export interface SearchState {
  /** 是否处于搜索模式 */
  isSearching: boolean;
  /** 当前搜索关键词 */
  searchQuery: string;
  /** 匹配总数 */
  matchCount: number;
  /** 切换搜索模式 */
  toggleSearch: () => void;
  /** 设置搜索关键词 */
  setQuery: (query: string) => void;
  /** 清除搜索并退出搜索模式 */
  clearSearch: () => void;
}

/**
 * 搜索状态管理 Hook。
 *
 * 需求 18.1：Ctrl+F 显示搜索输入框并进入搜索模式
 * 需求 18.4：Escape 退出搜索模式并清除高亮
 *
 * @param messages - 当前消息列表，用于计算匹配数
 * @returns 搜索状态和控制方法
 */
export function useSearch(messages: ChatMessage[]): SearchState {
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const matchCount = countMatches(messages, searchQuery);

  const toggleSearch = useCallback(() => {
    setIsSearching(prev => {
      if (prev) {
        // Exiting search mode — clear query
        setSearchQuery('');
      }
      return !prev;
    });
  }, []);

  const setQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const clearSearch = useCallback(() => {
    setIsSearching(false);
    setSearchQuery('');
  }, []);

  return {
    isSearching,
    searchQuery,
    matchCount,
    toggleSearch,
    setQuery,
    clearSearch,
  };
}
