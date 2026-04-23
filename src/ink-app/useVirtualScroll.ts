/**
 * 虚拟滚动 Hook
 *
 * 仅渲染可视区域内的消息，未进入视口的消息不创建 React 元素。
 * 支持自动滚动到底部（新消息到达时）和手动滚动保持位置。
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

/** 计算可视范围内的起止索引 */
export function computeVisibleRange(
  scrollOffset: number,
  viewportHeight: number,
  itemHeights: number[],
): { start: number; end: number } {
  if (itemHeights.length === 0 || viewportHeight <= 0) {
    return { start: 0, end: 0 };
  }

  let accum = 0;
  let start = 0;
  let end = 0;
  let foundStart = false;

  for (let i = 0; i < itemHeights.length; i++) {
    const itemBottom = accum + itemHeights[i];

    if (!foundStart && itemBottom > scrollOffset) {
      start = i;
      foundStart = true;
    }

    if (foundStart && accum < scrollOffset + viewportHeight) {
      end = i + 1;
    }

    accum += itemHeights[i];

    if (accum >= scrollOffset + viewportHeight) {
      break;
    }
  }

  // If we never found a start (all items above viewport), return empty
  if (!foundStart) {
    return { start: itemHeights.length, end: itemHeights.length };
  }

  return { start, end };
}

/** 判断是否应该自动滚动到底部 */
export function shouldAutoScroll(
  scrollOffset: number,
  totalHeight: number,
  viewportHeight: number,
  threshold = 2,
): boolean {
  // Auto-scroll when the user is at or near the bottom
  if (totalHeight <= viewportHeight) {
    return true;
  }
  const maxScroll = totalHeight - viewportHeight;
  return scrollOffset >= maxScroll - threshold;
}

/** 计算所有项目的总高度 */
export function computeTotalHeight(itemHeights: number[]): number {
  let total = 0;
  for (const h of itemHeights) {
    total += h;
  }
  return total;
}

export interface VirtualScrollResult<T> {
  /** 当前可视的项目切片 */
  visibleItems: T[];
  /** 可视项目在原数组中的起始索引 */
  startIndex: number;
  /** 可视项目在原数组中的结束索引（不含） */
  endIndex: number;
  /** 当前滚动偏移量 */
  scrollOffset: number;
  /** 所有项目的总高度 */
  totalHeight: number;
  /** 向上滚动 */
  scrollUp: (lines?: number) => void;
  /** 向下滚动 */
  scrollDown: (lines?: number) => void;
  /** 滚动到底部 */
  scrollToBottom: () => void;
  /** 是否处于底部（自动滚动状态） */
  isAtBottom: boolean;
}

export interface UseVirtualScrollOptions {
  /** 每个项目的估算高度（行数），默认 3 */
  estimatedItemHeight?: number;
  /** 视口高度（行数），默认使用 process.stdout.rows 或 24 */
  viewportHeight?: number;
  /** 为输入区域等保留的行数，默认 4 */
  reservedLines?: number;
}

/**
 * 虚拟滚动 Hook
 *
 * @param items - 所有项目数组
 * @param options - 配置选项
 * @returns 虚拟滚动状态和控制方法
 */
export function useVirtualScroll<T>(
  items: T[],
  options: UseVirtualScrollOptions = {},
): VirtualScrollResult<T> {
  const {
    estimatedItemHeight = 3,
    viewportHeight: explicitViewportHeight,
    reservedLines = 4,
  } = options;

  const viewportHeight = explicitViewportHeight
    ?? Math.max(1, (process.stdout.rows || 24) - reservedLines);

  const [scrollOffset, setScrollOffset] = useState(0);
  const wasAtBottomRef = useRef(true);
  const prevItemCountRef = useRef(items.length);

  // Build item heights array (using estimated height for all items)
  const itemHeights = useMemo(
    () => items.map(() => estimatedItemHeight),
    [items.length, estimatedItemHeight],
  );

  const totalHeight = useMemo(() => computeTotalHeight(itemHeights), [itemHeights]);

  const isAtBottom = shouldAutoScroll(scrollOffset, totalHeight, viewportHeight);

  // Auto-scroll to bottom when new items arrive and user was at bottom
  useEffect(() => {
    if (items.length > prevItemCountRef.current && wasAtBottomRef.current) {
      const maxScroll = Math.max(0, totalHeight - viewportHeight);
      setScrollOffset(maxScroll);
    }
    prevItemCountRef.current = items.length;
  }, [items.length, totalHeight, viewportHeight]);

  // Track whether user is at bottom
  useEffect(() => {
    wasAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const { start, end } = useMemo(
    () => computeVisibleRange(scrollOffset, viewportHeight, itemHeights),
    [scrollOffset, viewportHeight, itemHeights],
  );

  const visibleItems = useMemo(
    () => items.slice(start, end),
    [items, start, end],
  );

  const scrollUp = useCallback((lines = 1) => {
    setScrollOffset(prev => Math.max(0, prev - lines));
  }, []);

  const scrollDown = useCallback((lines = 1) => {
    setScrollOffset(prev => {
      const maxScroll = Math.max(0, totalHeight - viewportHeight);
      return Math.min(maxScroll, prev + lines);
    });
  }, [totalHeight, viewportHeight]);

  const scrollToBottom = useCallback(() => {
    const maxScroll = Math.max(0, totalHeight - viewportHeight);
    setScrollOffset(maxScroll);
  }, [totalHeight, viewportHeight]);

  return {
    visibleItems,
    startIndex: start,
    endIndex: end,
    scrollOffset,
    totalHeight,
    scrollUp,
    scrollDown,
    scrollToBottom,
    isAtBottom,
  };
}
