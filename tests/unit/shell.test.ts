/**
 * Shell 执行器单元测试
 *
 * 测试 executeShellCommand 的核心逻辑：
 * - 简单命令（echo）→ 返回 stdout
 * - 失败命令 → 返回 exit code + stderr
 * - 超时处理
 * - isDangerousCommand 检测
 */

import { describe, it, expect } from 'vitest';
import { executeShellCommand, isDangerousCommand } from '../../src/tools/shell.js';

describe('executeShellCommand', () => {
  it('should return stdout for a simple echo command', () => {
    const result = executeShellCommand('echo "hello world"');
    expect(result.trim()).toBe('hello world');
  });

  it('should return exit code and stderr for a failing command', () => {
    const result = executeShellCommand('node -e "process.exit(42)"');
    expect(result).toContain('Exit code: 42');
  });

  it('should include stderr in the output for failing commands', () => {
    const result = executeShellCommand('node -e "console.error(\'oops\'); process.exit(1)"');
    expect(result).toContain('STDERR');
    expect(result).toContain('oops');
  });

  it('should handle timeout by returning a timeout message', () => {
    // Use a command that sleeps longer than the timeout
    const result = executeShellCommand('sleep 10', 500);
    expect(result).toContain('timed out');
  });

  it('should not throw on any command execution', () => {
    expect(() => executeShellCommand('false')).not.toThrow();
    expect(() => executeShellCommand('nonexistent_command_xyz 2>/dev/null')).not.toThrow();
  });

  it('should return stdout for multi-line output', () => {
    const result = executeShellCommand('echo "line1" && echo "line2"');
    expect(result).toContain('line1');
    expect(result).toContain('line2');
  });
});

describe('isDangerousCommand', () => {
  it('should detect rm commands', () => {
    expect(isDangerousCommand('rm -rf /')).toBe(true);
    expect(isDangerousCommand('rm file.txt')).toBe(true);
  });

  it('should detect destructive git operations', () => {
    expect(isDangerousCommand('git push origin main')).toBe(true);
    expect(isDangerousCommand('git reset --hard')).toBe(true);
    expect(isDangerousCommand('git clean -fd')).toBe(true);
  });

  it('should detect sudo commands', () => {
    expect(isDangerousCommand('sudo apt install')).toBe(true);
  });

  it('should detect kill commands', () => {
    expect(isDangerousCommand('kill -9 1234')).toBe(true);
    expect(isDangerousCommand('pkill node')).toBe(true);
  });

  it('should not flag safe commands', () => {
    expect(isDangerousCommand('echo hello')).toBe(false);
    expect(isDangerousCommand('ls -la')).toBe(false);
    expect(isDangerousCommand('git status')).toBe(false);
    expect(isDangerousCommand('git log')).toBe(false);
    expect(isDangerousCommand('cat file.txt')).toBe(false);
  });
});

import { needsConfirmation } from '../../src/tools/shell.js';

describe('needsConfirmation', () => {
  it('should return confirmation message for dangerous shell commands', () => {
    const result = needsConfirmation('run_shell', { command: 'rm -rf /tmp/test' });
    expect(result).not.toBeNull();
    expect(result).toContain('Dangerous command');
  });

  it('should return null for safe shell commands', () => {
    expect(needsConfirmation('run_shell', { command: 'echo hello' })).toBeNull();
    expect(needsConfirmation('run_shell', { command: 'ls -la' })).toBeNull();
    expect(needsConfirmation('run_shell', { command: 'git status' })).toBeNull();
  });

  it('should return null for non-shell tools', () => {
    expect(needsConfirmation('read_file', { file_path: 'test.ts' })).toBeNull();
    expect(needsConfirmation('edit_file', { file_path: 'test.ts' })).toBeNull();
  });

  it('should detect sudo as dangerous', () => {
    const result = needsConfirmation('run_shell', { command: 'sudo apt install vim' });
    expect(result).not.toBeNull();
  });

  it('should detect git push as dangerous', () => {
    const result = needsConfirmation('run_shell', { command: 'git push origin main' });
    expect(result).not.toBeNull();
  });

  it('should handle missing command gracefully', () => {
    expect(needsConfirmation('run_shell', {})).toBeNull();
    expect(needsConfirmation('run_shell', { command: 123 })).toBeNull();
  });
});
