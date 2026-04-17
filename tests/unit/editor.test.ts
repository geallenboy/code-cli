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

import { editFile } from '../../src/tools/editor.js';
import { writeFileSync } from 'node:fs';

describe('editFile', () => {
  const EDIT_DIR = join(import.meta.dirname, '__fixtures_edit__');

  beforeEach(() => {
    mkdirSync(EDIT_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(EDIT_DIR, { recursive: true, force: true });
  });

  it('should replace old_string with new_string when unique match', () => {
    const filePath = join(EDIT_DIR, 'test.ts');
    writeFileSync(filePath, 'const x = 1;\nconst y = 2;\nconst z = 3;\n');

    const result = editFile(filePath, 'const y = 2;', 'const y = 42;');

    expect(result).toContain('File edited');
    expect(readFileSync(filePath, 'utf-8')).toBe('const x = 1;\nconst y = 42;\nconst z = 3;\n');
  });

  it('should return error when old_string not found', () => {
    const filePath = join(EDIT_DIR, 'test.ts');
    writeFileSync(filePath, 'const x = 1;\n');

    const result = editFile(filePath, 'const y = 2;', 'const y = 42;');

    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should return error when old_string matches multiple times', () => {
    const filePath = join(EDIT_DIR, 'test.ts');
    writeFileSync(filePath, 'foo\nbar\nfoo\nbaz\n');

    const result = editFile(filePath, 'foo', 'qux');

    expect(result).toContain('Error');
    expect(result).toContain('2 times');
  });

  it('should return error when file does not exist', () => {
    const result = editFile(join(EDIT_DIR, 'nonexistent.ts'), 'old', 'new');

    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should handle multi-line old_string', () => {
    const filePath = join(EDIT_DIR, 'multi.ts');
    writeFileSync(filePath, 'function hello() {\n  return "hi";\n}\n');

    const result = editFile(
      filePath,
      'function hello() {\n  return "hi";\n}',
      'function hello() {\n  return "hello world";\n}',
    );

    expect(result).toContain('File edited');
    expect(readFileSync(filePath, 'utf-8')).toBe('function hello() {\n  return "hello world";\n}\n');
  });

  it('should handle replacing with empty string (deletion)', () => {
    const filePath = join(EDIT_DIR, 'delete.ts');
    writeFileSync(filePath, 'line1\nline2\nline3\n');

    const result = editFile(filePath, 'line2\n', '');

    expect(result).toContain('File edited');
    expect(readFileSync(filePath, 'utf-8')).toBe('line1\nline3\n');
  });

  it('should preserve file content outside the match', () => {
    const filePath = join(EDIT_DIR, 'preserve.ts');
    const original = '// header\nconst a = 1;\nconst b = 2;\n// footer\n';
    writeFileSync(filePath, original);

    editFile(filePath, 'const b = 2;', 'const b = 99;');

    const updated = readFileSync(filePath, 'utf-8');
    expect(updated).toContain('// header');
    expect(updated).toContain('const a = 1;');
    expect(updated).toContain('const b = 99;');
    expect(updated).toContain('// footer');
  });

  it('should report correct line counts in success message', () => {
    const filePath = join(EDIT_DIR, 'lines.ts');
    writeFileSync(filePath, 'old line\n');

    const result = editFile(filePath, 'old line', 'new line 1\nnew line 2\nnew line 3');

    expect(result).toContain('replaced 1 line');
    expect(result).toContain('3 lines');
  });
});
