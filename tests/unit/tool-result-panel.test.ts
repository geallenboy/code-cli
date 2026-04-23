/**
 * ToolResultPanel 组件单元测试
 *
 * 需求 8：工具结果面板组件
 * - 8.1 成功显示 ✅ 图标，失败显示 ❌ 图标
 * - 8.2 使用 cli-highlight 进行语法高亮渲染
 * - 8.3 显示工具执行耗时（ms/s/m 自适应格式）
 * - 8.4 以 "Error" 或 "Exit code:" 开头的结果识别为错误
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  ToolResultPanel,
  detectError,
  formatElapsed,
  tryHighlight,
} from '../../src/ink-app/ToolResultPanel.js';

// ─── detectError ───

describe('detectError', () => {
  it('should detect text starting with "Error"', () => {
    expect(detectError('Error: something went wrong')).toBe(true);
  });

  it('should detect text starting with "Exit code:"', () => {
    expect(detectError('Exit code: 1')).toBe(true);
  });

  it('should not detect normal text as error', () => {
    expect(detectError('File written successfully')).toBe(false);
  });

  it('should handle leading whitespace', () => {
    expect(detectError('  Error: indented error')).toBe(true);
    expect(detectError('  Exit code: 127')).toBe(true);
  });

  it('should not detect "error" in lowercase as error', () => {
    expect(detectError('error in lowercase')).toBe(false);
  });

  it('should handle empty string', () => {
    expect(detectError('')).toBe(false);
  });

  it('should detect "Error" without colon', () => {
    expect(detectError('ErrorSomething')).toBe(true);
  });
});

// ─── formatElapsed ───

describe('formatElapsed', () => {
  it('should format sub-second as milliseconds', () => {
    expect(formatElapsed(50)).toBe('50ms');
    expect(formatElapsed(999)).toBe('999ms');
  });

  it('should format exactly 0ms', () => {
    expect(formatElapsed(0)).toBe('0ms');
  });

  it('should format seconds with one decimal', () => {
    expect(formatElapsed(1000)).toBe('1.0s');
    expect(formatElapsed(1500)).toBe('1.5s');
    expect(formatElapsed(59999)).toBe('60.0s');
  });

  it('should format minutes and seconds for >= 60s', () => {
    expect(formatElapsed(60000)).toBe('1m 0s');
    expect(formatElapsed(90000)).toBe('1m 30s');
    expect(formatElapsed(125000)).toBe('2m 5s');
  });

  it('should round milliseconds', () => {
    expect(formatElapsed(499.6)).toBe('500ms');
    expect(formatElapsed(1.4)).toBe('1ms');
  });
});

// ─── tryHighlight ───

describe('tryHighlight', () => {
  it('should return highlighted content for valid code', () => {
    const result = tryHighlight('const x = 42;');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return original content on failure', () => {
    // Plain text should still return something
    const result = tryHighlight('just plain text');
    expect(result).toBeDefined();
  });

  it('should handle empty string', () => {
    expect(tryHighlight('')).toBe('');
  });
});

// ─── ToolResultPanel component rendering ───

describe('ToolResultPanel', () => {
  it('should render success icon for successful result', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'read_file',
        result: 'file content here',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('✅');
    expect(output).toContain('read_file');
  });

  it('should render error icon when isError is true', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'run_shell',
        result: 'some output',
        isError: true,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('❌');
    expect(output).toContain('run_shell');
  });

  it('should auto-detect error from result text starting with "Error"', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'run_shell',
        result: 'Error: command not found',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('❌');
  });

  it('should auto-detect error from result text starting with "Exit code:"', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'run_shell',
        result: 'Exit code: 1',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('❌');
  });

  it('should display elapsed time in ms format', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'read_file',
        result: 'content',
        elapsed: 150,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('150ms');
  });

  it('should display elapsed time in seconds format', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'read_file',
        result: 'content',
        elapsed: 2500,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('2.5s');
  });

  it('should display elapsed time in minutes format', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'run_shell',
        result: 'done',
        elapsed: 90000,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('1m 30s');
  });

  it('should render result text content', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'read_file',
        result: 'Hello World',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('Hello World');
  });

  it('should render without elapsed time', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'read_file',
        result: 'content',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('✅');
    expect(output).toContain('read_file');
    // Should not contain time-related parentheses
    expect(output).not.toMatch(/\(\d/);
  });

  it('should render empty result without content block', () => {
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'write_file',
        result: '',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('✅');
    expect(output).toContain('write_file');
  });

  it('should prefer explicit isError over auto-detection', () => {
    // isError=false should override auto-detection
    const { lastFrame } = render(
      React.createElement(ToolResultPanel, {
        toolName: 'run_shell',
        result: 'Error: but not really',
        isError: false,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('✅');
  });
});
