/**
 * Tab 文件路径补全单元测试
 *
 * 测试路径 token 提取、公共前缀计算、文件路径补全逻辑。
 * 使用临时目录模拟文件系统。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractPathToken,
  longestCommonPrefix,
  listEntries,
  completeFilePath,
  handleTabCompletion,
} from '../../src/tab-completer.js';

describe('extractPathToken', () => {
  it('should extract token from end of text', () => {
    expect(extractPathToken('look at src/foo', 15)).toBe('src/foo');
  });

  it('should extract token when cursor is at start', () => {
    expect(extractPathToken('src/foo', 7)).toBe('src/foo');
  });

  it('should extract token after space', () => {
    expect(extractPathToken('edit src/bar.ts', 15)).toBe('src/bar.ts');
  });

  it('should return empty string for empty text', () => {
    expect(extractPathToken('', 0)).toBe('');
  });

  it('should handle cursor in middle of text', () => {
    expect(extractPathToken('look at src/foo bar', 15)).toBe('src/foo');
  });

  it('should handle tab character as separator', () => {
    expect(extractPathToken('edit\tsrc/foo', 12)).toBe('src/foo');
  });
});

describe('longestCommonPrefix', () => {
  it('should return empty for empty array', () => {
    expect(longestCommonPrefix([])).toBe('');
  });

  it('should return the string for single element', () => {
    expect(longestCommonPrefix(['hello'])).toBe('hello');
  });

  it('should find common prefix', () => {
    expect(longestCommonPrefix(['abc', 'abd', 'abe'])).toBe('ab');
  });

  it('should return empty when no common prefix', () => {
    expect(longestCommonPrefix(['abc', 'xyz'])).toBe('');
  });

  it('should handle identical strings', () => {
    expect(longestCommonPrefix(['same', 'same', 'same'])).toBe('same');
  });
});

describe('listEntries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `tab-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should list files and directories', () => {
    writeFileSync(join(tmpDir, 'file.txt'), '');
    mkdirSync(join(tmpDir, 'subdir'));
    const entries = listEntries(tmpDir);
    expect(entries).toContain('file.txt');
    expect(entries).toContain('subdir' + sep);
  });

  it('should exclude default directories', () => {
    mkdirSync(join(tmpDir, 'node_modules'));
    mkdirSync(join(tmpDir, '.git'));
    mkdirSync(join(tmpDir, 'dist'));
    writeFileSync(join(tmpDir, 'index.ts'), '');
    const entries = listEntries(tmpDir);
    expect(entries).toEqual(['index.ts']);
  });

  it('should return empty array for non-existent directory', () => {
    expect(listEntries('/nonexistent-path-12345')).toEqual([]);
  });

  it('should sort entries', () => {
    writeFileSync(join(tmpDir, 'c.txt'), '');
    writeFileSync(join(tmpDir, 'a.txt'), '');
    writeFileSync(join(tmpDir, 'b.txt'), '');
    const entries = listEntries(tmpDir);
    expect(entries).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });
});

describe('completeFilePath', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `tab-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return null when no matches', () => {
    expect(completeFilePath('nonexistent', tmpDir)).toBeNull();
  });

  it('should auto-complete single match', () => {
    writeFileSync(join(tmpDir, 'unique-file.ts'), '');
    const result = completeFilePath('unique', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.completed).toBe('unique-file.ts');
    expect(result!.candidates).toHaveLength(1);
  });

  it('should complete common prefix for multiple matches', () => {
    writeFileSync(join(tmpDir, 'src-main.ts'), '');
    writeFileSync(join(tmpDir, 'src-test.ts'), '');
    const result = completeFilePath('src', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.completed).toBe('src-');
    expect(result!.candidates).toHaveLength(2);
  });

  it('should handle subdirectory paths', () => {
    mkdirSync(join(tmpDir, 'sub'));
    writeFileSync(join(tmpDir, 'sub', 'file.ts'), '');
    const result = completeFilePath('sub/fi', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.completed).toBe(join('sub', 'file.ts'));
  });

  it('should list all entries for empty partial path', () => {
    writeFileSync(join(tmpDir, 'a.ts'), '');
    writeFileSync(join(tmpDir, 'b.ts'), '');
    const result = completeFilePath('', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.candidates).toHaveLength(2);
  });

  it('should append separator for directory matches', () => {
    mkdirSync(join(tmpDir, 'mydir'));
    const result = completeFilePath('my', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.completed).toBe('mydir' + sep);
  });
});

describe('handleTabCompletion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `tab-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return null when no matches', () => {
    expect(handleTabCompletion('nonexistent', 11, tmpDir)).toBeNull();
  });

  it('should replace token with completed path', () => {
    writeFileSync(join(tmpDir, 'hello-world.ts'), '');
    const result = handleTabCompletion('edit hello', 10, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.line).toBe('edit hello-world.ts');
    expect(result!.cursorCol).toBe(19);
  });

  it('should preserve text after cursor', () => {
    writeFileSync(join(tmpDir, 'file.ts'), '');
    const result = handleTabCompletion('look fi more', 7, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.line).toBe('look file.ts more');
  });

  it('should handle completion at start of line', () => {
    writeFileSync(join(tmpDir, 'readme.md'), '');
    const result = handleTabCompletion('read', 4, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.line).toBe('readme.md');
    expect(result!.cursorCol).toBe(9);
  });
});
