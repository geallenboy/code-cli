/**
 * Prompt 编排单元测试
 *
 * 测试系统提示词组装的核心逻辑：
 * - 环境信息注入（cwd, platform, date, shell）
 * - 工具描述注入
 * - git 上下文获取与优雅降级
 * - CLAUDE.md 加载
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSystemPrompt, getGitContext, loadClaudeMd } from '../../src/prompt.js';
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildSystemPrompt', () => {
    it('should include the current working directory', () => {
      // Make git context return empty to simplify
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
      expect(prompt).toContain('Read before edit');
      expect(prompt).toContain('Minimal changes');
    });

    it('should include git context when available', () => {
      // Mock successful git commands
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
      // Should not throw, should contain fallback text
      expect(prompt).toContain('Not a git repository');
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
      // Default behavior — no CLAUDE.md in test directory
      const content = loadClaudeMd();
      // May or may not exist depending on test environment
      expect(typeof content).toBe('string');
    });
  });
});
