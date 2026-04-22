/**
 * Shell 流式执行器单元测试
 *
 * 测试 executeShellStreaming 的核心逻辑：
 * - 基本命令执行
 * - 实时输出缩进
 * - 超时处理
 * - spawn 失败回退
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeShellStreaming } from '../../src/tools/shell.js';

describe('executeShellStreaming', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute a basic command and return stdout', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = await executeShellStreaming('echo "hello world"');
    expect(result.trim()).toBe('hello world');
  });

  it('should return non-zero exit code info on failure', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await executeShellStreaming('exit 42');
    expect(result).toContain('Exit code: 42');
  });

  it('should write indented output to stdout', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await executeShellStreaming('echo "test line"');
    const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    // Each line should be indented with 2 spaces
    expect(allOutput).toContain('  test line');
  });

  it('should handle timeout by killing the process', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await executeShellStreaming('sleep 10', 500);
    expect(result).toContain('Command timed out');
  }, 10_000);

  it('should handle commands with stderr output', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await executeShellStreaming('echo "err" >&2; exit 1');
    expect(result).toContain('Exit code: 1');
    expect(result).toContain('STDERR');
  });
});
