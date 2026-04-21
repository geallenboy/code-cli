/**
 * Markdown 终端渲染器单元测试
 *
 * 测试 renderMarkdown 和 renderDiff 的核心逻辑。
 * 属性测试 P28: Markdown 渲染幂等性
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { renderMarkdown, renderDiff } from '../../src/markdown.js';

describe('renderMarkdown', () => {
  it('should render h1 headers with bold+underline+cyan', () => {
    const result = renderMarkdown('# Hello');
    expect(result).toContain('\x1b[1m');  // bold
    expect(result).toContain('\x1b[4m');  // underline
    expect(result).toContain('\x1b[36m'); // cyan
    expect(result).toContain('Hello');
  });

  it('should render h2 headers with bold+underline', () => {
    const result = renderMarkdown('## Section');
    expect(result).toContain('\x1b[1m');  // bold
    expect(result).toContain('\x1b[4m');  // underline
    expect(result).toContain('Section');
  });

  it('should render h3 headers with bold', () => {
    const result = renderMarkdown('### Subsection');
    expect(result).toContain('\x1b[1m');  // bold
    expect(result).toContain('Subsection');
  });

  it('should render bold text', () => {
    const result = renderMarkdown('This is **bold** text');
    expect(result).toContain('\x1b[1m');
    expect(result).toContain('bold');
  });

  it('should render inline code in yellow', () => {
    const result = renderMarkdown('Use `npm install` to install');
    expect(result).toContain('\x1b[33m'); // yellow
    expect(result).toContain('npm install');
  });

  it('should render code blocks in dim', () => {
    const input = '```\nconst x = 1;\n```';
    const result = renderMarkdown(input);
    expect(result).toContain('\x1b[2m'); // dim
    expect(result).toContain('const x = 1;');
  });

  it('should handle plain text without modification', () => {
    const result = renderMarkdown('Just plain text');
    expect(result).toBe('Just plain text');
  });

  it('should handle empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('should handle multiple headers', () => {
    const input = '# Title\n## Section\n### Sub';
    const result = renderMarkdown(input);
    expect(result).toContain('Title');
    expect(result).toContain('Section');
    expect(result).toContain('Sub');
  });

  it('should handle mixed content', () => {
    const input = '# Title\n\nSome **bold** and `code` text.\n\n## Next';
    const result = renderMarkdown(input);
    expect(result).toContain('Title');
    expect(result).toContain('bold');
    expect(result).toContain('code');
    expect(result).toContain('Next');
  });
});

describe('renderDiff', () => {
  it('should show diff header with file path', () => {
    const result = renderDiff('old', 'new', 'test.ts');
    expect(result).toContain('--- a/test.ts');
    expect(result).toContain('+++ b/test.ts');
  });

  it('should show removed lines in red', () => {
    const result = renderDiff('old line', 'new line', 'test.ts');
    expect(result).toContain('\x1b[31m'); // red
    expect(result).toContain('- old line');
  });

  it('should show added lines in green', () => {
    const result = renderDiff('old line', 'new line', 'test.ts');
    expect(result).toContain('\x1b[32m'); // green
    expect(result).toContain('+ new line');
  });

  it('should show no changes for identical content', () => {
    const result = renderDiff('same', 'same', 'test.ts');
    expect(result).toContain('(no changes)');
  });

  it('should handle multi-line diffs', () => {
    const old = 'line1\nline2\nline3';
    const newContent = 'line1\nmodified\nline3';
    const result = renderDiff(old, newContent, 'test.ts');
    expect(result).toContain('- line2');
    expect(result).toContain('+ modified');
    // Unchanged lines should not appear as additions or removals
    expect(result).not.toContain('- line1');
    expect(result).not.toContain('+ line1');
  });

  it('should handle empty old content (new file)', () => {
    const result = renderDiff('', 'new content', 'test.ts');
    expect(result).toContain('+ new content');
  });

  it('should handle empty new content (deleted file)', () => {
    const result = renderDiff('old content', '', 'test.ts');
    expect(result).toContain('- old content');
  });
});

describe('P28: Markdown rendering idempotency (property test)', () => {
  /**
   * **Validates: Requirements 25.1**
   *
   * Property P28: Rendering already-rendered text should not produce
   * additional ANSI escape sequences beyond what's already there.
   *
   * Specifically: for plain text (no markdown syntax), rendering should
   * be a no-op. And for markdown text, double-rendering should not
   * add more escape codes than single rendering.
   */
  it('should be idempotent for plain text (no markdown syntax)', () => {
    fc.assert(
      fc.property(
        // Generate strings that contain no markdown syntax characters
        fc.stringMatching(/^[a-zA-Z0-9 .,!?\-_:;()]+$/).filter((s) => s.length <= 100),
        (plainText) => {
          const once = renderMarkdown(plainText);
          // Plain text without markdown syntax should pass through unchanged
          return once === plainText;
        },
      ),
      { numRuns: 50 },
    );
  });
});
