/**
 * Box Drawing 模块测试
 *
 * 属性测试（fast-check, 100 runs each）+ 单元测试
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  stripAnsi,
  visibleWidth,
  renderBox,
  renderCodeBlock,
  renderStatusLine,
  renderSeparator,
  formatTokenCount,
  formatCost,
} from '../../src/box.js';

// ===== Helper: manual width calculation =====

function isCJK(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf)
  );
}

function manualVisibleWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const cp = char.codePointAt(0);
    if (cp !== undefined && isCJK(cp)) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// ===== Generators =====

/** Generate strings with mixed ASCII, ANSI codes, and CJK characters */
const mixedStringArb = fc.array(
  fc.oneof(
    // ASCII text
    fc.stringMatching(/^[a-zA-Z0-9 .,!?]+$/).filter((s) => s.length > 0 && s.length <= 20),
    // ANSI escape codes wrapping text
    fc.stringMatching(/^[a-zA-Z0-9]+$/)
      .filter((s) => s.length > 0 && s.length <= 10)
      .map((s) => `\x1b[31m${s}\x1b[0m`),
    // CJK characters
    fc.constantFrom('你好', '世界', '测试', '代码', '函数', '中文'),
  ),
  { minLength: 0, maxLength: 5 },
).map((parts) => parts.join(''));

/** Generate safe header strings (no newlines, reasonable length) */
const headerArb = fc.stringMatching(/^[a-zA-Z0-9 _\-.:]+$/).filter(
  (s) => s.length > 0 && s.length <= 30,
);

/** Generate safe line arrays */
const linesArb = fc.array(
  fc.stringMatching(/^[a-zA-Z0-9 _\-.:=()]+$/).filter((s) => s.length <= 60),
  { minLength: 0, maxLength: 10 },
);

/** Generate code strings without box drawing characters */
const codeArb = fc.array(
  // eslint-disable-next-line no-useless-escape
  fc.stringMatching(/^[a-zA-Z0-9 _\-.:=();{}\[\]<>\/\\'"!@#$%^&*+,?|~`]+$/).filter(
    (s) => s.length > 0 && s.length <= 50,
  ),
  { minLength: 1, maxLength: 5 },
).map((lines) => lines.join('\n'));

// ===== Property Tests =====

describe('Property 1: Box alignment invariant', () => {
  /**
   * **Validates: Requirements 1.6, 2.6**
   *
   * For any valid header and lines, every line of stripAnsi(renderBox(header, lines))
   * should have the same visible width.
   */
  it('all lines of renderBox output have equal visible width', () => {
    fc.assert(
      fc.property(headerArb, linesArb, (header, lines) => {
        const box = renderBox(header, lines, { width: 60 });
        const stripped = stripAnsi(box);
        const outputLines = stripped.split('\n');
        const widths = outputLines.map((l) => manualVisibleWidth(l));
        const firstWidth = widths[0];
        return widths.every((w) => w === firstWidth);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 2: visibleWidth handles ANSI and CJK', () => {
  /**
   * **Validates: Requirements 1.4, 1.5**
   *
   * For any string with ANSI codes and/or CJK characters,
   * visibleWidth(s) equals the manual width of stripAnsi(s).
   */
  it('visibleWidth equals manual calculation after stripping ANSI', () => {
    fc.assert(
      fc.property(mixedStringArb, (s) => {
        const actual = visibleWidth(s);
        const expected = manualVisibleWidth(stripAnsi(s));
        return actual === expected;
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 3: Code block border completeness', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any language and code content, stripAnsi(renderCodeBlock(lang, code))
   * starts with ╭ and ends with ╯.
   */
  it('renderCodeBlock output starts with ╭ and ends with ╯', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('typescript', 'javascript', 'python', 'code', ''),
        codeArb,
        (lang, code) => {
          const result = renderCodeBlock(lang, code, { width: 60 });
          const stripped = stripAnsi(result).trim();
          return stripped.startsWith('╭') && stripped.endsWith('╯');
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 4: Code block round-trip', () => {
  /**
   * **Validates: Requirements 3.6**
   *
   * For any code string without box drawing characters,
   * extracting text between │ borders from renderCodeBlock output
   * should recover the original code (with tabs expanded to 2 spaces).
   */
  it('extracting border content recovers original code', () => {
    fc.assert(
      fc.property(codeArb, (code) => {
        const result = renderCodeBlock('code', code, { width: 80 });
        const stripped = stripAnsi(result);
        const outputLines = stripped.split('\n');

        // Extract content lines (between top and bottom borders)
        const contentLines = outputLines.slice(1, -1); // skip ╭ and ╯ lines

        // Extract text between │ markers, trimming padding
        const extracted = contentLines.map((line) => {
          // Line format: │ <padding> content <padding> │
          const inner = line.slice(1, -1); // remove │ on both sides
          // Remove exactly 1 char of padding on each side (default padding=1)
          return inner.slice(1, -1);
        });

        // The extracted lines should match original code lines (tab-expanded, right-trimmed)
        const expectedLines = code.replace(/\t/g, '  ').split('\n');
        if (extracted.length !== expectedLines.length) return false;

        for (let i = 0; i < expectedLines.length; i++) {
          // Right-trim both since padToWidth adds trailing spaces
          if (extracted[i].trimEnd() !== expectedLines[i].trimEnd()) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 5: Status line and separator width fill', () => {
  /**
   * **Validates: Requirements 7.2, 10.2**
   *
   * For any parts array and width, renderStatusLine and renderSeparator
   * output visible width equals the specified width.
   */
  it('renderStatusLine output has correct visible width', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.stringMatching(/^[a-zA-Z0-9.$]+$/).filter((s) => s.length > 0 && s.length <= 10),
          { minLength: 1, maxLength: 5 },
        ),
        fc.integer({ min: 20, max: 200 }),
        (parts, width) => {
          const result = renderStatusLine(parts, width);
          const actual = visibleWidth(result);
          return actual === width;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('renderSeparator output has correct visible width', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (width) => {
        const result = renderSeparator(width);
        const actual = visibleWidth(result);
        return actual === width;
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 6: Cost formatting precision', () => {
  /**
   * **Validates: Requirements 11.1, 11.2, 11.4**
   *
   * For any non-negative cost, formatCost output starts with $
   * and has correct decimal places.
   */
  it('formatCost starts with $ and has correct decimal places', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (cost) => {
          const result = formatCost(cost);
          if (!result.startsWith('$')) return false;
          const numPart = result.slice(1);
          const dotIndex = numPart.indexOf('.');
          if (dotIndex === -1) return false;
          const decimals = numPart.length - dotIndex - 1;
          if (cost > 0.50) {
            return decimals === 2;
          } else {
            return decimals === 4;
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 7: Token count formatting', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any non-negative integer, formatTokenCount returns correct K/M format.
   */
  it('formatTokenCount returns correct format based on magnitude', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (n) => {
        const result = formatTokenCount(n);
        if (n < 1000) {
          return result === String(n);
        } else if (n < 1_000_000) {
          return result.endsWith('K') && result === (n / 1000).toFixed(1) + 'K';
        } else {
          return result.endsWith('M') && result === (n / 1_000_000).toFixed(1) + 'M';
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ===== Unit Tests =====

describe('renderBox unit tests', () => {
  it('should render with default width 80 when no width specified', () => {
    // Mock process.stdout.columns to be undefined
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    try {
      const box = renderBox('Test', ['line 1']);
      const stripped = stripAnsi(box);
      const lines = stripped.split('\n');
      expect(manualVisibleWidth(lines[0])).toBe(80);
    } finally {
      Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true });
    }
  });

  it('should render empty lines array with empty body', () => {
    const box = renderBox('Header', [], { width: 40 });
    const stripped = stripAnsi(box);
    const lines = stripped.split('\n');
    expect(lines.length).toBe(3); // top + empty body + bottom
    expect(lines[0]).toContain('╭');
    expect(lines[0]).toContain('Header');
    expect(lines[2]).toContain('╰');
    expect(lines[2]).toContain('╯');
  });

  it('should truncate header when it exceeds box width', () => {
    const longHeader = 'A'.repeat(100);
    const box = renderBox(longHeader, ['content'], { width: 40 });
    const stripped = stripAnsi(box);
    const lines = stripped.split('\n');
    expect(manualVisibleWidth(lines[0])).toBe(40);
    expect(lines[0]).toContain('...');
  });
});

describe('renderCodeBlock unit tests', () => {
  it('should use "code" as default label when language is empty', () => {
    const result = renderCodeBlock('', 'const x = 1;', { width: 40 });
    const stripped = stripAnsi(result);
    expect(stripped).toContain('code');
  });

  it('should expand tabs to 2 spaces', () => {
    const result = renderCodeBlock('code', 'if (true) {\n\treturn 1;\n}', { width: 60 });
    const stripped = stripAnsi(result);
    expect(stripped).not.toContain('\t');
    expect(stripped).toContain('  return 1;');
  });
});
