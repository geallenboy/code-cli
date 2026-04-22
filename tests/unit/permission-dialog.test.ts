/**
 * 权限确认对话框单元测试
 *
 * 测试 PermissionDialog 的核心逻辑：
 * - 防误触延迟
 * - 风险等级颜色编码
 * - 建议规则显示
 * - 选项解析
 */

import { describe, it, expect } from 'vitest';
import chalk from 'chalk';
import { PermissionDialog, getRiskColor } from '../../src/ink/components/permission-dialog.js';

// Force chalk to use colors in test environment
chalk.level = 3; // TrueColor

/**
 * Helper: strip all ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('PermissionDialog', () => {
  describe('render (backward compatible)', () => {
    it('should render tool name and risk explanation', () => {
      const dialog = new PermissionDialog();
      const result = dialog.render('run_shell', 'Executes shell command');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('run_shell');
      expect(stripped).toContain('Executes shell command');
    });

    it('should show Permission Required header', () => {
      const dialog = new PermissionDialog();
      const result = dialog.render('run_shell', 'risk');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('Permission Required');
    });

    it('should show suggested rule when provided', () => {
      const dialog = new PermissionDialog();
      const result = dialog.render('run_shell', 'risk', 'allow npm test');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('Suggested rule: allow npm test');
    });

    it('should show y/n/always options', () => {
      const dialog = new PermissionDialog();
      const result = dialog.render('run_shell', 'risk');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('[y]es');
      expect(stripped).toContain('[n]o');
      expect(stripped).toContain('[a]lways');
    });
  });

  describe('renderEnhanced', () => {
    it('should show risk level with color coding and box border', () => {
      const dialog = new PermissionDialog();

      const lowResult = dialog.renderEnhanced({
        toolName: 'read_file',
        riskLevel: 'LOW',
        riskExplanation: 'Read only',
      });
      expect(stripAnsi(lowResult)).toContain('LOW');
      expect(stripAnsi(lowResult)).toContain('╭');
      expect(stripAnsi(lowResult)).toContain('╯');
      // Should have ANSI formatting (result differs from stripped)
      expect(lowResult).not.toBe(stripAnsi(lowResult));

      const medResult = dialog.renderEnhanced({
        toolName: 'write_file',
        riskLevel: 'MEDIUM',
        riskExplanation: 'Write file',
      });
      expect(stripAnsi(medResult)).toContain('MEDIUM');
      expect(medResult).not.toBe(stripAnsi(medResult));

      const highResult = dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'HIGH',
        riskExplanation: 'Dangerous command',
      });
      expect(stripAnsi(highResult)).toContain('HIGH');
      expect(highResult).not.toBe(stripAnsi(highResult));
    });

    it('should show dim options during anti-misclick delay', () => {
      const dialog = new PermissionDialog();
      const result = dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'HIGH',
        riskExplanation: 'Dangerous',
        antiMisclickDelay: 5000, // Long delay to ensure we're in delay period
      });
      // Options should be present
      const stripped = stripAnsi(result);
      expect(stripped).toContain('[y]es');
      expect(stripped).toContain('[n]o');
      expect(stripped).toContain('[a]lways');
      // During delay, dialog should report being in delay
      expect(dialog.isInDelay()).toBe(true);
    });

    it('should include suggested rule when provided', () => {
      const dialog = new PermissionDialog();
      const result = dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'MEDIUM',
        riskExplanation: 'Shell command',
        suggestedRule: 'allow npm *',
      });
      const stripped = stripAnsi(result);
      expect(stripped).toContain('Suggested rule: allow npm *');
    });

    it('should contain Permission Required in box header', () => {
      const dialog = new PermissionDialog();
      const result = dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'HIGH',
        riskExplanation: 'Dangerous',
      });
      const stripped = stripAnsi(result);
      expect(stripped).toContain('Permission Required');
    });
  });

  describe('anti-misclick delay', () => {
    it('should reject input during delay period', () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'HIGH',
        riskExplanation: 'Dangerous',
        antiMisclickDelay: 5000, // 5 second delay
      });

      // During delay, parseChoice should return null
      expect(dialog.parseChoice('y')).toBeNull();
      expect(dialog.parseChoice('yes')).toBeNull();
      expect(dialog.parseChoice('n')).toBeNull();
      expect(dialog.parseChoice('a')).toBeNull();
    });

    it('should accept input after delay expires', async () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'HIGH',
        riskExplanation: 'Dangerous',
        antiMisclickDelay: 50, // Very short delay
      });

      // Wait for delay to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(dialog.parseChoice('y')).toBe('yes');
      expect(dialog.parseChoice('n')).toBe('no');
      expect(dialog.parseChoice('a')).toBe('always');
    });

    it('should report correct remaining delay', () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'HIGH',
        riskExplanation: 'Dangerous',
        antiMisclickDelay: 5000,
      });

      const remaining = dialog.getRemainingDelay();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5000);
    });

    it('should default to 200ms delay', () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'HIGH',
        riskExplanation: 'Dangerous',
      });

      expect(dialog.isInDelay()).toBe(true);
      const remaining = dialog.getRemainingDelay();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(200);
    });

    it('should use zero delay when explicitly set to 0', async () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'run_shell',
        riskLevel: 'LOW',
        riskExplanation: 'Safe',
        antiMisclickDelay: 0,
      });

      // With 0 delay, should accept input immediately
      // (may need a tiny wait for Date.now() to advance)
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(dialog.parseChoice('y')).toBe('yes');
    });
  });

  describe('parseChoice', () => {
    it('should parse y/yes as yes', async () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'test',
        riskLevel: 'LOW',
        riskExplanation: 'test',
        antiMisclickDelay: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(dialog.parseChoice('y')).toBe('yes');
      expect(dialog.parseChoice('yes')).toBe('yes');
      expect(dialog.parseChoice('Y')).toBe('yes');
      expect(dialog.parseChoice('YES')).toBe('yes');
    });

    it('should parse n/no as no', async () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'test',
        riskLevel: 'LOW',
        riskExplanation: 'test',
        antiMisclickDelay: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(dialog.parseChoice('n')).toBe('no');
      expect(dialog.parseChoice('no')).toBe('no');
      expect(dialog.parseChoice('N')).toBe('no');
    });

    it('should parse a/always as always', async () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'test',
        riskLevel: 'LOW',
        riskExplanation: 'test',
        antiMisclickDelay: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(dialog.parseChoice('a')).toBe('always');
      expect(dialog.parseChoice('always')).toBe('always');
      expect(dialog.parseChoice('A')).toBe('always');
    });

    it('should return null for invalid input', async () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'test',
        riskLevel: 'LOW',
        riskExplanation: 'test',
        antiMisclickDelay: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      expect(dialog.parseChoice('x')).toBeNull();
      expect(dialog.parseChoice('')).toBeNull();
      expect(dialog.parseChoice('maybe')).toBeNull();
    });
  });

  describe('getRiskColor', () => {
    it('should return green for LOW', () => {
      const color = getRiskColor('LOW');
      const result = color('test');
      // Should apply some formatting (result differs from plain text)
      expect(result).toContain('test');
      expect(result).toBe(chalk.green('test'));
    });

    it('should return yellow for MEDIUM', () => {
      const color = getRiskColor('MEDIUM');
      const result = color('test');
      expect(result).toContain('test');
      expect(result).toBe(chalk.yellow('test'));
    });

    it('should return red for HIGH', () => {
      const color = getRiskColor('HIGH');
      const result = color('test');
      expect(result).toContain('test');
      expect(result).toBe(chalk.red('test'));
    });
  });

  describe('renderOptions', () => {
    it('should render dim options during delay', () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'test',
        riskLevel: 'HIGH',
        riskExplanation: 'test',
        antiMisclickDelay: 5000,
      });

      const options = dialog.renderOptions();
      const stripped = stripAnsi(options);
      expect(stripped).toContain('[y]es');
      expect(stripped).toContain('[n]o');
      expect(stripped).toContain('[a]lways');
      // Should be in delay state
      expect(dialog.isInDelay()).toBe(true);
    });

    it('should render colored options after delay', async () => {
      const dialog = new PermissionDialog();
      dialog.renderEnhanced({
        toolName: 'test',
        riskLevel: 'LOW',
        riskExplanation: 'test',
        antiMisclickDelay: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      const options = dialog.renderOptions();
      const stripped = stripAnsi(options);
      expect(stripped).toContain('[y]es');
      expect(stripped).toContain('[n]o');
      expect(stripped).toContain('[a]lways');
      // Should not be in delay state
      expect(dialog.isInDelay()).toBe(false);
    });
  });
});
