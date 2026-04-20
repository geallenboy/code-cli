/**
 * 权限规则系统单元测试
 *
 * 测试 PermissionSystem 的核心逻辑：
 * - 精确匹配、前缀匹配、通配符匹配
 * - deny-first 优先级
 * - 会话规则生成
 * - 从设置文件加载（mock fs）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionSystem } from '../../src/permissions.js';

// Mock fs and os modules to control settings file loading
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

import { readFileSync, existsSync } from 'node:fs';

describe('PermissionSystem', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('{}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('evaluate — matching', () => {
    it('should return null when no rules match', () => {
      const ps = new PermissionSystem();
      const result = ps.evaluate('run_shell', { command: 'echo hello' });
      expect(result).toBeNull();
    });

    it('should match exact tool+pattern via allow rule', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { allow: ['Bash(npm test)'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'npm test' })).toBe('allow');
    });

    it('should match prefix pattern (git:*)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { allow: ['Bash(git:*)'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'git:status' })).toBe('allow');
      expect(ps.evaluate('run_shell', { command: 'git:log' })).toBe('allow');
      expect(ps.evaluate('run_shell', { command: 'npm test' })).toBeNull();
    });

    it('should match wildcard pattern (git *)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { allow: ['Bash(git *)'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'git status' })).toBe('allow');
      expect(ps.evaluate('run_shell', { command: 'git log --oneline' })).toBe('allow');
    });

    it('should match wildcard-only pattern (*)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { allow: ['Bash(*)'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'anything' })).toBe('allow');
    });

    it('should match simple tool name format (no pattern)', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { allow: ['Read'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('read_file', { file_path: 'any/file.ts' })).toBe('allow');
    });

    it('should map write_file to Write tool name', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { deny: ['Write(*.secret)'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('write_file', { file_path: 'config.secret' })).toBe('deny');
    });
  });

  describe('evaluate — deny-first priority', () => {
    it('should deny even when allow rule also matches', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: {
            allow: ['Bash(*)'],
            deny: ['Bash(rm *)'],
          },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'rm -rf /' })).toBe('deny');
    });

    it('should allow when only allow rule matches', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: {
            allow: ['Bash(npm test)'],
            deny: ['Bash(rm *)'],
          },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'npm test' })).toBe('allow');
    });

    it('should return ask when only ask rule matches', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { ask: ['Bash(npm install *)'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'npm install lodash' })).toBe('ask');
    });
  });

  describe('session rules', () => {
    it('should add and evaluate session rules', () => {
      const ps = new PermissionSystem();
      ps.addSessionRule('run_shell', 'npm test');
      expect(ps.evaluate('run_shell', { command: 'npm test' })).toBe('allow');
    });

    it('should include session rules in getAllRules', () => {
      const ps = new PermissionSystem();
      ps.addSessionRule('run_shell', 'npm test');
      const rules = ps.getAllRules();
      expect(rules.length).toBe(1);
      expect(rules[0].source).toBe('session');
      expect(rules[0].behavior).toBe('allow');
    });

    it('deny rules from settings should override session allow rules', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { deny: ['Bash(rm *)'] },
        }),
      );
      const ps = new PermissionSystem();
      ps.addSessionRule('run_shell', 'rm -rf /');
      expect(ps.evaluate('run_shell', { command: 'rm -rf /' })).toBe('deny');
    });
  });

  describe('loading from settings files', () => {
    it('should load rules from user settings file', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('/mock-home/');
      });
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          permissions: { allow: ['Bash(npm test)'] },
        }),
      );
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'npm test' })).toBe('allow');
    });

    it('should handle missing settings files gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'npm test' })).toBeNull();
    });

    it('should handle invalid JSON gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json');
      expect(() => new PermissionSystem()).not.toThrow();
    });

    it('should handle settings without permissions key', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ other: 'stuff' }));
      const ps = new PermissionSystem();
      expect(ps.evaluate('run_shell', { command: 'npm test' })).toBeNull();
    });
  });
});
