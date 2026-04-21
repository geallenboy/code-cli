/**
 * 多行输入处理器单元测试
 *
 * 测试按键处理逻辑、缓冲区管理、光标导航。
 * 不测试终端 I/O（raw mode、ANSI 渲染），只测试纯逻辑。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputBuffer, handleKeypress } from '../../src/input.js';

describe('InputBuffer', () => {
  let buf: InputBuffer;

  beforeEach(() => {
    buf = new InputBuffer();
  });

  describe('initial state', () => {
    it('should start with one empty line', () => {
      expect(buf.lines).toEqual(['']);
      expect(buf.cursor).toEqual({ line: 0, col: 0 });
    });

    it('should report isEmpty as true', () => {
      expect(buf.isEmpty()).toBe(true);
    });

    it('should report isMultiLine as false', () => {
      expect(buf.isMultiLine()).toBe(false);
    });

    it('should return empty string from getText', () => {
      expect(buf.getText()).toBe('');
    });
  });

  describe('insertChar', () => {
    it('should insert a character at cursor position', () => {
      buf.insertChar('a');
      expect(buf.lines).toEqual(['a']);
      expect(buf.cursor).toEqual({ line: 0, col: 1 });
    });

    it('should insert multiple characters sequentially', () => {
      buf.insertChar('h');
      buf.insertChar('i');
      expect(buf.lines).toEqual(['hi']);
      expect(buf.cursor).toEqual({ line: 0, col: 2 });
    });

    it('should insert in the middle of text', () => {
      buf.insertChar('a');
      buf.insertChar('c');
      buf.cursor.col = 1; // move between 'a' and 'c'
      buf.insertChar('b');
      expect(buf.lines).toEqual(['abc']);
      expect(buf.cursor.col).toBe(2);
    });
  });

  describe('insertNewline', () => {
    it('should split current line at cursor position', () => {
      buf.insertChar('a');
      buf.insertChar('b');
      buf.cursor.col = 1; // between 'a' and 'b'
      buf.insertNewline();
      expect(buf.lines).toEqual(['a', 'b']);
      expect(buf.cursor).toEqual({ line: 1, col: 0 });
    });

    it('should create empty line when at end of line', () => {
      buf.insertChar('x');
      buf.insertNewline();
      expect(buf.lines).toEqual(['x', '']);
      expect(buf.cursor).toEqual({ line: 1, col: 0 });
    });

    it('should create empty line when at start of line', () => {
      buf.insertChar('x');
      buf.cursor.col = 0;
      buf.insertNewline();
      expect(buf.lines).toEqual(['', 'x']);
      expect(buf.cursor).toEqual({ line: 1, col: 0 });
    });

    it('should report isMultiLine as true after newline', () => {
      buf.insertNewline();
      expect(buf.isMultiLine()).toBe(true);
    });
  });

  describe('backspace', () => {
    it('should delete character before cursor', () => {
      buf.insertChar('a');
      buf.insertChar('b');
      buf.backspace();
      expect(buf.lines).toEqual(['a']);
      expect(buf.cursor.col).toBe(1);
    });

    it('should do nothing at start of first line', () => {
      buf.backspace();
      expect(buf.lines).toEqual(['']);
      expect(buf.cursor).toEqual({ line: 0, col: 0 });
    });

    it('should merge lines when at start of non-first line', () => {
      buf.insertChar('a');
      buf.insertNewline();
      buf.insertChar('b');
      buf.cursor.col = 0; // start of second line
      buf.backspace();
      expect(buf.lines).toEqual(['ab']);
      expect(buf.cursor).toEqual({ line: 0, col: 1 });
    });
  });

  describe('deleteForward', () => {
    it('should delete character after cursor', () => {
      buf.insertChar('a');
      buf.insertChar('b');
      buf.cursor.col = 0;
      buf.deleteForward();
      expect(buf.lines).toEqual(['b']);
      expect(buf.cursor.col).toBe(0);
    });

    it('should do nothing at end of last line', () => {
      buf.insertChar('a');
      buf.deleteForward();
      expect(buf.lines).toEqual(['a']);
    });

    it('should merge next line when at end of current line', () => {
      buf.insertChar('a');
      buf.insertNewline();
      buf.insertChar('b');
      buf.cursor = { line: 0, col: 1 }; // end of first line
      buf.deleteForward();
      expect(buf.lines).toEqual(['ab']);
    });
  });

  describe('cursor navigation', () => {
    beforeEach(() => {
      // Set up "ab\ncd" buffer
      buf.insertChar('a');
      buf.insertChar('b');
      buf.insertNewline();
      buf.insertChar('c');
      buf.insertChar('d');
      // cursor at line 1, col 2
    });

    it('moveLeft should move cursor left within line', () => {
      buf.moveLeft();
      expect(buf.cursor).toEqual({ line: 1, col: 1 });
    });

    it('moveLeft should wrap to end of previous line', () => {
      buf.cursor.col = 0;
      buf.moveLeft();
      expect(buf.cursor).toEqual({ line: 0, col: 2 });
    });

    it('moveLeft should not move past start of buffer', () => {
      buf.cursor = { line: 0, col: 0 };
      buf.moveLeft();
      expect(buf.cursor).toEqual({ line: 0, col: 0 });
    });

    it('moveRight should move cursor right within line', () => {
      buf.cursor = { line: 0, col: 0 };
      buf.moveRight();
      expect(buf.cursor).toEqual({ line: 0, col: 1 });
    });

    it('moveRight should wrap to start of next line', () => {
      buf.cursor = { line: 0, col: 2 };
      buf.moveRight();
      expect(buf.cursor).toEqual({ line: 1, col: 0 });
    });

    it('moveRight should not move past end of buffer', () => {
      buf.moveRight();
      expect(buf.cursor).toEqual({ line: 1, col: 2 });
    });

    it('moveUp should move to previous line', () => {
      buf.moveUp();
      expect(buf.cursor).toEqual({ line: 0, col: 2 });
    });

    it('moveUp should clamp column to shorter line', () => {
      // Make first line shorter: "a\ncd"
      buf.lines[0] = 'a';
      buf.cursor = { line: 1, col: 2 };
      buf.moveUp();
      expect(buf.cursor).toEqual({ line: 0, col: 1 });
    });

    it('moveUp should not move past first line', () => {
      buf.cursor = { line: 0, col: 0 };
      buf.moveUp();
      expect(buf.cursor).toEqual({ line: 0, col: 0 });
    });

    it('moveDown should move to next line', () => {
      buf.cursor = { line: 0, col: 1 };
      buf.moveDown();
      expect(buf.cursor).toEqual({ line: 1, col: 1 });
    });

    it('moveDown should clamp column to shorter line', () => {
      buf.lines[1] = 'c';
      buf.cursor = { line: 0, col: 2 };
      buf.moveDown();
      expect(buf.cursor).toEqual({ line: 1, col: 1 });
    });

    it('moveDown should not move past last line', () => {
      buf.moveDown();
      expect(buf.cursor).toEqual({ line: 1, col: 2 });
    });

    it('moveToLineStart should move to column 0', () => {
      buf.moveToLineStart();
      expect(buf.cursor.col).toBe(0);
    });

    it('moveToLineEnd should move to end of current line', () => {
      buf.cursor.col = 0;
      buf.moveToLineEnd();
      expect(buf.cursor.col).toBe(2);
    });
  });

  describe('clear', () => {
    it('should reset to initial state', () => {
      buf.insertChar('a');
      buf.insertNewline();
      buf.insertChar('b');
      buf.clear();
      expect(buf.lines).toEqual(['']);
      expect(buf.cursor).toEqual({ line: 0, col: 0 });
      expect(buf.isEmpty()).toBe(true);
    });
  });

  describe('getText', () => {
    it('should join lines with newline', () => {
      buf.insertChar('a');
      buf.insertNewline();
      buf.insertChar('b');
      expect(buf.getText()).toBe('a\nb');
    });

    it('should handle single line', () => {
      buf.insertChar('x');
      expect(buf.getText()).toBe('x');
    });

    it('should handle multiple newlines', () => {
      buf.insertNewline();
      buf.insertNewline();
      expect(buf.getText()).toBe('\n\n');
    });
  });
});

describe('handleKeypress', () => {
  let buf: InputBuffer;

  beforeEach(() => {
    buf = new InputBuffer();
  });

  it('should insert plain character', () => {
    const result = handleKeypress(buf, 'a', undefined);
    expect(result).toBe('continue');
    expect(buf.lines).toEqual(['a']);
  });

  it('should return submit on Enter', () => {
    buf.insertChar('x');
    const result = handleKeypress(buf, '\r', { name: 'return' });
    expect(result).toBe('submit');
  });

  it('should insert newline on Alt+Enter', () => {
    buf.insertChar('a');
    const result = handleKeypress(buf, '\r', { name: 'return', meta: true });
    expect(result).toBe('continue');
    expect(buf.lines).toEqual(['a', '']);
  });

  it('should return clear on Ctrl+C', () => {
    buf.insertChar('x');
    const result = handleKeypress(buf, '\x03', { name: 'c', ctrl: true });
    expect(result).toBe('clear');
  });

  it('should handle backspace', () => {
    buf.insertChar('a');
    buf.insertChar('b');
    const result = handleKeypress(buf, undefined, { name: 'backspace' });
    expect(result).toBe('continue');
    expect(buf.lines).toEqual(['a']);
  });

  it('should handle delete', () => {
    buf.insertChar('a');
    buf.insertChar('b');
    buf.cursor.col = 0;
    const result = handleKeypress(buf, undefined, { name: 'delete' });
    expect(result).toBe('continue');
    expect(buf.lines).toEqual(['b']);
  });

  it('should handle left arrow', () => {
    buf.insertChar('a');
    const result = handleKeypress(buf, undefined, { name: 'left' });
    expect(result).toBe('continue');
    expect(buf.cursor.col).toBe(0);
  });

  it('should handle right arrow', () => {
    buf.insertChar('a');
    buf.cursor.col = 0;
    const result = handleKeypress(buf, undefined, { name: 'right' });
    expect(result).toBe('continue');
    expect(buf.cursor.col).toBe(1);
  });

  it('should handle up arrow', () => {
    buf.insertChar('a');
    buf.insertNewline();
    buf.insertChar('b');
    const result = handleKeypress(buf, undefined, { name: 'up' });
    expect(result).toBe('continue');
    expect(buf.cursor.line).toBe(0);
  });

  it('should handle down arrow', () => {
    buf.insertChar('a');
    buf.insertNewline();
    buf.insertChar('b');
    buf.cursor = { line: 0, col: 0 };
    const result = handleKeypress(buf, undefined, { name: 'down' });
    expect(result).toBe('continue');
    expect(buf.cursor.line).toBe(1);
  });

  it('should handle Home / Ctrl+A', () => {
    buf.insertChar('a');
    buf.insertChar('b');
    handleKeypress(buf, undefined, { name: 'a', ctrl: true });
    expect(buf.cursor.col).toBe(0);
  });

  it('should handle End / Ctrl+E', () => {
    buf.insertChar('a');
    buf.insertChar('b');
    buf.cursor.col = 0;
    handleKeypress(buf, undefined, { name: 'e', ctrl: true });
    expect(buf.cursor.col).toBe(2);
  });

  it('should handle character with key object', () => {
    const result = handleKeypress(buf, 'x', { name: 'x' });
    expect(result).toBe('continue');
    expect(buf.lines).toEqual(['x']);
  });

  it('should ignore ctrl+other keys', () => {
    const result = handleKeypress(buf, undefined, { name: 'z', ctrl: true });
    expect(result).toBe('continue');
    expect(buf.isEmpty()).toBe(true);
  });

  it('should return continue for undefined key and no char', () => {
    const result = handleKeypress(buf, undefined, undefined);
    expect(result).toBe('continue');
  });

  it('should handle Enter without meta explicitly', () => {
    const result = handleKeypress(buf, '\r', { name: 'return', meta: false });
    expect(result).toBe('submit');
  });

  it('should handle multi-char sequence correctly', () => {
    // Simulate typing "hello"
    for (const ch of 'hello') {
      handleKeypress(buf, ch, undefined);
    }
    expect(buf.getText()).toBe('hello');
  });

  it('should handle Alt+Enter in middle of text', () => {
    for (const ch of 'ab') {
      handleKeypress(buf, ch, undefined);
    }
    buf.cursor.col = 1; // between 'a' and 'b'
    handleKeypress(buf, '\r', { name: 'return', meta: true });
    expect(buf.lines).toEqual(['a', 'b']);
    expect(buf.cursor).toEqual({ line: 1, col: 0 });
  });
});
