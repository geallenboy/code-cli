/**
 * 工具注册表单元测试
 *
 * 测试工具注册表的核心逻辑：
 * - truncateResult 截断行为（未超限不变、超限保留首尾、截断指示器）
 * - getToolDefinitions 返回所有预期工具
 * - 每个工具定义包含 description 和 parameters
 */

import { describe, it, expect } from 'vitest';
import { getToolDefinitions, truncateResult } from '../../src/tools/index.js';

describe('Tool Registry', () => {
  describe('truncateResult', () => {
    it('should return unchanged result when under limit', () => {
      const input = 'Hello, world!';
      expect(truncateResult(input)).toBe(input);
    });

    it('should return unchanged result when exactly at limit', () => {
      const input = 'x'.repeat(50_000);
      expect(truncateResult(input)).toBe(input);
    });

    it('should truncate result when over limit', () => {
      const input = 'a'.repeat(60_000);
      const result = truncateResult(input);
      expect(result.length).toBeLessThan(input.length);
      expect(result).toContain('... [truncated');
      expect(result).toContain('characters] ...');
    });

    it('should preserve start and end of the original content', () => {
      // Build a string with distinct start and end markers
      const start = 'START_MARKER_';
      const end = '_END_MARKER';
      const middle = 'x'.repeat(60_000);
      const input = start + middle + end;

      const result = truncateResult(input, 100);
      expect(result).toContain('START_MARKER_');
      expect(result).toContain('_END_MARKER');
    });

    it('should include the number of omitted characters in the indicator', () => {
      const input = 'a'.repeat(200);
      const result = truncateResult(input, 100);
      // Omitted = 200 - 100 = 100
      expect(result).toContain('[truncated 100 characters]');
    });

    it('should respect custom maxChars parameter', () => {
      const input = 'a'.repeat(50);
      // Under custom limit
      expect(truncateResult(input, 100)).toBe(input);
      // Over custom limit
      const truncated = truncateResult(input, 20);
      expect(truncated).toContain('truncated');
    });
  });

  describe('getToolDefinitions', () => {
    it('should return all expected Phase 1 tool names', () => {
      const tools = getToolDefinitions();
      expect(Object.keys(tools)).toContain('read_file');
      expect(Object.keys(tools)).toContain('write_file');
      expect(Object.keys(tools)).toContain('run_shell');
    });

    it('should return exactly 3 tools for Phase 1', () => {
      const tools = getToolDefinitions();
      expect(Object.keys(tools)).toHaveLength(3);
    });

    it('should have description for each tool', () => {
      const tools = getToolDefinitions();
      for (const [name, toolDef] of Object.entries(tools)) {
        expect(toolDef.description, `${name} should have a description`).toBeTruthy();
        expect(typeof toolDef.description).toBe('string');
      }
    });

    it('should have execute function for each tool', () => {
      const tools = getToolDefinitions();
      for (const [name, toolDef] of Object.entries(tools)) {
        expect(toolDef.execute, `${name} should have an execute function`).toBeDefined();
        expect(typeof toolDef.execute).toBe('function');
      }
    });
  });
});
