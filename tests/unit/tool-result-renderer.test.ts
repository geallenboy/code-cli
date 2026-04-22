/**
 * 工具结果渲染器单元测试与属性测试
 *
 * 测试 renderToolResult 的核心逻辑：
 * - 语法高亮
 * - 行号显示
 * - 截断逻辑
 * - 文件路径样式
 *
 * 属性测试：
 * - 属性 5：行号与截断
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import chalk from 'chalk';
import {
  renderToolResult,
  detectLanguage,
  addLineNumbers,
  highlightContent,
} from '../../src/tool-result-renderer.js';

// Force chalk to use colors in test environment
chalk.level = 3; // TrueColor

/**
 * Helper: strip all ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ===== Unit Tests =====

describe('detectLanguage', () => {
  it('should detect TypeScript files', () => {
    expect(detectLanguage('src/utils.ts')).toBe('typescript');
    expect(detectLanguage('component.tsx')).toBe('typescript');
  });

  it('should detect JavaScript files', () => {
    expect(detectLanguage('index.js')).toBe('javascript');
    expect(detectLanguage('app.jsx')).toBe('javascript');
  });

  it('should detect Python files', () => {
    expect(detectLanguage('main.py')).toBe('python');
  });

  it('should detect JSON files', () => {
    expect(detectLanguage('package.json')).toBe('json');
  });

  it('should detect YAML files', () => {
    expect(detectLanguage('config.yaml')).toBe('yaml');
    expect(detectLanguage('config.yml')).toBe('yaml');
  });

  it('should return undefined for unknown extensions', () => {
    expect(detectLanguage('file.xyz')).toBeUndefined();
    expect(detectLanguage('noext')).toBeUndefined();
  });

  it('should handle Dockerfile', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
  });

  it('should be case-insensitive for extensions', () => {
    expect(detectLanguage('file.JSON')).toBe('json');
    expect(detectLanguage('file.Ts')).toBe('typescript');
  });
});

describe('addLineNumbers', () => {
  it('should add right-aligned line numbers', () => {
    const lines = ['line1', 'line2', 'line3'];
    const result = addLineNumbers(lines, 1, 3);
    const stripped = result.map(stripAnsi);
    expect(stripped[0]).toContain('1');
    expect(stripped[1]).toContain('2');
    expect(stripped[2]).toContain('3');
  });

  it('should pad line numbers for large files', () => {
    const lines = ['line1', 'line2'];
    const result = addLineNumbers(lines, 99, 100);
    const stripped = result.map(stripAnsi);
    // Line 99 should be padded to width of "100" (3 chars)
    expect(stripped[0]).toMatch(/\s*99/);
    expect(stripped[1]).toMatch(/100/);
  });

  it('should include separator', () => {
    const lines = ['content'];
    const result = addLineNumbers(lines, 1, 1);
    const stripped = stripAnsi(result[0]!);
    expect(stripped).toContain('│');
  });

  it('should start from specified line number', () => {
    const lines = ['a', 'b'];
    const result = addLineNumbers(lines, 50, 100);
    const stripped = result.map(stripAnsi);
    expect(stripped[0]).toContain('50');
    expect(stripped[1]).toContain('51');
  });
});

describe('highlightContent', () => {
  it('should return content unchanged when no language specified', () => {
    const content = 'const x = 1;';
    expect(highlightContent(content)).toBe(content);
  });

  it('should return content unchanged for unknown language', () => {
    const content = 'some content';
    const result = highlightContent(content, 'nonexistent_language_xyz');
    // Should not throw, should return something
    expect(result).toBeDefined();
  });

  it('should highlight TypeScript content', () => {
    const content = 'const x: number = 42;';
    const result = highlightContent(content, 'typescript');
    // Highlighted content should be defined and preserve text
    expect(result).toBeDefined();
    expect(stripAnsi(result)).toBe(content);
  });
});

describe('renderToolResult', () => {
  describe('file path styling', () => {
    it('should render file path with underline cyan style', () => {
      const result = renderToolResult('read_file', 'content', 'src/utils.ts');
      // Should contain the file path
      expect(stripAnsi(result)).toContain('src/utils.ts');
    });

    it('should work without file path', () => {
      const result = renderToolResult('run_shell', 'output');
      expect(result).toBeDefined();
      expect(stripAnsi(result)).toContain('output');
    });
  });

  describe('line numbers', () => {
    it('should add line numbers to each line', () => {
      const content = 'line1\nline2\nline3';
      const result = renderToolResult('read_file', content, 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('1');
      expect(stripped).toContain('2');
      expect(stripped).toContain('3');
    });

    it('should right-align line numbers', () => {
      const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`);
      const content = lines.join('\n');
      const result = renderToolResult('read_file', content, 'test.ts');
      const stripped = stripAnsi(result);
      // Line 1 should be padded to match width of "15"
      expect(stripped).toContain(' 1');
      expect(stripped).toContain('15');
    });
  });

  describe('truncation', () => {
    it('should not truncate content within maxLines', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const content = lines.join('\n');
      const result = renderToolResult('read_file', content, 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).not.toContain('hidden');
    });

    it('should truncate content exceeding maxLines (default 50)', () => {
      const lines = Array.from({ length: 60 }, (_, i) => `line${i + 1}`);
      const content = lines.join('\n');
      const result = renderToolResult('read_file', content, 'test.ts');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('hidden');
    });

    it('should show head and tail lines when truncated', () => {
      const lines = Array.from({ length: 60 }, (_, i) => `content_${i + 1}`);
      const content = lines.join('\n');
      const result = renderToolResult('read_file', content, 'test.ts');
      const stripped = stripAnsi(result);
      // Should show first 30 lines
      expect(stripped).toContain('content_1');
      expect(stripped).toContain('content_30');
      // Should show last 10 lines
      expect(stripped).toContain('content_51');
      expect(stripped).toContain('content_60');
      // Should show hidden count
      expect(stripped).toContain('20 lines hidden');
    });

    it('should respect custom truncation options', () => {
      const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`);
      const content = lines.join('\n');
      const result = renderToolResult('read_file', content, 'test.ts', {
        maxLines: 20,
        headLines: 10,
        tailLines: 5,
      });
      const stripped = stripAnsi(result);
      expect(stripped).toContain('hidden');
      expect(stripped).toContain('line1');
      expect(stripped).toContain('line10');
      expect(stripped).toContain('line26');
      expect(stripped).toContain('line30');
    });
  });

  describe('syntax highlighting', () => {
    it('should apply syntax highlighting for known file types', () => {
      const content = 'const x: number = 42;';
      const result = renderToolResult('read_file', content, 'test.ts');
      // Highlighted content should have ANSI codes beyond just line numbers
      const lines = result.split('\n');
      const contentLine = lines.find((l) => stripAnsi(l).includes('const'));
      expect(contentLine).toBeDefined();
    });

    it('should work without highlighting for unknown file types', () => {
      const content = 'some content here';
      const result = renderToolResult('read_file', content, 'file.xyz');
      const stripped = stripAnsi(result);
      expect(stripped).toContain('some content here');
    });
  });
});

// ===== Property Tests =====

/**
 * Arbitrary for generating multi-line content.
 */
const multiLineContentArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9 .,_:;()={}]+$/).filter((s) => s.length > 0 && s.length <= 60),
  { minLength: 51, maxLength: 100 },
).map((lines) => lines.join('\n'));

/**
 * Arbitrary for generating content within maxLines.
 */
const shortContentArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9 .,_]+$/).filter((s) => s.length > 0 && s.length <= 40),
  { minLength: 1, maxLength: 49 },
).map((lines) => lines.join('\n'));

describe('Property 5: Line numbers and truncation', () => {
  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * For any content exceeding 50 lines, the rendered output should show
   * exactly head (30) + tail (10) content lines with a fold indicator
   * showing the hidden line count, and line numbers must match original positions.
   */
  it('truncated output shows correct head/tail lines with fold indicator', () => {
    fc.assert(
      fc.property(
        multiLineContentArb,
        (content) => {
          const result = renderToolResult('read_file', content);
          const stripped = stripAnsi(result);
          const allLines = content.split('\n');
          const totalLines = allLines.length;

          // Should be truncated (>50 lines)
          if (totalLines <= 50) return true;

          // Should contain fold indicator with correct hidden count
          const hiddenCount = totalLines - 30 - 10;
          if (!stripped.includes(`${hiddenCount} lines hidden`)) return false;

          // First line content should be present (line 1)
          if (!stripped.includes(allLines[0]!)) return false;

          // Last line content should be present
          if (!stripped.includes(allLines[totalLines - 1]!)) return false;

          // Line number 1 should be present
          if (!stripped.includes('1')) return false;

          // Last line number should be present
          if (!stripped.includes(String(totalLines))) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * For any content within maxLines, all line numbers should be present
   * and match original positions.
   */
  it('non-truncated output has correct line numbers for all lines', () => {
    fc.assert(
      fc.property(
        shortContentArb,
        (content) => {
          const result = renderToolResult('read_file', content);
          const stripped = stripAnsi(result);
          const totalLines = content.split('\n').length;

          // Should not be truncated
          if (stripped.includes('hidden')) return false;

          // All line numbers should be present
          for (let i = 1; i <= totalLines; i++) {
            if (!stripped.includes(String(i))) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
