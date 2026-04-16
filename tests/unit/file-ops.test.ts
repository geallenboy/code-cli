/**
 * 文件操作工具单元测试
 *
 * 测试 readFileContent 的核心逻辑：
 * - 有效文件 → 行号前缀
 * - 不存在的文件 → 错误消息
 * - 空文件 → 正确处理
 * - 行号格式：右对齐 + " | " 分隔符
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileContent } from '../../src/tools/file-ops.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures_file_ops__');

describe('readFileContent', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should return file content with line numbers prefixed', () => {
    const filePath = join(TEST_DIR, 'sample.txt');
    writeFileSync(filePath, 'hello\nworld\n', 'utf-8');

    const result = readFileContent(filePath);
    expect(result).toContain('1 | hello');
    expect(result).toContain('2 | world');
  });

  it('should right-align line numbers for multi-digit files', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
    const filePath = join(TEST_DIR, 'multiline.txt');
    writeFileSync(filePath, lines.join('\n'), 'utf-8');

    const result = readFileContent(filePath);
    // Line 1 should be padded: " 1 | line 1"
    expect(result).toContain(' 1 | line 1');
    // Line 12 should not be padded: "12 | line 12"
    expect(result).toContain('12 | line 12');
  });

  it('should use " | " as separator between line number and content', () => {
    const filePath = join(TEST_DIR, 'separator.txt');
    writeFileSync(filePath, 'test line', 'utf-8');

    const result = readFileContent(filePath);
    expect(result).toMatch(/\d+ \| test line/);
  });

  it('should return error message for non-existent file', () => {
    const result = readFileContent(join(TEST_DIR, 'does-not-exist.txt'));
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should not throw for non-existent file', () => {
    expect(() => readFileContent(join(TEST_DIR, 'missing.txt'))).not.toThrow();
  });

  it('should handle empty file correctly', () => {
    const filePath = join(TEST_DIR, 'empty.txt');
    writeFileSync(filePath, '', 'utf-8');

    const result = readFileContent(filePath);
    // Empty file has one empty line after split
    expect(result).toContain('1 | ');
  });

  it('should handle single-line file without trailing newline', () => {
    const filePath = join(TEST_DIR, 'single.txt');
    writeFileSync(filePath, 'only line', 'utf-8');

    const result = readFileContent(filePath);
    expect(result).toBe('1 | only line');
  });
});
