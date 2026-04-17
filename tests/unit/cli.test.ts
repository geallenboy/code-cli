/**
 * CLI 单元测试
 *
 * 测试命令行参数解析逻辑：
 * - 默认值
 * - --provider, --model 参数
 * - --yolo, --resume 标志
 * - 位置参数（一次性模式 prompt）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseArgs } from '../../src/cli.js';

describe('parseArgs', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  function setArgs(...args: string[]): void {
    process.argv = ['node', 'index.js', ...args];
  }

  it('should return defaults when no arguments provided', () => {
    setArgs();
    const result = parseArgs();
    expect(result.provider).toBe('anthropic');
    expect(result.yolo).toBe(false);
    expect(result.resume).toBe(false);
    expect(result.prompt).toBeUndefined();
    expect(result.model).toBeUndefined();
  });

  it('should parse --provider flag', () => {
    setArgs('--provider', 'openai');
    const result = parseArgs();
    expect(result.provider).toBe('openai');
  });

  it('should parse --model flag', () => {
    setArgs('--model', 'gpt-4o-mini');
    const result = parseArgs();
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('should parse --yolo flag', () => {
    setArgs('--yolo');
    const result = parseArgs();
    expect(result.yolo).toBe(true);
  });

  it('should parse --resume flag', () => {
    setArgs('--resume');
    const result = parseArgs();
    expect(result.resume).toBe(true);
  });

  it('should parse positional arguments as prompt', () => {
    setArgs('fix', 'the', 'bug');
    const result = parseArgs();
    expect(result.prompt).toBe('fix the bug');
  });

  it('should combine all flags', () => {
    setArgs('--provider', 'google', '--model', 'gemini-2.5-flash', '--yolo', '--resume');
    const result = parseArgs();
    expect(result.provider).toBe('google');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.yolo).toBe(true);
    expect(result.resume).toBe(true);
  });

  it('should handle flags mixed with positional args', () => {
    setArgs('--provider', 'openai', 'hello', 'world');
    const result = parseArgs();
    expect(result.provider).toBe('openai');
    expect(result.prompt).toBe('hello world');
  });

  it('should ignore unknown flags starting with --', () => {
    setArgs('--unknown');
    const result = parseArgs();
    expect(result.prompt).toBeUndefined();
    expect(result.provider).toBe('anthropic'); // default unchanged
  });
});
