/**
 * 计划模式单元测试
 *
 * 测试计划模式的核心逻辑：
 * - 进入/退出计划模式
 * - 工具过滤
 * - 只读 shell 命令判断
 * - 计划文件保存
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createPlanModeState,
  enterPlanMode,
  exitPlanMode,
  getPlanModeTools,
  isReadOnlyShellCommand,
  savePlan,
} from '../../src/plan-mode.js';

// Mock fs and os for savePlan
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}));

import { mkdirSync, writeFileSync } from 'node:fs';

describe('Plan Mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createPlanModeState', () => {
    it('should create an inactive plan mode state', () => {
      const state = createPlanModeState();
      expect(state.active).toBe(false);
      expect(state.prePlanPermissionMode.yolo).toBe(false);
      expect(state.planText).toBeUndefined();
    });
  });

  describe('enterPlanMode', () => {
    it('should activate plan mode and save current yolo state', () => {
      const state = createPlanModeState();
      const result = enterPlanMode(state, true);
      expect(result.active).toBe(true);
      expect(result.prePlanPermissionMode.yolo).toBe(true);
    });

    it('should save non-yolo permission mode', () => {
      const state = createPlanModeState();
      const result = enterPlanMode(state, false);
      expect(result.active).toBe(true);
      expect(result.prePlanPermissionMode.yolo).toBe(false);
    });

    it('should return a new state object (immutable)', () => {
      const state = createPlanModeState();
      const result = enterPlanMode(state, false);
      expect(result).not.toBe(state);
    });
  });

  describe('exitPlanMode', () => {
    it('should deactivate plan mode and store plan text', () => {
      const state = enterPlanMode(createPlanModeState(), true);
      const result = exitPlanMode(state, 'My plan text');
      expect(result.active).toBe(false);
      expect(result.planText).toBe('My plan text');
    });

    it('should preserve prePlanPermissionMode', () => {
      const state = enterPlanMode(createPlanModeState(), true);
      const result = exitPlanMode(state, 'plan');
      expect(result.prePlanPermissionMode.yolo).toBe(true);
    });

    it('should return a new state object (immutable)', () => {
      const state = enterPlanMode(createPlanModeState(), false);
      const result = exitPlanMode(state, 'plan');
      expect(result).not.toBe(state);
    });
  });

  describe('getPlanModeTools', () => {
    it('should return only read-only tools plus run_shell', () => {
      const tools = getPlanModeTools();
      expect(tools).toContain('read_file');
      expect(tools).toContain('grep_search');
      expect(tools).toContain('list_files');
      expect(tools).toContain('run_shell');
    });

    it('should not include write tools', () => {
      const tools = getPlanModeTools();
      expect(tools).not.toContain('write_file');
      expect(tools).not.toContain('edit_file');
    });

    it('should return exactly 4 tools', () => {
      expect(getPlanModeTools()).toHaveLength(4);
    });
  });

  describe('isReadOnlyShellCommand', () => {
    it('should allow git log', () => {
      expect(isReadOnlyShellCommand('git log --oneline -5')).toBe(true);
    });

    it('should allow git diff', () => {
      expect(isReadOnlyShellCommand('git diff HEAD~1')).toBe(true);
    });

    it('should allow git status', () => {
      expect(isReadOnlyShellCommand('git status')).toBe(true);
    });

    it('should allow git show', () => {
      expect(isReadOnlyShellCommand('git show HEAD')).toBe(true);
    });

    it('should allow cat', () => {
      expect(isReadOnlyShellCommand('cat src/index.ts')).toBe(true);
    });

    it('should allow ls', () => {
      expect(isReadOnlyShellCommand('ls -la')).toBe(true);
    });

    it('should allow head and tail', () => {
      expect(isReadOnlyShellCommand('head -20 file.ts')).toBe(true);
      expect(isReadOnlyShellCommand('tail -f log.txt')).toBe(true);
    });

    it('should allow find and tree', () => {
      expect(isReadOnlyShellCommand('find . -name "*.ts"')).toBe(true);
      expect(isReadOnlyShellCommand('tree src/')).toBe(true);
    });

    it('should allow wc', () => {
      expect(isReadOnlyShellCommand('wc -l file.ts')).toBe(true);
    });

    it('should reject write commands', () => {
      expect(isReadOnlyShellCommand('rm -rf /')).toBe(false);
      expect(isReadOnlyShellCommand('npm install')).toBe(false);
      expect(isReadOnlyShellCommand('echo hello > file.txt')).toBe(false);
    });

    it('should reject git push', () => {
      expect(isReadOnlyShellCommand('git push origin main')).toBe(false);
    });

    it('should reject git commit', () => {
      expect(isReadOnlyShellCommand('git commit -m "test"')).toBe(false);
    });

    it('should handle leading whitespace', () => {
      expect(isReadOnlyShellCommand('  git log')).toBe(true);
      expect(isReadOnlyShellCommand('  rm file')).toBe(false);
    });
  });

  describe('savePlan', () => {
    it('should create plans directory and write file', () => {
      const filename = savePlan('Refactor the authentication module');
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('plans'),
        { recursive: true },
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(filename),
        'Refactor the authentication module',
        'utf-8',
      );
    });

    it('should generate a slug-based filename', () => {
      const filename = savePlan('Refactor the auth module');
      expect(filename).toMatch(/^plan-\d+-refactor-the-auth-module\.md$/);
    });

    it('should truncate long plan text in slug', () => {
      const longPlan = 'a'.repeat(100);
      const filename = savePlan(longPlan);
      // Slug is based on first 50 chars
      expect(filename.length).toBeLessThan(100);
    });

    it('should handle special characters in plan text', () => {
      const filename = savePlan('Fix bug #123: handle @special chars!');
      expect(filename).toMatch(/^plan-\d+-.+\.md$/);
      // Should not contain special chars in slug
      expect(filename).not.toMatch(/[#@!]/);
    });
  });
});
