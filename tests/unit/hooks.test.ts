/**
 * Hook 系统单元测试
 *
 * 测试 HookSystem 的核心逻辑：
 * - 未信任工作区跳过所有 hook
 * - 匹配模式：精确、管道 OR、正则
 * - Hook 执行和结果解析
 * - 超时处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;

describe('HookSystem', () => {
  beforeEach(() => {
    vi.resetModules();
    tempDir = join(
      tmpdir(),
      `gearcode-hooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });

    vi.doMock('node:os', () => ({
      homedir: () => tempDir,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function getHookModule() {
    return await import('../../src/hooks.js');
  }

  function writeSettings(settings: object): void {
    const settingsDir = join(tempDir, '.gearcode');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify(settings), 'utf-8');
  }

  describe('untrusted workspace', () => {
    it('should skip all hooks when not trusted', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(false);
      const results = await system.executeHooks('PreToolUse', { toolName: 'write_file' });
      expect(results).toEqual([]);
    });

    it('should report not trusted', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(false);
      expect(system.isTrusted).toBe(false);
    });
  });

  describe('hook loading', () => {
    it('should load hooks from settings.json', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            {
              matcher: 'write_file',
              hooks: [{ type: 'command', command: 'echo {}' }],
            },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      expect(system.hookCount).toBe(1);
    });

    it('should handle missing settings file', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      expect(system.hookCount).toBe(0);
    });

    it('should handle malformed settings file', async () => {
      const settingsDir = join(tempDir, '.gearcode');
      mkdirSync(settingsDir, { recursive: true });
      writeFileSync(join(settingsDir, 'settings.json'), 'not valid json{{{', 'utf-8');

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      expect(system.hookCount).toBe(0);
    });

    it('should only load command type hooks', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: 'command', command: 'echo {}' },
                { type: 'unknown', command: 'echo bad' },
              ],
            },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      expect(system.hookCount).toBe(1);
    });

    it('should load multiple hooks across events', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            { hooks: [{ type: 'command', command: 'echo pre' }] },
          ],
          PostToolUse: [
            { hooks: [{ type: 'command', command: 'echo post' }] },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      expect(system.hookCount).toBe(2);
    });
  });

  describe('matchesPattern', () => {
    it('should match all when no matcher is specified', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(false);
      expect(system.matchesPattern(undefined, { toolName: 'anything' })).toBe(true);
    });

    it('should match exact tool name', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(false);
      expect(system.matchesPattern('write_file', { toolName: 'write_file' })).toBe(true);
      expect(system.matchesPattern('write_file', { toolName: 'read_file' })).toBe(false);
    });

    it('should match pipe-delimited OR patterns', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(false);
      expect(system.matchesPattern('write_file|edit_file', { toolName: 'write_file' })).toBe(true);
      expect(system.matchesPattern('write_file|edit_file', { toolName: 'edit_file' })).toBe(true);
      expect(system.matchesPattern('write_file|edit_file', { toolName: 'read_file' })).toBe(false);
    });

    it('should match regex patterns', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(false);
      expect(system.matchesPattern('write_.*', { toolName: 'write_file' })).toBe(true);
      expect(system.matchesPattern('^read', { toolName: 'read_file' })).toBe(true);
      expect(system.matchesPattern('^read', { toolName: 'write_file' })).toBe(false);
    });

    it('should handle invalid regex gracefully', async () => {
      const { HookSystem } = await getHookModule();
      const system = new HookSystem(false);
      // Invalid regex should return false, not throw
      expect(system.matchesPattern('[invalid', { toolName: 'test' })).toBe(false);
    });
  });

  describe('hook execution', () => {
    it('should execute a hook and parse JSON output', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            {
              matcher: 'write_file',
              hooks: [
                {
                  type: 'command',
                  command: 'echo \'{"allow": true}\'',
                },
              ],
            },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      const results = await system.executeHooks('PreToolUse', { toolName: 'write_file' });
      expect(results.length).toBe(1);
      expect(results[0].allow).toBe(true);
    });

    it('should return empty for non-matching events', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            {
              matcher: 'write_file',
              hooks: [{ type: 'command', command: 'echo \'{"allow": true}\'' }],
            },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      const results = await system.executeHooks('PostToolUse', { toolName: 'write_file' });
      expect(results).toEqual([]);
    });

    it('should return empty result for hook errors', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'nonexistent_command_xyz_12345',
                },
              ],
            },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      const results = await system.executeHooks('PreToolUse', { toolName: 'test' });
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({}); // no-decision
    });

    it('should handle deny result', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            {
              matcher: 'run_shell',
              hooks: [
                {
                  type: 'command',
                  command: 'echo \'{"deny": true, "reason": "blocked by policy"}\'',
                },
              ],
            },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      const results = await system.executeHooks('PreToolUse', { toolName: 'run_shell' });
      expect(results.length).toBe(1);
      expect(results[0].deny).toBe(true);
      expect(results[0].reason).toBe('blocked by policy');
    });

    it('should handle timeout gracefully', async () => {
      writeSettings({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'sleep 10',
                  timeout: 100, // 100ms timeout
                },
              ],
            },
          ],
        },
      });

      const { HookSystem } = await getHookModule();
      const system = new HookSystem(true);
      const results = await system.executeHooks('PreToolUse', { toolName: 'test' });
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({}); // no-decision on timeout
    });
  });
});
