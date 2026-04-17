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

import { grepSearch, listFiles } from '../../src/tools/file-ops.js';

describe('grepSearch', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should find matching lines in files', () => {
    writeFileSync(join(TEST_DIR, 'a.ts'), 'const foo = 1;\nconst bar = 2;\n');
    writeFileSync(join(TEST_DIR, 'b.ts'), 'const baz = 3;\nconst foo = 4;\n');

    const result = grepSearch('foo', TEST_DIR);
    expect(result).toContain('foo');
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
  });

  it('should return "No matches found" when nothing matches', () => {
    writeFileSync(join(TEST_DIR, 'c.ts'), 'hello world\n');

    const result = grepSearch('zzzznotfound', TEST_DIR);
    expect(result).toContain('No matches found');
  });

  it('should return error for non-existent directory', () => {
    const result = grepSearch('test', '/tmp/nonexistent-dir-12345');
    expect(result).toContain('Error');
  });

  it('should include line numbers in results', () => {
    writeFileSync(join(TEST_DIR, 'd.ts'), 'line1\ntarget\nline3\n');

    const result = grepSearch('target', TEST_DIR);
    expect(result).toMatch(/:2:/); // line 2
  });

  it('should filter by include pattern', () => {
    writeFileSync(join(TEST_DIR, 'code.ts'), 'findme\n');
    writeFileSync(join(TEST_DIR, 'readme.md'), 'findme\n');

    const result = grepSearch('findme', TEST_DIR, '*.ts');
    expect(result).toContain('code.ts');
    expect(result).not.toContain('readme.md');
  });
});

describe('listFiles', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should list files in a directory', () => {
    writeFileSync(join(TEST_DIR, 'a.ts'), '');
    writeFileSync(join(TEST_DIR, 'b.ts'), '');
    writeFileSync(join(TEST_DIR, 'c.md'), '');

    const result = listFiles('.', TEST_DIR);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).toContain('c.md');
  });

  it('should filter by pattern', () => {
    writeFileSync(join(TEST_DIR, 'a.ts'), '');
    writeFileSync(join(TEST_DIR, 'b.ts'), '');
    writeFileSync(join(TEST_DIR, 'c.md'), '');

    const result = listFiles('*.ts', TEST_DIR);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).not.toContain('c.md');
  });

  it('should list files in subdirectories', () => {
    mkdirSync(join(TEST_DIR, 'sub'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'sub', 'nested.ts'), '');

    const result = listFiles('.', TEST_DIR);
    expect(result).toContain('nested.ts');
  });

  it('should exclude node_modules and .git', () => {
    mkdirSync(join(TEST_DIR, 'node_modules'), { recursive: true });
    mkdirSync(join(TEST_DIR, '.git'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'node_modules', 'pkg.js'), '');
    writeFileSync(join(TEST_DIR, '.git', 'config'), '');
    writeFileSync(join(TEST_DIR, 'src.ts'), '');

    const result = listFiles('.', TEST_DIR);
    expect(result).toContain('src.ts');
    expect(result).not.toContain('pkg.js');
    expect(result).not.toContain('config');
  });

  it('should return "No files found" for empty directory', () => {
    const emptyDir = join(TEST_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const result = listFiles('.', emptyDir);
    expect(result).toContain('No files found');
  });

  it('should return error for non-existent directory', () => {
    const result = listFiles('.', '/tmp/nonexistent-dir-12345');
    expect(result).toContain('Error');
  });
});
