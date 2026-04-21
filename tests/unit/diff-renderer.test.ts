/**
 * Diff 渲染器单元测试与属性测试
 *
 * 测试 renderEnhancedDiff 的核心逻辑：
 * - 行号显示、上下文行、红绿着色、截断逻辑、新文件处理
 *
 * 属性测试：
 * - 属性 3：Diff 正确性
 * - 属性 4：截断
 * - 属性 7：往返一致性
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { renderEnhancedDiff } from '../../src/diff-renderer.js';

// ANSI escape codes for matching
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

/**
 * Helper: strip all ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ===== Unit Tests =====

describe('renderEnhancedDiff', () => {
  describe('file header', () => {
    it('should show file path in header with 📝 emoji', () => {
      const result = renderEnhancedDiff('old', 'new', 'src/utils.ts');
      expect(result).toContain('📝 src/utils.ts');
    });
  });

  describe('hunk headers', () => {
    it('should show @@ hunk header with line ranges', () => {
      const result = renderEnhancedDiff('old', 'new', 'test.ts');
      expect(result).toContain('@@ -');
      expect(result).toContain('+');
      expect(result).toContain('@@');
    });
  });

  describe('line numbers', () => {
    it('should display line numbers for context, added, and removed lines', () => {
      const old = 'line1\nline2\nline3';
      const newContent = 'line1\nmodified\nline3';
      const result = renderEnhancedDiff(old, newContent, 'test.ts');
      const stripped = stripAnsi(result);
      // Should contain line numbers
      expect(stripped).toMatch(/\d+/);
    });

    it('should right-align line numbers', () => {
      // Create content with enough lines to need padding
      const lines = Array.from({ length: 12 }, (_, i) => `line${i + 1}`);
      const oldContent = lines.join('\n');
      const newLines = [...lines];
      newLines[9] = 'modified10';
      const newContent = newLines.join('\n');
      const result = renderEnhancedDiff(oldContent, newContent, 'test.ts');
      const stripped = stripAnsi(result);
      // Line numbers should be present and right-aligned (padded with spaces)
      expect(stripped).toContain('10');
    });
  });

  describe('context lines', () => {
    it('should show context lines around changes (default 3)', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const oldContent = lines.join('\n');
      const newLines = [...lines];
      newLines[5] = 'modified6';
      const newContent = newLines.join('\n');
      const result = stripAnsi(renderEnhancedDiff(oldContent, newContent, 'test.ts'));
      // Context lines around the change at line 6
      expect(result).toContain('line4');
      expect(result).toContain('line5');
      expect(result).toContain('line7');
      expect(result).toContain('line8');
    });

    it('should respect custom contextLines option', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      const oldContent = lines.join('\n');
      const newLines = [...lines];
      newLines[10] = 'modified11';
      const newContent = newLines.join('\n');
      const result = stripAnsi(
        renderEnhancedDiff(oldContent, newContent, 'test.ts', { contextLines: 1 }),
      );
      // With 1 context line, should show line10 and line12 but not line8 or line14
      expect(result).toContain('line10');
      expect(result).toContain('line12');
      expect(result).not.toContain('line8');
      expect(result).not.toContain('line14');
    });
  });

  describe('red/green coloring', () => {
    it('should show removed lines in red with - prefix', () => {
      const result = renderEnhancedDiff('old line', 'new line', 'test.ts');
      expect(result).toContain(RED);
      expect(result).toContain('- old line');
    });

    it('should show added lines in green with + prefix', () => {
      const result = renderEnhancedDiff('old line', 'new line', 'test.ts');
      expect(result).toContain(GREEN);
      expect(result).toContain('+ new line');
    });

    it('should show context lines in dim', () => {
      const old = 'context\nold\ncontext2';
      const newContent = 'context\nnew\ncontext2';
      const result = renderEnhancedDiff(old, newContent, 'test.ts');
      // Context lines should use DIM
      expect(result).toContain(DIM);
    });
  });

  describe('truncation', () => {
    it('should truncate output exceeding maxLines', () => {
      // Generate a large diff that would produce many output lines
      const oldLines = Array.from({ length: 100 }, (_, i) => `old_line_${i}`);
      const newLines = Array.from({ length: 100 }, (_, i) => `new_line_${i}`);
      const result = renderEnhancedDiff(
        oldLines.join('\n'),
        newLines.join('\n'),
        'test.ts',
        { maxLines: 80 },
      );
      const lineCount = result.split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(80);
    });

    it('should show summary when truncated', () => {
      const oldLines = Array.from({ length: 100 }, (_, i) => `old_line_${i}`);
      const newLines = Array.from({ length: 100 }, (_, i) => `new_line_${i}`);
      const result = renderEnhancedDiff(
        oldLines.join('\n'),
        newLines.join('\n'),
        'test.ts',
        { maxLines: 80 },
      );
      const stripped = stripAnsi(result);
      expect(stripped).toContain('truncated');
      expect(stripped).toMatch(/\+\d+/);
      expect(stripped).toMatch(/-\d+/);
      expect(stripped).toContain('lines changed');
    });

    it('should not truncate output within maxLines', () => {
      const result = renderEnhancedDiff('old', 'new', 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).not.toContain('truncated');
    });
  });

  describe('new file handling', () => {
    it('should show all lines as green additions when old content is empty', () => {
      const newContent = 'line1\nline2\nline3';
      const result = renderEnhancedDiff('', newContent, 'test.ts');
      expect(result).toContain(GREEN);
      expect(result).toContain('+ line1');
      expect(result).toContain('+ line2');
      expect(result).toContain('+ line3');
    });

    it('should not contain any red lines for new files', () => {
      const newContent = 'line1\nline2\nline3';
      const result = renderEnhancedDiff('', newContent, 'test.ts');
      expect(result).not.toContain(RED);
    });
  });

  describe('identical content', () => {
    it('should show no changes message for identical content', () => {
      const result = renderEnhancedDiff('same content', 'same content', 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('(no changes)');
    });

    it('should not contain red or green lines for identical content', () => {
      const result = renderEnhancedDiff('same\ncontent', 'same\ncontent', 'test.ts');
      expect(result).not.toContain(RED);
      expect(result).not.toContain(GREEN);
    });
  });

  describe('summary line', () => {
    it('should show change summary with +N -M format', () => {
      const result = renderEnhancedDiff('old', 'new', 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('+1 -1 lines changed');
    });

    it('should count additions and deletions correctly', () => {
      const old = 'a\nb\nc';
      const newContent = 'a\nx\ny\nz\nc';
      const result = renderEnhancedDiff(old, newContent, 'test.ts');
      const stripped = stripAnsi(result);
      // Removed 'b', added 'x', 'y', 'z'
      expect(stripped).toContain('+3 -1 lines changed');
    });
  });

  describe('edge cases', () => {
    it('should handle empty old and new content', () => {
      const result = renderEnhancedDiff('', '', 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('(no changes)');
    });

    it('should handle single line change', () => {
      const result = renderEnhancedDiff('hello', 'world', 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('- hello');
      expect(stripped).toContain('+ world');
    });

    it('should handle content with only additions', () => {
      const result = renderEnhancedDiff('line1', 'line1\nline2', 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('+ line2');
    });

    it('should handle content with only deletions', () => {
      const result = renderEnhancedDiff('line1\nline2', 'line1', 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('- line2');
    });
  });
});

// ===== Property Tests =====

/**
 * Arbitrary for generating multi-line text content.
 */
const textContentArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9 .,!?_:;()={}]+$/).filter((s) => s.length > 0 && s.length <= 60),
  { minLength: 1, maxLength: 30 },
).map((lines) => lines.join('\n'));

/**
 * Arbitrary for generating large text content (for truncation tests).
 */
const largeTextContentArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9 ]+$/).filter((s) => s.length > 0 && s.length <= 40),
  { minLength: 50, maxLength: 100 },
).map((lines) => lines.join('\n'));

describe('Property 3: Diff rendering correctness', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * For any two different texts, deleted lines appear in red,
   * added lines in green, with correct line numbers.
   */
  it('deleted lines appear in red and added lines appear in green with line numbers', () => {
    fc.assert(
      fc.property(
        textContentArb,
        textContentArb,
        (oldText, newText) => {
          // Skip identical content (no diff to verify)
          if (oldText === newText) return true;

          const result = renderEnhancedDiff(oldText, newText, 'test.ts');

          // Check that removed content uses RED
          const hasRemovedLines = result.includes(RED);
          const hasAddedLines = result.includes(GREEN);

          // At least one of red or green should be present for different content
          if (!hasRemovedLines && !hasAddedLines) return false;

          // Verify line numbers are present in the output
          const stripped = stripAnsi(result);
          // Line numbers should be numeric digits
          if (!/\d+/.test(stripped)) return false;

          // Verify red lines have - prefix and green lines have + prefix
          const lines = result.split('\n');
          for (const line of lines) {
            if (line.includes(RED) && !line.includes('@@')) {
              // Red lines should contain - prefix
              const strippedLine = stripAnsi(line);
              if (!strippedLine.includes('-')) return false;
            }
            if (line.includes(GREEN) && !line.includes('@@')) {
              // Green lines should contain + prefix
              const strippedLine = stripAnsi(line);
              if (!strippedLine.includes('+')) return false;
            }
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 4: Diff truncation', () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any content pair producing more than 80 lines of diff output,
   * the rendered result should not exceed 80 lines and should contain
   * a summary with addition and deletion counts.
   */
  it('output never exceeds maxLines when truncation is active', () => {
    fc.assert(
      fc.property(
        largeTextContentArb,
        largeTextContentArb,
        (oldText, newText) => {
          if (oldText === newText) return true;

          const maxLines = 80;
          const result = renderEnhancedDiff(oldText, newText, 'test.ts', { maxLines });
          const lineCount = result.split('\n').length;

          // Output should never exceed maxLines
          if (lineCount > maxLines) return false;

          // If truncation occurred, verify summary is present
          const stripped = stripAnsi(result);
          if (stripped.includes('truncated')) {
            // Summary should contain +N -M format
            if (!/\+\d+/.test(stripped)) return false;
            if (!/-\d+/.test(stripped)) return false;
            if (!stripped.includes('lines changed')) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 7: Diff round-trip consistency', () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * Diffing identical content produces no red/green lines.
   * For any text content, using it as both old and new content
   * should result in a "no changes" output with no colored diff lines.
   */
  it('diffing identical content produces no red or green lines', () => {
    fc.assert(
      fc.property(
        textContentArb,
        (text) => {
          const result = renderEnhancedDiff(text, text, 'test.ts');

          // Should not contain RED or GREEN escape codes
          if (result.includes(RED)) return false;
          if (result.includes(GREEN)) return false;

          // Should contain "no changes" indicator
          const stripped = stripAnsi(result);
          if (!stripped.includes('(no changes)')) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
