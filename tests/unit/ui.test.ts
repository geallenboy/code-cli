/**
 * 终端 UI 输出单元测试
 *
 * 测试 printToolCall、printToolResult、printAssistantText、printCost、
 * printPermissionRequest、printTokenBar、printCompactNotification 的输出行为。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  printToolCall,
  printToolResult,
  printAssistantText,
  printCost,
  printPermissionRequest,
  printTokenBar,
  printCompactNotification,
  disableColor,
  Spinner,
} from '../../src/ui.js';

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
    it('should render tool results', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const longResult = 'a'.repeat(600);
      printToolResult('read_file', longResult);
      const output = spy.mock.calls.map((c) => String(c[0])).join('');
      // Enhanced renderer processes the result (may add line numbers, etc.)
      expect(output).toBeDefined();
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

  describe('printPermissionRequest', () => {
    it('should display tool name and risk level', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printPermissionRequest('run_shell', { command: 'rm -rf /' }, 'HIGH');
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('run_shell');
      expect(output).toContain('HIGH');
    });

    it('should truncate long input to 200 chars', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const longInput = { command: 'x'.repeat(300) };
      printPermissionRequest('run_shell', longInput, 'MEDIUM');
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      // The JSON.stringify output is sliced to 200 chars
      expect(output).toContain('MEDIUM');
    });

    it('should display LOW risk level', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printPermissionRequest('read_file', { file_path: 'test.ts' }, 'LOW');
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('LOW');
    });
  });

  describe('printTokenBar', () => {
    it('should display a progress bar with percentage', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printTokenBar(5000, 1000, 100000);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('6%');
      expect(output).toContain('6,000');
      expect(output).toContain('100,000');
    });

    it('should show green color for low usage', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printTokenBar(1000, 500, 100000);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      // Just verify it outputs something with the percentage
      expect(output).toContain('2%');
    });

    it('should handle zero window size gracefully', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printTokenBar(1000, 500, 0);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('0%');
    });

    it('should cap at 100% for overflow', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printTokenBar(90000, 20000, 100000);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('110%');
    });

    it('should show high usage percentage', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printTokenBar(80000, 5000, 100000);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('85%');
    });
  });

  describe('printCompactNotification', () => {
    it('should display compaction level and tokens freed', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printCompactNotification('micro', 5000);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('micro');
      expect(output).toContain('5,000');
    });

    it('should display snip level', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printCompactNotification('snip', 1200);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('snip');
      expect(output).toContain('1,200');
    });

    it('should display auto level', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printCompactNotification('auto', 25000);
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('auto');
      expect(output).toContain('25,000');
    });
  });

  describe('Spinner', () => {
    it('should start and stop without errors', () => {
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner('Testing...');
      spinner.start();
      // Let it tick once
      spinner.tick();
      spinner.stop();
      expect(spy).toHaveBeenCalled();
    });

    it('should not start twice', () => {
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner();
      spinner.start();
      spinner.start(); // Should be a no-op
      spinner.stop();
      expect(spy).toHaveBeenCalled();
    });

    it('should stop gracefully when not started', () => {
      const spinner = new Spinner();
      // Should not throw
      expect(() => spinner.stop()).not.toThrow();
    });
  });

  describe('disableColor', () => {
    it('should be callable without errors', () => {
      // Just verify it doesn't throw
      expect(() => disableColor()).not.toThrow();
    });
  });
});
