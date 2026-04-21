/**
 * 会话持久化单元测试
 *
 * 测试 saveSession、loadSession、loadLatestSession 的核心行为。
 * 使用临时目录避免污染用户的 ~/.gearcode/sessions/。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SessionData } from '../../src/types.js';

// We'll mock the sessions directory to use a temp dir
let tempDir: string;

describe('session', () => {
  beforeEach(() => {
    vi.resetModules();
    tempDir = join(tmpdir(), `gearcode-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });

    // Mock os.homedir to redirect sessions to temp dir
    vi.doMock('node:os', () => ({
      homedir: () => tempDir,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up temp dir
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  async function getSessionModule() {
    return await import('../../src/session.js');
  }

  it('should save and load a session (round trip)', async () => {
    const { saveSession, loadSession } = await getSessionModule();

    const data: SessionData = {
      id: 'test-session-1',
      startTime: '2024-01-01T00:00:00.000Z',
      cwd: '/home/user/project',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    };

    saveSession('test-session-1', data);
    const loaded = loadSession('test-session-1');

    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(data.id);
    expect(loaded!.startTime).toBe(data.startTime);
    expect(loaded!.cwd).toBe(data.cwd);
    expect(loaded!.messages).toEqual(data.messages);
  });

  it('should return null for non-existent session', async () => {
    const { loadSession } = await getSessionModule();

    const result = loadSession('non-existent-id');
    expect(result).toBeNull();
  });

  it('should load the latest session', async () => {
    const { saveSession, loadLatestSession } = await getSessionModule();

    const session1: SessionData = {
      id: 'session-aaa',
      startTime: '2024-01-01T00:00:00.000Z',
      cwd: '/project1',
      messages: [],
    };
    const session2: SessionData = {
      id: 'session-zzz',
      startTime: '2024-01-02T00:00:00.000Z',
      cwd: '/project2',
      messages: [{ role: 'user', content: 'Latest' }],
    };

    saveSession('session-aaa', session1);
    saveSession('session-zzz', session2);

    const latest = loadLatestSession();
    expect(latest).not.toBeNull();
    // 'session-zzz' sorts after 'session-aaa', so it's the latest
    expect(latest!.id).toBe('session-zzz');
  });

  it('should return null when no sessions exist', async () => {
    const { loadLatestSession } = await getSessionModule();

    const result = loadLatestSession();
    expect(result).toBeNull();
  });

  it('should handle corrupted session file gracefully', async () => {
    const { loadSession } = await getSessionModule();

    // Write a corrupted JSON file
    const sessionsDir = join(tempDir, '.gearcode', 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'corrupted.json'), 'not valid json{{{', 'utf-8');

    const result = loadSession('corrupted');
    expect(result).toBeNull();
  });

  it('should preserve complex message structures', async () => {
    const { saveSession, loadSession } = await getSessionModule();

    const data: SessionData = {
      id: 'complex-session',
      startTime: '2024-06-15T12:00:00.000Z',
      cwd: '/home/user/complex',
      messages: [
        { role: 'user', content: 'Read file' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'tool-call', toolCallId: 'tc1', toolName: 'read_file', input: { file_path: 'test.ts' } },
          ],
        },
        {
          role: 'tool',
          content: [
            { type: 'tool-result', toolCallId: 'tc1', toolName: 'read_file', output: { type: 'text', value: 'file content' } },
          ],
        },
      ],
    };

    saveSession('complex-session', data);
    const loaded = loadSession('complex-session');

    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toEqual(data.messages);
  });
});
