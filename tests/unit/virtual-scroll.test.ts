/**
 * 虚拟滚动 - 纯函数单元测试 + 属性测试
 */

import { describe, it, expect } from 'vitest';
import {
  computeVisibleRange,
  shouldAutoScroll,
  computeTotalHeight,
} from '../../src/ink-app/useVirtualScroll.js';

describe('computeVisibleRange', () => {
  it('returns empty range for empty items', () => {
    const result = computeVisibleRange(0, 10, []);
    expect(result).toEqual({ start: 0, end: 0 });
  });

  it('returns empty range for zero viewport', () => {
    const result = computeVisibleRange(0, 0, [3, 3, 3]);
    expect(result).toEqual({ start: 0, end: 0 });
  });

  it('returns all items when they fit in viewport', () => {
    // 3 items of height 3 = total 9, viewport 10
    const result = computeVisibleRange(0, 10, [3, 3, 3]);
    expect(result).toEqual({ start: 0, end: 3 });
  });

  it('returns subset when scrolled to top with many items', () => {
    // 10 items of height 3 = total 30, viewport 10
    const heights = Array(10).fill(3);
    const result = computeVisibleRange(0, 10, heights);
    // Items 0-3 cover rows 0-12, viewport shows 0-10
    expect(result.start).toBe(0);
    expect(result.end).toBe(4); // items at offsets 0,3,6,9 — item 3 ends at 12 > 10
  });

  it('returns correct range when scrolled down', () => {
    // 10 items of height 3 = total 30, viewport 10, scrolled to offset 9
    const heights = Array(10).fill(3);
    const result = computeVisibleRange(9, 10, heights);
    // scrollOffset=9, viewport shows rows 9-19
    // item 3 starts at 9, item 6 ends at 21
    expect(result.start).toBe(3);
    expect(result.end).toBe(7);
  });

  it('handles scroll past all items', () => {
    const heights = [3, 3, 3];
    const result = computeVisibleRange(100, 10, heights);
    // All items are above the viewport
    expect(result.start).toBe(heights.length);
    expect(result.end).toBe(heights.length);
  });

  it('handles variable height items', () => {
    // heights: [2, 5, 1, 4, 3] = total 15, viewport 6
    const heights = [2, 5, 1, 4, 3];
    const result = computeVisibleRange(0, 6, heights);
    // item 0: 0-2, item 1: 2-7 — both visible in 0-6
    expect(result.start).toBe(0);
    expect(result.end).toBe(2);
  });

  it('handles variable heights scrolled to middle', () => {
    // heights: [2, 5, 1, 4, 3] = total 15, viewport 6, offset 3
    const heights = [2, 5, 1, 4, 3];
    const result = computeVisibleRange(3, 6, heights);
    // viewport shows rows 3-9
    // item 1: 2-7 (visible), item 2: 7-8 (visible), item 3: 8-12 (partially visible)
    expect(result.start).toBe(1);
    expect(result.end).toBe(4);
  });
});

describe('shouldAutoScroll', () => {
  it('returns true when total height fits in viewport', () => {
    expect(shouldAutoScroll(0, 10, 20)).toBe(true);
  });

  it('returns true when scrolled to bottom', () => {
    // total 30, viewport 10, maxScroll = 20
    expect(shouldAutoScroll(20, 30, 10)).toBe(true);
  });

  it('returns true when near bottom within threshold', () => {
    // maxScroll = 20, offset = 19, threshold = 2
    expect(shouldAutoScroll(19, 30, 10, 2)).toBe(true);
  });

  it('returns false when scrolled up', () => {
    // maxScroll = 20, offset = 5
    expect(shouldAutoScroll(5, 30, 10)).toBe(false);
  });

  it('returns false when at middle', () => {
    expect(shouldAutoScroll(10, 30, 10)).toBe(false);
  });
});

describe('computeTotalHeight', () => {
  it('returns 0 for empty array', () => {
    expect(computeTotalHeight([])).toBe(0);
  });

  it('sums all heights', () => {
    expect(computeTotalHeight([3, 5, 2])).toBe(10);
  });

  it('handles single item', () => {
    expect(computeTotalHeight([7])).toBe(7);
  });
});
