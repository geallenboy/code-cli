/**
 * Markdown 终端渲染器单元测试
 *
 * 测试 renderMarkdown 和 renderDiff 的核心逻辑。
 * 属性测试 P28: Markdown 渲染幂等性
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { renderMarkdown, renderDiff, StreamingMarkdownRenderer } from '../../src/markdown.js';

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

  it('should render code blocks with box border', () => {
    const input = '```\nconst x = 1;\n```';
    const result = renderMarkdown(input);
    expect(result).toContain('const x = 1;');
    expect(result).toContain('╭');
    expect(result).toContain('╯');
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
    expect(result).toContain('📝 test.ts');
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
        // Exclude strings starting with - or * (list markers) or # (headers)
        fc.stringMatching(/^[a-zA-Z0-9 .,!?_:;()]+$/).filter(
          (s) => s.length > 0 && s.length <= 100 && !/^[-*#]/.test(s),
        ),
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

// ===== Streaming Markdown Renderer Unit Tests =====

describe('StreamingMarkdownRenderer', () => {
  it('should render complete lines immediately', () => {
    const renderer = new StreamingMarkdownRenderer();
    const result = renderer.push('Hello world\n');
    expect(result).toContain('Hello world');
  });

  it('should buffer incomplete lines', () => {
    const renderer = new StreamingMarkdownRenderer();
    const result = renderer.push('Hello');
    // Incomplete line is buffered, nothing rendered yet
    expect(result).toBe('');
  });

  it('should render buffered content on flush', () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.push('Hello');
    const result = renderer.flush();
    expect(result).toContain('Hello');
  });

  it('should handle multi-chunk streaming', () => {
    const renderer = new StreamingMarkdownRenderer();
    const r1 = renderer.push('Hello ');
    const r2 = renderer.push('world\n');
    const r3 = renderer.flush();
    const combined = r1 + r2 + r3;
    expect(combined).toContain('Hello world');
  });

  it('should render headers in streaming mode', () => {
    const renderer = new StreamingMarkdownRenderer();
    const r1 = renderer.push('# Title\n');
    expect(r1).toContain('\x1b[1m');  // bold
    expect(r1).toContain('Title');
  });

  it('should render bold text in streaming mode', () => {
    const renderer = new StreamingMarkdownRenderer();
    const r1 = renderer.push('This is **bold** text\n');
    expect(r1).toContain('\x1b[1m');
    expect(r1).toContain('bold');
  });

  it('should render inline code in streaming mode', () => {
    const renderer = new StreamingMarkdownRenderer();
    const r1 = renderer.push('Use `npm install`\n');
    expect(r1).toContain('\x1b[33m'); // yellow
    expect(r1).toContain('npm install');
  });

  it('should render list items in streaming mode', () => {
    const renderer = new StreamingMarkdownRenderer();
    const r1 = renderer.push('- item one\n');
    expect(r1).toContain('•');
    expect(r1).toContain('item one');
  });

  it('should buffer code blocks until closing fence', () => {
    const renderer = new StreamingMarkdownRenderer();
    const r1 = renderer.push('```js\n');
    const r2 = renderer.push('const x = 1;\n');
    // Code block content is buffered
    expect(r1).toBe('');
    expect(r2).toBe('');
    // Closing fence triggers rendering with box border
    const r3 = renderer.push('```\n');
    expect(r3).toContain('const x = 1;');
    expect(r3).toContain('╭');
    expect(r3).toContain('╯');
  });

  it('should handle code blocks with language identifier', () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.push('```typescript\n');
    renderer.push('const x: number = 1;\n');
    const result = renderer.push('```\n');
    expect(result).toContain('const x');
  });

  it('should reset state correctly', () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.push('Some text');
    renderer.reset();
    const result = renderer.flush();
    expect(result).toBe('');
  });

  it('should handle empty chunks', () => {
    const renderer = new StreamingMarkdownRenderer();
    const result = renderer.push('');
    expect(result).toBe('');
  });

  it('should handle multiple complete lines in one chunk', () => {
    const renderer = new StreamingMarkdownRenderer();
    const result = renderer.push('line1\nline2\nline3\n');
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain('line3');
  });

  it('should handle flush on empty buffer', () => {
    const renderer = new StreamingMarkdownRenderer();
    const result = renderer.flush();
    expect(result).toBe('');
  });

  it('should handle code block with unknown language using box border', () => {
    const renderer = new StreamingMarkdownRenderer();
    renderer.push('```unknownlang\n');
    renderer.push('some code\n');
    const result = renderer.push('```\n');
    expect(result).toContain('some code');
    expect(result).toContain('╭');
    expect(result).toContain('╯');
  });
});

// ===== Property Tests for Streaming Markdown Renderer =====

/**
 * Helper: strip all ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Helper: extract visible text content from markdown source,
 * removing markdown syntax markers.
 */
function extractVisibleText(markdown: string): string {
  let text = markdown;
  // Remove code block fences
  text = text.replace(/```\w*\n?/g, '');
  // Remove header markers
  text = text.replace(/^#{1,3}\s+/gm, '');
  // Remove bold markers
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  // Remove inline code markers
  text = text.replace(/`([^`]+)`/g, '$1');
  // Remove list markers (- or *)
  text = text.replace(/^(\s*)([-*])\s+/gm, '$1');
  return text;
}

/**
 * Arbitrary for generating markdown text with various elements.
 */
const markdownTextArb = fc.oneof(
  // Plain text lines
  fc.array(
    fc.stringMatching(/^[a-zA-Z0-9 .,!?]+$/).filter((s) => s.length > 0 && s.length <= 50),
    { minLength: 1, maxLength: 5 },
  ).map((lines) => lines.join('\n')),
  // Headers
  fc.tuple(
    fc.constantFrom('# ', '## ', '### '),
    fc.stringMatching(/^[a-zA-Z0-9 ]+$/).filter((s) => s.length > 0 && s.length <= 30),
  ).map(([prefix, text]) => prefix + text),
  // Bold text
  fc.stringMatching(/^[a-zA-Z0-9 ]+$/)
    .filter((s) => s.length > 0 && s.length <= 20)
    .map((s) => `This is **${s}** text`),
  // Inline code
  fc.stringMatching(/^[a-zA-Z0-9_.]+$/)
    .filter((s) => s.length > 0 && s.length <= 20)
    .map((s) => `Use \`${s}\` here`),
  // List items
  fc.array(
    fc.stringMatching(/^[a-zA-Z0-9 ]+$/).filter((s) => s.length > 0 && s.length <= 30),
    { minLength: 1, maxLength: 3 },
  ).map((items) => items.map((item) => `- ${item}`).join('\n')),
  // Code blocks
  fc.tuple(
    fc.constantFrom('js', 'ts', 'python', ''),
    fc.array(
      fc.stringMatching(/^[a-zA-Z0-9 =;(){}]+$/).filter((s) => s.length > 0 && s.length <= 40),
      { minLength: 1, maxLength: 3 },
    ),
  ).map(([lang, lines]) => `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\``),
);

describe('Property 1: Markdown rendering preserves text content', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
   *
   * For any Markdown text containing headers, bold, inline code, list items,
   * and fenced code blocks, the rendered output (after stripping ANSI codes)
   * should contain all visible text content from the original.
   */
  it('rendered output contains all visible text from source', () => {
    fc.assert(
      fc.property(markdownTextArb, (markdown) => {
        const rendered = renderMarkdown(markdown);
        const strippedRendered = stripAnsi(rendered);
        const visibleSource = extractVisibleText(markdown);

        // Each word from the visible source should appear in the rendered output
        const sourceWords = visibleSource
          .split(/\s+/)
          .filter((w) => w.length > 0);

        for (const word of sourceWords) {
          if (!strippedRendered.includes(word)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 2: Streaming equivalence', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * For any Markdown text, splitting it into arbitrary consecutive chunks
   * and feeding them through the streaming renderer (push + flush) should
   * produce the same visible text as batch rendering with renderMarkdown().
   */
  it('streaming push+flush produces same visible text as batch renderMarkdown', () => {
    fc.assert(
      fc.property(
        markdownTextArb,
        // Generate split points for chunking
        fc.array(fc.nat({ max: 200 }), { minLength: 0, maxLength: 10 }),
        (markdown, rawSplitPoints) => {
          // Batch render
          const batchResult = renderMarkdown(markdown);
          const batchText = stripAnsi(batchResult);

          // Streaming render: split text into chunks at random points
          const splitPoints = [...new Set(rawSplitPoints)]
            .map((p) => p % (markdown.length + 1))
            .sort((a, b) => a - b);

          const chunks: string[] = [];
          let prev = 0;
          for (const point of splitPoints) {
            if (point > prev && point <= markdown.length) {
              chunks.push(markdown.slice(prev, point));
              prev = point;
            }
          }
          if (prev < markdown.length) {
            chunks.push(markdown.slice(prev));
          }
          if (chunks.length === 0) {
            chunks.push(markdown);
          }

          const renderer = new StreamingMarkdownRenderer();
          let streamResult = '';
          for (const chunk of chunks) {
            streamResult += renderer.push(chunk);
          }
          streamResult += renderer.flush();
          const streamText = stripAnsi(streamResult);

          // The visible text content should be the same
          return batchText === streamText;
        },
      ),
      { numRuns: 100 },
    );
  });
});
