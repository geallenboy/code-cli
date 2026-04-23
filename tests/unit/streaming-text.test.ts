/**
 * StreamingText 组件单元测试
 *
 * 测试增量 Markdown 渲染、稳定前缀优化和代码块渲染。
 * 需求 5：流式 Markdown 增量渲染组件
 */

import { describe, it, expect } from 'vitest';
import { parseBlocks, computeStableBoundary, printBlocks } from '../../src/ink-app/StreamingText.js';

// ─── parseBlocks ───

describe('parseBlocks', () => {
  it('should return empty array for empty content', () => {
    expect(parseBlocks('')).toEqual([]);
  });

  it('should parse plain text as a single text block', () => {
    const blocks = parseBlocks('Hello world');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('text');
    expect((blocks[0] as { type: 'text'; lines: string[] }).lines).toEqual(['Hello world']);
  });

  it('should parse multiple text lines as a single text block', () => {
    const blocks = parseBlocks('line1\nline2\nline3');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('text');
    expect((blocks[0] as { type: 'text'; lines: string[] }).lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('should parse a closed code block', () => {
    const blocks = parseBlocks('```js\nconst x = 1;\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('code');
    const code = blocks[0] as { type: 'code'; lang: string; lines: string[]; closed: boolean };
    expect(code.lang).toBe('js');
    expect(code.lines).toEqual(['const x = 1;']);
    expect(code.closed).toBe(true);
  });

  it('should parse an unclosed code block', () => {
    const blocks = parseBlocks('```python\ndef foo():\n  pass');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('code');
    const code = blocks[0] as { type: 'code'; lang: string; lines: string[]; closed: boolean };
    expect(code.lang).toBe('python');
    expect(code.lines).toEqual(['def foo():', '  pass']);
    expect(code.closed).toBe(false);
  });

  it('should parse text before and after a code block', () => {
    const blocks = parseBlocks('Before\n```js\ncode\n```\nAfter');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.type).toBe('text');
    expect(blocks[1]!.type).toBe('code');
    expect(blocks[2]!.type).toBe('text');
    expect((blocks[1] as { type: 'code'; closed: boolean }).closed).toBe(true);
  });

  it('should parse multiple code blocks', () => {
    const content = '```js\na\n```\ntext\n```py\nb\n```';
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.type).toBe('code');
    expect(blocks[1]!.type).toBe('text');
    expect(blocks[2]!.type).toBe('code');
  });

  it('should handle code block with no language', () => {
    const blocks = parseBlocks('```\nsome code\n```');
    expect(blocks).toHaveLength(1);
    const code = blocks[0] as { type: 'code'; lang: string; closed: boolean };
    expect(code.lang).toBe('');
    expect(code.closed).toBe(true);
  });

  it('should handle headers', () => {
    const blocks = parseBlocks('# Title\n## Section\ntext');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('text');
    expect((blocks[0] as { type: 'text'; lines: string[] }).lines).toEqual(['# Title', '## Section', 'text']);
  });

  it('should handle text followed by unclosed code block', () => {
    const blocks = parseBlocks('Some text\n```js\nconst x');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe('text');
    expect(blocks[1]!.type).toBe('code');
    expect((blocks[1] as { type: 'code'; closed: boolean }).closed).toBe(false);
  });
});

// ─── computeStableBoundary ───

describe('computeStableBoundary', () => {
  it('should return 0 for empty blocks', () => {
    expect(computeStableBoundary([])).toBe(0);
  });

  it('should return 0 for a single text block', () => {
    const blocks = parseBlocks('Hello');
    expect(computeStableBoundary(blocks)).toBe(0);
  });

  it('should return 0 for a single unclosed code block', () => {
    const blocks = parseBlocks('```js\ncode');
    expect(computeStableBoundary(blocks)).toBe(0);
  });

  it('should return 0 for a single closed code block', () => {
    // Single block — nothing before it to be stable
    const blocks = parseBlocks('```js\ncode\n```');
    expect(computeStableBoundary(blocks)).toBe(0);
  });

  it('should mark text before unclosed code block as stable', () => {
    const blocks = parseBlocks('Some text\n```js\ncode');
    // blocks: [text, unclosed-code]
    // boundary = 1 (text block is stable, unclosed code is unstable)
    expect(computeStableBoundary(blocks)).toBe(1);
  });

  it('should mark all but last text block as stable', () => {
    const blocks = parseBlocks('```js\ncode\n```\nMore text');
    // blocks: [closed-code, text]
    // boundary = 1 (closed code is stable, trailing text is unstable)
    expect(computeStableBoundary(blocks)).toBe(1);
  });

  it('should handle multiple blocks with unclosed code at end', () => {
    const blocks = parseBlocks('Text\n```js\ncode\n```\nMore\n```py\nstill going');
    // blocks: [text, closed-code, text, unclosed-code]
    // boundary = 3 (first 3 blocks stable, unclosed code unstable)
    expect(computeStableBoundary(blocks)).toBe(3);
  });

  it('stable boundary monotonically increases as content grows', () => {
    // Simulate streaming: content grows over time
    const steps = [
      'Hello',                                    // 1 text block, boundary=0
      'Hello\n```js',                             // text + unclosed code, boundary=1
      'Hello\n```js\nconst x = 1;',              // text + unclosed code, boundary=1
      'Hello\n```js\nconst x = 1;\n```',          // text + closed code, boundary=1
      'Hello\n```js\nconst x = 1;\n```\nDone',    // text + closed code + text, boundary=2
    ];

    let prevBoundary = 0;
    for (const content of steps) {
      const blocks = parseBlocks(content);
      const boundary = computeStableBoundary(blocks);
      expect(boundary).toBeGreaterThanOrEqual(prevBoundary);
      prevBoundary = boundary;
    }
  });
});

// ─── printBlocks (round-trip) ───

describe('printBlocks', () => {
  it('should round-trip plain text', () => {
    const text = 'Hello world';
    const blocks = parseBlocks(text);
    expect(printBlocks(blocks)).toBe(text);
  });

  it('should round-trip text with headers', () => {
    const text = '# Title\n## Section\ntext';
    const blocks = parseBlocks(text);
    expect(printBlocks(blocks)).toBe(text);
  });

  it('should round-trip closed code block', () => {
    const text = '```js\nconst x = 1;\n```';
    const blocks = parseBlocks(text);
    expect(printBlocks(blocks)).toBe(text);
  });

  it('should round-trip text + code + text', () => {
    const text = 'Before\n```js\ncode\n```\nAfter';
    const blocks = parseBlocks(text);
    expect(printBlocks(blocks)).toBe(text);
  });

  it('should round-trip unclosed code block', () => {
    const text = '```python\ndef foo():';
    const blocks = parseBlocks(text);
    expect(printBlocks(blocks)).toBe(text);
  });

  it('should produce equivalent parse results after round-trip (requirement 5.6)', () => {
    const text = '# Title\nSome **bold** text\n```js\nconst x = 1;\n```\n- item 1\n- item 2';
    const blocks1 = parseBlocks(text);
    const printed = printBlocks(blocks1);
    const blocks2 = parseBlocks(printed);

    // Block structure should be identical
    expect(blocks2.length).toBe(blocks1.length);
    for (let i = 0; i < blocks1.length; i++) {
      expect(blocks2[i]!.type).toBe(blocks1[i]!.type);
      if (blocks1[i]!.type === 'text') {
        expect((blocks2[i] as { lines: string[] }).lines).toEqual(
          (blocks1[i] as { lines: string[] }).lines,
        );
      } else {
        const c1 = blocks1[i] as { lang: string; lines: string[]; closed: boolean };
        const c2 = blocks2[i] as { lang: string; lines: string[]; closed: boolean };
        expect(c2.lang).toBe(c1.lang);
        expect(c2.lines).toEqual(c1.lines);
        expect(c2.closed).toBe(c1.closed);
      }
    }
  });
});
