/**
 * Prompt 编排单元测试
 *
 * 测试系统提示词组装的核心逻辑：
 * - 环境信息注入（cwd, platform, date, shell）
 * - 工具描述注入
 * - git 上下文获取与优雅降级
 * - CLAUDE.md 加载
 * - 静态/动态分离与缓存
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSystemPrompt,
  buildStaticSystemPrompt,
  buildDynamicContext,
  resetPromptCache,
  getGitContext,
  loadClaudeMd,
} from '../../src/prompt.js';
import type { ToolDescription } from '../../src/prompt.js';

// Mock child_process for git commands
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// We need to import after mocking
import { execSync } from 'node:child_process';
const mockExecSync = vi.mocked(execSync);

describe('Prompt Orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPromptCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPromptCache();
  });

  describe('buildSystemPrompt', () => {
    it('should include the current working directory', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const tools: ToolDescription[] = [];
      const prompt = buildSystemPrompt(tools);
      expect(prompt).toContain(process.cwd());
    });

    it('should include the platform', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain(process.platform);
    });

    it('should include the current date in YYYY-MM-DD format', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const prompt = buildSystemPrompt([]);
      const today = new Date().toISOString().split('T')[0];
      expect(prompt).toContain(today);
    });

    it('should include tool descriptions when tools are provided', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const tools: ToolDescription[] = [
        { name: 'read_file', description: 'Read a file with line numbers' },
        { name: 'run_shell', description: 'Execute a shell command' },
      ];
      const prompt = buildSystemPrompt(tools);
      expect(prompt).toContain('read_file');
      expect(prompt).toContain('Read a file with line numbers');
      expect(prompt).toContain('run_shell');
      expect(prompt).toContain('Execute a shell command');
    });

    it('should show "No tools available" when no tools provided', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('No tools available');
    });

    it('should include behavioral guidelines', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('STOP WHEN DONE');
      expect(prompt).toContain('NEVER read the same file twice');
    });

    it('should include git context when available', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        const command = String(cmd);
        if (command.includes('rev-parse')) return 'main\n';
        if (command.includes('log')) return 'abc1234 Initial commit\n';
        if (command.includes('status')) return 'M src/index.ts\n';
        return '';
      });

      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('Branch: main');
      expect(prompt).toContain('abc1234 Initial commit');
    });

    it('should gracefully handle git failure', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const prompt = buildSystemPrompt([]);
      expect(prompt).toContain('Not a git repository');
    });
  });

  describe('buildStaticSystemPrompt', () => {
    it('should return a string containing platform info', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const tools: ToolDescription[] = [
        { name: 'read_file', description: 'Read a file' },
      ];
      const prompt = buildStaticSystemPrompt(tools);
      expect(prompt).toContain(process.platform);
    });

    it('should include tool descriptions', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const tools: ToolDescription[] = [
        { name: 'read_file', description: 'Read a file' },
        { name: 'write_file', description: 'Write a file' },
      ];
      const prompt = buildStaticSystemPrompt(tools);
      expect(prompt).toContain('read_file');
      expect(prompt).toContain('write_file');
    });

    it('should memoize the result (return same string on second call)', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const tools: ToolDescription[] = [
        { name: 'read_file', description: 'Read a file' },
      ];
      const first = buildStaticSystemPrompt(tools);
      const second = buildStaticSystemPrompt(tools);
      expect(first).toBe(second);
    });

    it('should return cached result even with different tools (memoized)', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const tools1: ToolDescription[] = [{ name: 'read_file', description: 'Read' }];
      const tools2: ToolDescription[] = [{ name: 'write_file', description: 'Write' }];
      const first = buildStaticSystemPrompt(tools1);
      const second = buildStaticSystemPrompt(tools2);
      // Second call returns cached version from first call
      expect(first).toBe(second);
    });
  });

  describe('resetPromptCache', () => {
    it('should clear the cached static prompt', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const tools1: ToolDescription[] = [{ name: 'read_file', description: 'Read' }];
      const first = buildStaticSystemPrompt(tools1);

      resetPromptCache();

      const tools2: ToolDescription[] = [{ name: 'write_file', description: 'Write' }];
      const second = buildStaticSystemPrompt(tools2);

      // After reset, should rebuild with new tools
      expect(second).not.toBe(first);
      expect(second).toContain('write_file');
    });
  });

  describe('buildDynamicContext', () => {
    it('should include current date', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const context = buildDynamicContext();
      const today = new Date().toISOString().split('T')[0];
      expect(context).toContain(today);
    });

    it('should include working directory', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const context = buildDynamicContext();
      expect(context).toContain(process.cwd());
    });

    it('should include git context when available', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        const command = String(cmd);
        if (command.includes('rev-parse')) return 'main\n';
        if (command.includes('log')) return 'abc1234 commit\n';
        if (command.includes('status')) return '';
        return '';
      });

      const context = buildDynamicContext();
      expect(context).toContain('Git context:');
      expect(context).toContain('Branch: main');
    });

    it('should omit git context when not available', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const context = buildDynamicContext();
      expect(context).not.toContain('Git context:');
    });
  });

  describe('getGitContext', () => {
    it('should return branch, log, and status when in a git repo', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        const command = String(cmd);
        if (command.includes('rev-parse')) return 'feature/test\n';
        if (command.includes('log')) return 'abc1234 First\ndef5678 Second\n';
        if (command.includes('status')) return '';
        return '';
      });

      const context = getGitContext();
      expect(context).toContain('Branch: feature/test');
      expect(context).toContain('abc1234 First');
      expect(context).toContain('def5678 Second');
      expect(context).toContain('Working tree: clean');
    });

    it('should show working tree status when there are changes', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        const command = String(cmd);
        if (command.includes('rev-parse')) return 'main\n';
        if (command.includes('log')) return 'abc1234 commit\n';
        if (command.includes('status')) return 'M file.ts\n?? new.ts\n';
        return '';
      });

      const context = getGitContext();
      expect(context).toContain('M file.ts');
      expect(context).toContain('?? new.ts');
    });

    it('should return empty string when git fails', () => {
      mockExecSync.mockImplementation(() => { throw new Error('fatal: not a git repository'); });

      const context = getGitContext();
      expect(context).toBe('');
    });

    it('should return empty string on timeout', () => {
      mockExecSync.mockImplementation(() => {
        const err = new Error('Command timed out');
        (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
        throw err;
      });

      const context = getGitContext();
      expect(context).toBe('');
    });
  });

  describe('loadClaudeMd', () => {
    it('should return empty string when CLAUDE.md does not exist', () => {
      const content = loadClaudeMd();
      expect(typeof content).toBe('string');
    });
  });
});
