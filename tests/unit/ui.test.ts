/**
 * 终端 UI 输出单元测试
 *
 * 测试 printToolCall、printToolResult、printAssistantText、printCost 的输出行为。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { printToolCall, printToolResult, printAssistantText, printCost } from '../../src/ui.js';

describe('UI Output', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('printToolCall', () => {
    it('should print tool name with icon', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printToolCall('read_file', { file_path: 'test.ts' });
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('read_file');
    });

    it('should truncate long input values', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const longValue = 'x'.repeat(200);
      printToolCall('write_file', { content: longValue });
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('...');
    });
  });

  describe('printToolResult', () => {
    it('should truncate results longer than 500 chars', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const longResult = 'a'.repeat(600);
      printToolResult('read_file', longResult);
      const output = spy.mock.calls.map((c) => String(c[0])).join('');
      // The displayed output should be truncated
      expect(output.length).toBeLessThan(600);
    });

    it('should not truncate short results', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printToolResult('read_file', 'short result');
      const output = spy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('short result');
    });
  });

  describe('printAssistantText', () => {
    it('should write to stdout', () => {
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printAssistantText('hello');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('printCost', () => {
    it('should display token counts and estimated cost', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printCost(1000, 500);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('1,000');
      expect(output).toContain('500');
      expect(output).toContain('$');
    });

    it('should handle zero tokens', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printCost(0, 0);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('0');
      expect(output).toContain('$0.0000');
    });
  });
});
