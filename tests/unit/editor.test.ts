/**
 * write_file 工具单元测试
 *
 * 测试 writeFile 的核心逻辑：
 * - 创建文件并写入内容
 * - 自动创建缺失的父目录
 * - 返回包含行数的成功消息
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from '../../src/tools/editor.js';
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, '__fixtures_editor__');

describe('writeFile', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should create a file with the provided content', () => {
    const filePath = join(TEST_DIR, 'output.txt');
    writeFile(filePath, 'hello world');

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });

  it('should create parent directories automatically', () => {
    const filePath = join(TEST_DIR, 'deep', 'nested', 'dir', 'file.txt');
    const result = writeFile(filePath, 'nested content');

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('nested content');
    expect(result).toContain('File written');
  });

  it('should return success message with correct line count', () => {
    const filePath = join(TEST_DIR, 'lines.txt');
    const content = 'line1\nline2\nline3';
    const result = writeFile(filePath, content);

    expect(result).toContain('File written');
    expect(result).toContain(filePath);
    expect(result).toContain('3 lines');
  });

  it('should count single line correctly', () => {
    const filePath = join(TEST_DIR, 'single.txt');
    const result = writeFile(filePath, 'one line');

    expect(result).toContain('1 lines');
  });

  it('should overwrite existing file', () => {
    const filePath = join(TEST_DIR, 'overwrite.txt');
    writeFile(filePath, 'original');
    writeFile(filePath, 'updated');

    expect(readFileSync(filePath, 'utf-8')).toBe('updated');
  });

  it('should return error message on failure without throwing', () => {
    // Try to write to an invalid path (empty string triggers an error)
    const result = writeFile('', 'content');
    expect(result).toContain('Error');
  });
});
