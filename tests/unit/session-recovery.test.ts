/**
 * 自动会话恢复提示单元测试
 *
 * 测试会话检测逻辑、提示格式化、回答解析。
 * 使用临时目录模拟会话文件。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectRecoverableSession,
  formatRecoveryPrompt,
  parseRecoveryAnswer,
  type RecoveryCandidate,
} from '../../src/session-recovery.js';

describe('detectRecoverableSession', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return null for non-existent directory', () => {
    expect(detectRecoverableSession('/nonexistent-path-12345')).toBeNull();
  });

  it('should return null for empty directory', () => {
    expect(detectRecoverableSession(tmpDir)).toBeNull();
  });

  it('should return null for cleanly exited session', () => {
    writeFileSync(
      join(tmpDir, 'session-001.json'),
      JSON.stringify({
        id: 'session-001',
        startTime: '2025-01-01T00:00:00Z',
        cwd: '/home/user/project',
        messages: [{ role: 'user', content: 'hello' }],
        exitClean: true,
      }),
    );
    expect(detectRecoverableSession(tmpDir)).toBeNull();
  });

  it('should return null for session with no messages', () => {
    writeFileSync(
      join(tmpDir, 'session-001.json'),
      JSON.stringify({
        id: 'session-001',
        startTime: '2025-01-01T00:00:00Z',
        cwd: '/home/user/project',
        messages: [],
      }),
    );
    expect(detectRecoverableSession(tmpDir)).toBeNull();
  });

  it('should detect incomplete session', () => {
    writeFileSync(
      join(tmpDir, 'session-001.json'),
      JSON.stringify({
        id: 'session-001',
        startTime: '2025-01-01T00:00:00Z',
        cwd: '/home/user/project',
        messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }],
      }),
    );
    const result = detectRecoverableSession(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('session-001');
    expect(result!.messageCount).toBe(2);
    expect(result!.cwd).toBe('/home/user/project');
  });

  it('should pick the most recent session file', () => {
    writeFileSync(
      join(tmpDir, 'session-001.json'),
      JSON.stringify({
        id: 'session-001',
        startTime: '2025-01-01T00:00:00Z',
        cwd: '/old',
        messages: [{ role: 'user', content: 'old' }],
      }),
    );
    writeFileSync(
      join(tmpDir, 'session-002.json'),
      JSON.stringify({
        id: 'session-002',
        startTime: '2025-01-02T00:00:00Z',
        cwd: '/new',
        messages: [{ role: 'user', content: 'new' }],
      }),
    );
    const result = detectRecoverableSession(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('session-002');
  });

  it('should handle corrupted JSON gracefully', () => {
    writeFileSync(join(tmpDir, 'session-001.json'), 'not valid json{{{');
    expect(detectRecoverableSession(tmpDir)).toBeNull();
  });

  it('should handle missing fields gracefully', () => {
    writeFileSync(
      join(tmpDir, 'session-001.json'),
      JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    );
    const result = detectRecoverableSession(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('session-001');
    expect(result!.startTime).toBe('unknown');
    expect(result!.cwd).toBe('unknown');
  });
});

describe('formatRecoveryPrompt', () => {
  it('should format prompt with session info', () => {
    const candidate: RecoveryCandidate = {
      id: 'session-001',
      startTime: '2025-01-15T10:30:00Z',
      cwd: '/home/user/project',
      messageCount: 5,
    };
    const prompt = formatRecoveryPrompt(candidate);
    expect(prompt).toContain('/home/user/project');
    expect(prompt).toContain('5');
    expect(prompt).toContain('Resume');
  });

  it('should handle unknown start time', () => {
    const candidate: RecoveryCandidate = {
      id: 'session-001',
      startTime: 'unknown',
      cwd: '/home/user/project',
      messageCount: 3,
    };
    const prompt = formatRecoveryPrompt(candidate);
    expect(prompt).toContain('unknown time');
  });
});

describe('parseRecoveryAnswer', () => {
  it('should accept "y"', () => {
    expect(parseRecoveryAnswer('y')).toBe(true);
  });

  it('should accept "yes"', () => {
    expect(parseRecoveryAnswer('yes')).toBe(true);
  });

  it('should accept "Y" (case-insensitive)', () => {
    expect(parseRecoveryAnswer('Y')).toBe(true);
  });

  it('should accept "YES" (case-insensitive)', () => {
    expect(parseRecoveryAnswer('YES')).toBe(true);
  });

  it('should reject "n"', () => {
    expect(parseRecoveryAnswer('n')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(parseRecoveryAnswer('')).toBe(false);
  });

  it('should reject random text', () => {
    expect(parseRecoveryAnswer('maybe')).toBe(false);
  });

  it('should trim whitespace', () => {
    expect(parseRecoveryAnswer('  y  ')).toBe(true);
  });
});
