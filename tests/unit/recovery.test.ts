/**
 * Post-Compression Recovery 单元测试
 *
 * 测试 extractRecentlyEditedFiles 和 buildRecoveryMessages。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelMessage, ToolCallPart } from 'ai';
import { extractRecentlyEditedFiles, buildRecoveryMessages } from '../../src/compactor/recovery.js';

// Mock file-ops module
vi.mock('../../src/tools/file-ops.js', () => ({
  readFileContent: vi.fn(),
}));

import { readFileContent } from '../../src/tools/file-ops.js';
const mockReadFileContent = vi.mocked(readFileContent);

/** Helper: create an assistant message with a tool call */
function makeToolCall(toolCallId: string, toolName: string, input: Record<string, unknown>): ModelMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId,
        toolName,
        input,
      } as ToolCallPart,
    ],
  };
}

describe('extractRecentlyEditedFiles', () => {
  it('should find edit_file and write_file paths', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Edit some files' },
      makeToolCall('tc-1', 'edit_file', { file_path: 'src/a.ts', content: '...' }),
      makeToolCall('tc-2', 'write_file', { file_path: 'src/b.ts', content: '...' }),
      makeToolCall('tc-3', 'read_file', { file_path: 'src/c.ts' }), // Not an edit
    ];

    const files = extractRecentlyEditedFiles(messages);
    expect(files).toContain('src/b.ts');
    expect(files).toContain('src/a.ts');
    expect(files).not.toContain('src/c.ts');
  });

  it('should return most recent files first (scans from end)', () => {
    const messages: ModelMessage[] = [
      makeToolCall('tc-1', 'edit_file', { file_path: 'first.ts', content: '...' }),
      makeToolCall('tc-2', 'edit_file', { file_path: 'second.ts', content: '...' }),
      makeToolCall('tc-3', 'write_file', { file_path: 'third.ts', content: '...' }),
    ];

    const files = extractRecentlyEditedFiles(messages);
    expect(files[0]).toBe('third.ts');
    expect(files[1]).toBe('second.ts');
    expect(files[2]).toBe('first.ts');
  });

  it('should deduplicate file paths', () => {
    const messages: ModelMessage[] = [
      makeToolCall('tc-1', 'edit_file', { file_path: 'src/a.ts', content: '...' }),
      makeToolCall('tc-2', 'edit_file', { file_path: 'src/a.ts', content: '...' }),
      makeToolCall('tc-3', 'write_file', { file_path: 'src/a.ts', content: '...' }),
    ];

    const files = extractRecentlyEditedFiles(messages);
    expect(files).toEqual(['src/a.ts']);
  });

  it('should limit to 5 files', () => {
    const messages: ModelMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(makeToolCall(`tc-${i}`, 'edit_file', { file_path: `file${i}.ts`, content: '...' }));
    }

    const files = extractRecentlyEditedFiles(messages);
    expect(files.length).toBe(5);
  });

  it('should return empty array for no edits', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      makeToolCall('tc-1', 'read_file', { file_path: 'src/a.ts' }),
    ];

    const files = extractRecentlyEditedFiles(messages);
    expect(files).toEqual([]);
  });
});

describe('buildRecoveryMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read files and build recovery message', () => {
    mockReadFileContent.mockImplementation((path: string) => {
      if (path === 'src/a.ts') return '1 | const a = 1;';
      if (path === 'src/b.ts') return '1 | const b = 2;';
      return 'Error: File not found';
    });

    const result = buildRecoveryMessages(['src/a.ts', 'src/b.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    const content = result[0].content as string;
    expect(content).toContain('[Post-compression recovery]');
    expect(content).toContain('src/a.ts');
    expect(content).toContain('src/b.ts');
    expect(content).toContain('const a = 1');
    expect(content).toContain('const b = 2');
  });

  it('should skip missing files', () => {
    mockReadFileContent.mockImplementation((path: string) => {
      if (path === 'exists.ts') return '1 | content';
      return 'Error: File not found: ' + path;
    });

    const result = buildRecoveryMessages(['missing.ts', 'exists.ts', 'also-missing.ts']);
    expect(result).toHaveLength(1);
    const content = result[0].content as string;
    expect(content).toContain('exists.ts');
    expect(content).not.toContain('missing.ts');
    expect(content).not.toContain('also-missing.ts');
  });

  it('should truncate files exceeding 5K chars', () => {
    const longContent = 'x'.repeat(6000);
    mockReadFileContent.mockReturnValue(longContent);

    const result = buildRecoveryMessages(['big.ts']);
    expect(result).toHaveLength(1);
    const content = result[0].content as string;
    expect(content).toContain('[truncated]');
    // The file content in the message should be at most 5000 chars + truncation marker
    const fileSection = content.split('File: big.ts\n')[1];
    expect(fileSection.length).toBeLessThanOrEqual(5000 + '[truncated]'.length + 1);
  });

  it('should respect 25K total limit', () => {
    // Each file returns 5000 chars — 5 files = 25K, 6th should be excluded
    mockReadFileContent.mockReturnValue('y'.repeat(5000));

    const paths = ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts'];
    const result = buildRecoveryMessages(paths);
    expect(result).toHaveLength(1);
    const content = result[0].content as string;
    // Should include at most 5 files (25K limit)
    expect(content).toContain('f1.ts');
    // f6.ts should be excluded due to total limit
    expect(content).not.toContain('f6.ts');
  });

  it('should return empty array when all files are missing', () => {
    mockReadFileContent.mockReturnValue('Error: File not found');

    const result = buildRecoveryMessages(['a.ts', 'b.ts']);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty file list', () => {
    const result = buildRecoveryMessages([]);
    expect(result).toEqual([]);
  });
});
