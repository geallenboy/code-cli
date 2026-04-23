/**
 * ToolCallPanel 组件单元测试
 *
 * 需求 7：工具调用面板组件
 * - 7.1 渲染带边框的工具调用面板，显示工具图标、名称和参数
 * - 7.2 使用 Ink Box 组件实现 Flexbox 布局，自动适应终端宽度
 * - 7.3 参数值超过 80 个字符时截断显示并附加省略号
 * - 7.4 为不同工具显示对应的图标
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  ToolCallPanel,
  TOOL_ICONS,
  truncateParam,
  getToolIcon,
  formatParamValue,
} from '../../src/ink-app/ToolCallPanel.js';

// ─── truncateParam ───

describe('truncateParam', () => {
  it('should return short strings unchanged', () => {
    expect(truncateParam('hello')).toBe('hello');
  });

  it('should return strings at exactly 80 chars unchanged', () => {
    const str = 'a'.repeat(80);
    expect(truncateParam(str)).toBe(str);
  });

  it('should truncate strings longer than 80 chars with ellipsis', () => {
    const str = 'a'.repeat(100);
    const result = truncateParam(str);
    expect(result.length).toBe(81); // 80 chars + 1 ellipsis char (…)
    expect(result.endsWith('…')).toBe(true);
    expect(result.startsWith('a'.repeat(80))).toBe(true);
  });

  it('should support custom max length', () => {
    const str = 'abcdefghij'; // 10 chars
    const result = truncateParam(str, 5);
    expect(result).toBe('abcde…');
  });

  it('should handle empty string', () => {
    expect(truncateParam('')).toBe('');
  });
});

// ─── getToolIcon ───

describe('getToolIcon', () => {
  it('should return correct icon for read_file', () => {
    expect(getToolIcon('read_file')).toBe('📖');
  });

  it('should return correct icon for write_file', () => {
    expect(getToolIcon('write_file')).toBe('✏️');
  });

  it('should return correct icon for edit_file', () => {
    expect(getToolIcon('edit_file')).toBe('🔧');
  });

  it('should return correct icon for run_shell', () => {
    expect(getToolIcon('run_shell')).toBe('💻');
  });

  it('should return correct icon for grep_search', () => {
    expect(getToolIcon('grep_search')).toBe('🔍');
  });

  it('should return correct icon for list_files', () => {
    expect(getToolIcon('list_files')).toBe('📁');
  });

  it('should return correct icon for web_search', () => {
    expect(getToolIcon('web_search')).toBe('🌐');
  });

  it('should return default icon for unknown tools', () => {
    expect(getToolIcon('unknown_tool')).toBe('🔧');
  });
});

// ─── formatParamValue ───

describe('formatParamValue', () => {
  it('should return string values as-is', () => {
    expect(formatParamValue('hello')).toBe('hello');
  });

  it('should convert numbers to string', () => {
    expect(formatParamValue(42)).toBe('42');
  });

  it('should convert booleans to string', () => {
    expect(formatParamValue(true)).toBe('true');
    expect(formatParamValue(false)).toBe('false');
  });

  it('should handle null', () => {
    expect(formatParamValue(null)).toBe('null');
  });

  it('should handle undefined', () => {
    expect(formatParamValue(undefined)).toBe('undefined');
  });

  it('should JSON.stringify objects', () => {
    expect(formatParamValue({ a: 1 })).toBe('{"a":1}');
  });

  it('should JSON.stringify arrays', () => {
    expect(formatParamValue([1, 2, 3])).toBe('[1,2,3]');
  });
});

// ─── TOOL_ICONS mapping ───

describe('TOOL_ICONS', () => {
  it('should contain all required tool icons from requirement 7.4', () => {
    expect(TOOL_ICONS['read_file']).toBe('📖');
    expect(TOOL_ICONS['write_file']).toBe('✏️');
    expect(TOOL_ICONS['edit_file']).toBe('🔧');
    expect(TOOL_ICONS['run_shell']).toBe('💻');
    expect(TOOL_ICONS['grep_search']).toBe('🔍');
    expect(TOOL_ICONS['list_files']).toBe('📁');
  });
});

// ─── ToolCallPanel component rendering ───

describe('ToolCallPanel', () => {
  it('should render tool name with icon', () => {
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, { toolName: 'read_file' }),
    );
    const output = lastFrame();
    expect(output).toContain('📖');
    expect(output).toContain('read_file');
  });

  it('should render with round border style', () => {
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, { toolName: 'read_file' }),
    );
    const output = lastFrame();
    // Ink round border uses ╭ ╮ ╰ ╯ characters
    expect(output).toContain('╭');
    expect(output).toContain('╯');
  });

  it('should render parameters', () => {
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, {
        toolName: 'read_file',
        input: { path: 'src/index.ts' },
      }),
    );
    const output = lastFrame();
    expect(output).toContain('path');
    expect(output).toContain('src/index.ts');
  });

  it('should render multiple parameters', () => {
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, {
        toolName: 'edit_file',
        input: { path: 'src/app.ts', content: 'new content' },
      }),
    );
    const output = lastFrame();
    expect(output).toContain('path');
    expect(output).toContain('src/app.ts');
    expect(output).toContain('content');
    expect(output).toContain('new content');
  });

  it('should truncate long parameter values', () => {
    const longValue = 'x'.repeat(100);
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, {
        toolName: 'write_file',
        input: { content: longValue },
      }),
    );
    const output = lastFrame();
    // Should contain truncated value with ellipsis, not the full 100 chars
    expect(output).toContain('…');
    expect(output).not.toContain('x'.repeat(100));
  });

  it('should render without input', () => {
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, { toolName: 'list_files' }),
    );
    const output = lastFrame();
    expect(output).toContain('📁');
    expect(output).toContain('list_files');
  });

  it('should use default icon for unknown tools', () => {
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, { toolName: 'custom_tool' }),
    );
    const output = lastFrame();
    expect(output).toContain('🔧');
    expect(output).toContain('custom_tool');
  });

  it('should render with empty input object', () => {
    const { lastFrame } = render(
      React.createElement(ToolCallPanel, { toolName: 'read_file', input: {} }),
    );
    const output = lastFrame();
    expect(output).toContain('read_file');
  });
});
