/**
 * StatusBar 组件单元测试
 *
 * 需求 12：状态栏组件
 * - 12.1 渲染状态行，显示 token 总量、估算成本和耗时
 * - 12.2 自适应格式：token（<1K 原数字，≥1K X.YK，≥1M X.YM），成本（>$0.50 保留 2 位，≤$0.50 保留 4 位）
 * - 12.3 API 调用次数 > 0 时额外显示平均 API 响应时间
 * - 12.4 使用 Ink Box 居中显示，用 ─ 字符填充两侧
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  StatusBar,
  buildStatusParts,
  buildFillLine,
} from '../../src/ink-app/StatusBar.js';

// ─── buildStatusParts ───

describe('buildStatusParts', () => {
  it('should include token count, cost, and elapsed time', () => {
    const parts = buildStatusParts({
      inputTokens: 500,
      outputTokens: 200,
      elapsed: 3200,
    });
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('700 tokens');
    expect(parts[1]).toMatch(/^\$/);
    expect(parts[2]).toBe('3.2s');
  });

  it('should format tokens < 1K as raw number', () => {
    const parts = buildStatusParts({
      inputTokens: 300,
      outputTokens: 100,
      elapsed: 1000,
    });
    expect(parts[0]).toBe('400 tokens');
  });

  it('should format tokens >= 1K with K suffix', () => {
    const parts = buildStatusParts({
      inputTokens: 5000,
      outputTokens: 3000,
      elapsed: 1000,
    });
    expect(parts[0]).toBe('8.0K tokens');
  });

  it('should format tokens >= 1M with M suffix', () => {
    const parts = buildStatusParts({
      inputTokens: 800_000,
      outputTokens: 500_000,
      elapsed: 1000,
    });
    expect(parts[0]).toBe('1.3M tokens');
  });

  it('should format cost > $0.50 with 2 decimal places', () => {
    // Cost = (inputTokens/1M)*3 + (outputTokens/1M)*15
    // Need cost > 0.50: e.g. 100K input + 50K output = 0.3 + 0.75 = 1.05
    const parts = buildStatusParts({
      inputTokens: 100_000,
      outputTokens: 50_000,
      elapsed: 1000,
    });
    // cost = (100000/1000000)*3 + (50000/1000000)*15 = 0.3 + 0.75 = 1.05
    expect(parts[1]).toBe('$1.05');
  });

  it('should format cost <= $0.50 with 4 decimal places', () => {
    const parts = buildStatusParts({
      inputTokens: 500,
      outputTokens: 200,
      elapsed: 1000,
    });
    // cost = (500/1000000)*3 + (200/1000000)*15 = 0.0015 + 0.003 = 0.0045
    expect(parts[1]).toBe('$0.0045');
  });

  it('should not include avg API time when apiCallCount is 0', () => {
    const parts = buildStatusParts({
      inputTokens: 500,
      outputTokens: 200,
      elapsed: 1000,
      apiCallCount: 0,
      totalApiTime: 0,
    });
    expect(parts).toHaveLength(3);
  });

  it('should include avg API time when apiCallCount > 0', () => {
    const parts = buildStatusParts({
      inputTokens: 500,
      outputTokens: 200,
      elapsed: 5000,
      apiCallCount: 3,
      totalApiTime: 1500,
    });
    expect(parts).toHaveLength(4);
    expect(parts[3]).toBe('avg 500ms/call');
  });

  it('should format avg API time in seconds when >= 1s', () => {
    const parts = buildStatusParts({
      inputTokens: 500,
      outputTokens: 200,
      elapsed: 10000,
      apiCallCount: 2,
      totalApiTime: 5000,
    });
    expect(parts[3]).toBe('avg 2.5s/call');
  });

  it('should not include avg API time when totalApiTime is 0', () => {
    const parts = buildStatusParts({
      inputTokens: 500,
      outputTokens: 200,
      elapsed: 1000,
      apiCallCount: 3,
      totalApiTime: 0,
    });
    expect(parts).toHaveLength(3);
  });

  it('should default apiCallCount and totalApiTime to 0 when not provided', () => {
    const parts = buildStatusParts({
      inputTokens: 500,
      outputTokens: 200,
      elapsed: 1000,
    });
    expect(parts).toHaveLength(3);
  });
});

// ─── buildFillLine ───

describe('buildFillLine', () => {
  it('should create left and right fill strings', () => {
    const { left, right } = buildFillLine('hello', 20);
    // content "hello" = 5 chars + 2 spaces = 7, fill = 13, left = 6, right = 7
    expect(left).toMatch(/^─+$/);
    expect(right).toMatch(/^─+$/);
    expect(left.length + right.length + 5 + 2).toBe(20);
  });

  it('should handle content wider than width', () => {
    const { left, right } = buildFillLine('a very long content string', 10);
    expect(left).toBe('');
    expect(right).toBe('');
  });

  it('should split fill evenly for even remaining space', () => {
    const { left, right } = buildFillLine('ab', 10);
    // content "ab" = 2 + 2 spaces = 4, fill = 6, left = 3, right = 3
    expect(left.length).toBe(3);
    expect(right.length).toBe(3);
  });

  it('should give extra char to right for odd remaining space', () => {
    const { left, right } = buildFillLine('abc', 10);
    // content "abc" = 3 + 2 spaces = 5, fill = 5, left = 2, right = 3
    expect(left.length).toBe(2);
    expect(right.length).toBe(3);
  });
});

// ─── StatusBar component rendering ───

describe('StatusBar', () => {
  it('should return null when total tokens is 0', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 0,
        outputTokens: 0,
        elapsed: 1000,
      }),
    );
    expect(lastFrame()).toBe('');
  });

  it('should render token count, cost, and elapsed time', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 500,
        outputTokens: 200,
        elapsed: 3200,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('700 tokens');
    expect(output).toContain('$');
    expect(output).toContain('3.2s');
  });

  it('should render with ─ fill characters', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 1000,
        outputTokens: 500,
        elapsed: 2000,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('───');
  });

  it('should render avg API time when apiCallCount > 0', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 500,
        outputTokens: 200,
        elapsed: 5000,
        apiCallCount: 3,
        totalApiTime: 1500,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('avg 500ms/call');
  });

  it('should not render avg API time when apiCallCount is 0', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 500,
        outputTokens: 200,
        elapsed: 5000,
        apiCallCount: 0,
        totalApiTime: 0,
      }),
    );
    const output = lastFrame();
    expect(output).not.toContain('avg');
    expect(output).not.toContain('/call');
  });

  it('should render K-formatted tokens', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 5000,
        outputTokens: 3000,
        elapsed: 1000,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('8.0K tokens');
  });

  it('should render M-formatted tokens', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 800_000,
        outputTokens: 500_000,
        elapsed: 1000,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('1.3M tokens');
  });

  it('should use · separator between parts', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        inputTokens: 500,
        outputTokens: 200,
        elapsed: 1000,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('·');
  });
});
