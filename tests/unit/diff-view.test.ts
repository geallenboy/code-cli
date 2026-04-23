/**
 * DiffView 组件单元测试
 *
 * 需求 9：文件编辑差异视图组件
 * - 9.1 渲染删除行（红色）和新增行（绿色）的差异视图
 * - 9.2 显示 3 行上下文（与 git diff 一致）
 * - 9.3 显示行号和文件路径头部信息
 * - 9.4 复用 renderEnhancedDiff 的差异计算逻辑
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  DiffView,
  computeDiffHunks,
  formatLineNum,
} from '../../src/ink-app/DiffView.js';

// ─── computeDiffHunks ───

describe('computeDiffHunks', () => {
  it('should return empty hunks for identical content', () => {
    const result = computeDiffHunks('same', 'same', 'test.ts');
    expect(result.hunks).toHaveLength(0);
    expect(result.totalAdded).toBe(0);
    expect(result.totalRemoved).toBe(0);
  });

  it('should detect added lines', () => {
    const result = computeDiffHunks('line1\nline2\n', 'line1\nline2\nline3\n', 'test.ts');
    expect(result.totalAdded).toBe(1);
    expect(result.totalRemoved).toBe(0);
    const addedLines = result.hunks.flatMap(h => h.lines).filter(l => l.type === 'added');
    expect(addedLines).toHaveLength(1);
    expect(addedLines[0].content).toBe('line3');
  });

  it('should detect removed lines', () => {
    const result = computeDiffHunks('line1\nline2\nline3\n', 'line1\nline2\n', 'test.ts');
    expect(result.totalRemoved).toBe(1);
    expect(result.totalAdded).toBe(0);
    const removedLines = result.hunks.flatMap(h => h.lines).filter(l => l.type === 'removed');
    expect(removedLines).toHaveLength(1);
    expect(removedLines[0].content).toBe('line3');
  });

  it('should detect modified lines as remove + add', () => {
    const result = computeDiffHunks('old line', 'new line', 'test.ts');
    expect(result.totalRemoved).toBe(1);
    expect(result.totalAdded).toBe(1);
  });

  it('should include context lines with both line numbers', () => {
    const old = 'ctx1\nold\nctx2';
    const newContent = 'ctx1\nnew\nctx2';
    const result = computeDiffHunks(old, newContent, 'test.ts');
    const contextLines = result.hunks.flatMap(h => h.lines).filter(l => l.type === 'context');
    for (const ctx of contextLines) {
      expect(ctx.oldLineNum).toBeDefined();
      expect(ctx.newLineNum).toBeDefined();
    }
  });

  it('should respect custom contextLines parameter', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const oldContent = lines.join('\n');
    const newLines = [...lines];
    newLines[10] = 'modified11';
    const newContent = newLines.join('\n');

    const result1 = computeDiffHunks(oldContent, newContent, 'test.ts', 1);
    const result3 = computeDiffHunks(oldContent, newContent, 'test.ts', 3);

    const ctx1 = result1.hunks.flatMap(h => h.lines).filter(l => l.type === 'context');
    const ctx3 = result3.hunks.flatMap(h => h.lines).filter(l => l.type === 'context');
    // More context lines with contextLines=3 than contextLines=1
    expect(ctx3.length).toBeGreaterThan(ctx1.length);
  });

  it('should generate hunk headers with correct format', () => {
    const result = computeDiffHunks('old', 'new', 'test.ts');
    expect(result.hunks.length).toBeGreaterThan(0);
    expect(result.hunks[0].header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
  });

  it('should assign correct line numbers to removed lines', () => {
    const result = computeDiffHunks('a\nb\nc', 'a\nc', 'test.ts');
    const removed = result.hunks.flatMap(h => h.lines).filter(l => l.type === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].oldLineNum).toBe(2);
    expect(removed[0].newLineNum).toBeUndefined();
  });

  it('should assign correct line numbers to added lines', () => {
    const result = computeDiffHunks('a\nc', 'a\nb\nc', 'test.ts');
    const added = result.hunks.flatMap(h => h.lines).filter(l => l.type === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].newLineNum).toBe(2);
    expect(added[0].oldLineNum).toBeUndefined();
  });

  it('should handle new file (empty old content)', () => {
    const result = computeDiffHunks('', 'line1\nline2\nline3', 'test.ts');
    expect(result.totalAdded).toBe(3);
    expect(result.totalRemoved).toBe(0);
    const allLines = result.hunks.flatMap(h => h.lines);
    expect(allLines.every(l => l.type === 'added')).toBe(true);
  });
});

// ─── formatLineNum ───

describe('formatLineNum', () => {
  it('should pad number to specified width', () => {
    expect(formatLineNum(1, 3)).toBe('  1');
    expect(formatLineNum(42, 4)).toBe('  42');
    expect(formatLineNum(100, 3)).toBe('100');
  });

  it('should return spaces for undefined', () => {
    expect(formatLineNum(undefined, 3)).toBe('   ');
    expect(formatLineNum(undefined, 1)).toBe(' ');
  });

  it('should handle single digit width', () => {
    expect(formatLineNum(5, 1)).toBe('5');
  });
});

// ─── DiffView component rendering ───

describe('DiffView', () => {
  it('should render file path header', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: 'old',
        newContent: 'new',
        filePath: 'src/utils.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('📝');
    expect(output).toContain('src/utils.ts');
  });

  it('should render no changes message for identical content', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: 'same content',
        newContent: 'same content',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('(no changes)');
    expect(output).toContain('📝');
    expect(output).toContain('test.ts');
  });

  it('should render removed lines with - prefix', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: 'old line',
        newContent: 'new line',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('- old line');
  });

  it('should render added lines with + prefix', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: 'old line',
        newContent: 'new line',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('+ new line');
  });

  it('should render hunk header', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: 'old',
        newContent: 'new',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('@@');
  });

  it('should render summary line with change counts', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: 'old',
        newContent: 'new',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('+1 -1 lines changed');
  });

  it('should render context lines around changes', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    const oldContent = lines.join('\n');
    const newLines = [...lines];
    newLines[5] = 'modified6';
    const newContent = newLines.join('\n');

    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent,
        newContent,
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    // Context lines around the change at line 6
    expect(output).toContain('line4');
    expect(output).toContain('line5');
    expect(output).toContain('line7');
    expect(output).toContain('line8');
  });

  it('should render line numbers', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: 'a\nb\nc',
        newContent: 'a\nx\nc',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    // Should contain numeric line numbers
    expect(output).toMatch(/\d/);
  });

  it('should render all lines as additions for new files', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: '',
        newContent: 'line1\nline2\nline3',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('+ line1');
    expect(output).toContain('+ line2');
    expect(output).toContain('+ line3');
  });

  it('should render only additions count for new files', () => {
    const { lastFrame } = render(
      React.createElement(DiffView, {
        oldContent: '',
        newContent: 'a\nb\nc',
        filePath: 'test.ts',
      }),
    );
    const output = lastFrame();
    expect(output).toContain('+3 -0 lines changed');
  });

  it('should support custom contextLines prop', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const oldContent = lines.join('\n');
    const newLines = [...lines];
    newLines[10] = 'modified11';
    const newContent = newLines.join('\n');

    const { lastFrame: frame1 } = render(
      React.createElement(DiffView, {
        oldContent,
        newContent,
        filePath: 'test.ts',
        contextLines: 1,
      }),
    );
    const output1 = frame1();

    // With 1 context line, should show line10 and line12 but not line8
    expect(output1).toContain('line10');
    expect(output1).toContain('line12');
    expect(output1).not.toContain('line8');
  });
});
