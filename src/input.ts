/**
 * 多行输入处理器
 *
 * 基于 process.stdin raw mode + readline.emitKeypressEvents() 实现多行编辑。
 * 支持 Alt+Enter 插入换行、Enter 提交、Ctrl+C 清空、方向键导航。
 * 非 TTY 环境回退到 readline 单行模式。
 *
 * 参考设计文档：P0 多行输入处理器
 */

import * as readline from 'node:readline';
import { handleTabCompletion } from './tab-completer.js';
import {
  createSearchState,
  searchAppendChar,
  searchBackspace,
  searchCycleOlder,
  searchSelect,
  searchEscape,
  formatSearchPrompt,
  type HistorySearchState,
} from './history-search.js';

/** 光标位置 */
export interface CursorPosition {
  /** 行索引（0-based） */
  line: number;
  /** 列索引（0-based） */
  col: number;
}

/** 按键事件（与 readline keypress 事件兼容） */
export interface KeypressEvent {
  /** 按键序列 */
  sequence?: string;
  /** 按键名称 */
  name?: string;
  /** 是否按下 Ctrl */
  ctrl?: boolean;
  /** 是否按下 Meta/Alt */
  meta?: boolean;
  /** 是否按下 Shift */
  shift?: boolean;
}

/**
 * 多行输入缓冲区管理器（纯逻辑，无 I/O）
 *
 * 管理多行文本缓冲区和光标位置，所有方法为纯函数式操作。
 */
export class InputBuffer {
  /** 输入行缓冲区 */
  lines: string[];
  /** 光标位置 */
  cursor: CursorPosition;

  constructor() {
    this.lines = [''];
    this.cursor = { line: 0, col: 0 };
  }

  /** 在光标位置插入字符 */
  insertChar(ch: string): void {
    const line = this.lines[this.cursor.line];
    this.lines[this.cursor.line] =
      line.slice(0, this.cursor.col) + ch + line.slice(this.cursor.col);
    this.cursor.col += ch.length;
  }

  /** 在光标位置插入换行 */
  insertNewline(): void {
    const line = this.lines[this.cursor.line];
    const before = line.slice(0, this.cursor.col);
    const after = line.slice(this.cursor.col);
    this.lines[this.cursor.line] = before;
    this.lines.splice(this.cursor.line + 1, 0, after);
    this.cursor.line++;
    this.cursor.col = 0;
  }

  /** 删除光标前一个字符（Backspace） */
  backspace(): void {
    if (this.cursor.col > 0) {
      const line = this.lines[this.cursor.line];
      this.lines[this.cursor.line] =
        line.slice(0, this.cursor.col - 1) + line.slice(this.cursor.col);
      this.cursor.col--;
    } else if (this.cursor.line > 0) {
      // 合并到上一行
      const currentLine = this.lines[this.cursor.line];
      const prevLine = this.lines[this.cursor.line - 1];
      this.cursor.col = prevLine.length;
      this.lines[this.cursor.line - 1] = prevLine + currentLine;
      this.lines.splice(this.cursor.line, 1);
      this.cursor.line--;
    }
  }

  /** 删除光标后一个字符（Delete） */
  deleteForward(): void {
    const line = this.lines[this.cursor.line];
    if (this.cursor.col < line.length) {
      this.lines[this.cursor.line] =
        line.slice(0, this.cursor.col) + line.slice(this.cursor.col + 1);
    } else if (this.cursor.line < this.lines.length - 1) {
      // 合并下一行到当前行
      this.lines[this.cursor.line] = line + this.lines[this.cursor.line + 1];
      this.lines.splice(this.cursor.line + 1, 1);
    }
  }

  /** 光标左移 */
  moveLeft(): void {
    if (this.cursor.col > 0) {
      this.cursor.col--;
    } else if (this.cursor.line > 0) {
      this.cursor.line--;
      this.cursor.col = this.lines[this.cursor.line].length;
    }
  }

  /** 光标右移 */
  moveRight(): void {
    const line = this.lines[this.cursor.line];
    if (this.cursor.col < line.length) {
      this.cursor.col++;
    } else if (this.cursor.line < this.lines.length - 1) {
      this.cursor.line++;
      this.cursor.col = 0;
    }
  }

  /** 光标上移 */
  moveUp(): void {
    if (this.cursor.line > 0) {
      this.cursor.line--;
      this.cursor.col = Math.min(this.cursor.col, this.lines[this.cursor.line].length);
    }
  }

  /** 光标下移 */
  moveDown(): void {
    if (this.cursor.line < this.lines.length - 1) {
      this.cursor.line++;
      this.cursor.col = Math.min(this.cursor.col, this.lines[this.cursor.line].length);
    }
  }

  /** 移动到行首 */
  moveToLineStart(): void {
    this.cursor.col = 0;
  }

  /** 移动到行尾 */
  moveToLineEnd(): void {
    this.cursor.col = this.lines[this.cursor.line].length;
  }

  /** 清空缓冲区 */
  clear(): void {
    this.lines = [''];
    this.cursor = { line: 0, col: 0 };
  }

  /** 获取完整文本 */
  getText(): string {
    return this.lines.join('\n');
  }

  /** 是否为空 */
  isEmpty(): boolean {
    return this.lines.length === 1 && this.lines[0] === '';
  }

  /** 是否为多行 */
  isMultiLine(): boolean {
    return this.lines.length > 1;
  }
}

/**
 * 处理按键事件，更新缓冲区状态。
 *
 * @returns 'submit' 表示提交，'clear' 表示 Ctrl+C 清空，'continue' 表示继续输入
 */
export function handleKeypress(
  buffer: InputBuffer,
  ch: string | undefined,
  key: KeypressEvent | undefined,
): 'submit' | 'clear' | 'continue' {
  if (!key && ch) {
    // 普通字符输入
    buffer.insertChar(ch);
    return 'continue';
  }

  if (!key) return 'continue';

  // Ctrl+C → 清空
  if (key.name === 'c' && key.ctrl) {
    return 'clear';
  }

  // Alt+Enter / Meta+Enter → 插入换行
  if (key.name === 'return' && key.meta) {
    buffer.insertNewline();
    return 'continue';
  }

  // Enter → 提交
  if (key.name === 'return' && !key.meta) {
    return 'submit';
  }

  // Backspace
  if (key.name === 'backspace') {
    buffer.backspace();
    return 'continue';
  }

  // Delete
  if (key.name === 'delete') {
    buffer.deleteForward();
    return 'continue';
  }

  // 方向键
  if (key.name === 'left') {
    buffer.moveLeft();
    return 'continue';
  }
  if (key.name === 'right') {
    buffer.moveRight();
    return 'continue';
  }
  if (key.name === 'up') {
    buffer.moveUp();
    return 'continue';
  }
  if (key.name === 'down') {
    buffer.moveDown();
    return 'continue';
  }

  // Home / Ctrl+A → 行首
  if (key.name === 'home' || (key.name === 'a' && key.ctrl)) {
    buffer.moveToLineStart();
    return 'continue';
  }

  // End / Ctrl+E → 行尾
  if (key.name === 'end' || (key.name === 'e' && key.ctrl)) {
    buffer.moveToLineEnd();
    return 'continue';
  }

  // Tab → 文件路径补全
  if (key.name === 'tab' && !key.ctrl && !key.meta) {
    const result = handleTabCompletion(
      buffer.lines[buffer.cursor.line],
      buffer.cursor.col,
      process.cwd(),
    );
    if (result) {
      buffer.lines[buffer.cursor.line] = result.line;
      buffer.cursor.col = result.cursorCol;
    }
    return 'continue';
  }

  // 普通字符（有 key 但也有 ch）
  if (ch && !key.ctrl && !key.meta && ch.length === 1 && ch >= ' ') {
    buffer.insertChar(ch);
    return 'continue';
  }

  return 'continue';
}

/**
 * 多行输入处理器
 *
 * 基于 process.stdin raw mode + keypress 事件实现多行编辑。
 * 非 TTY 环境自动回退到 readline 单行模式。
 */
export class MultiLineInput {
  private history: string[] = [];
  private destroyed = false;
  private keypressInitialized = false;

  /**
   * 启动输入，返回用户提交的完整输入。
   *
   * @param indicator - 提示符文本（如 "> " 或 "[PLAN]> "）
   * @returns 用户提交的完整多行文本
   */
  async prompt(indicator?: string): Promise<string> {
    const promptStr = indicator ?? '> ';

    // 非 TTY 回退到 readline 单行模式
    if (!process.stdin.isTTY) {
      return this.readlineFallback(promptStr);
    }

    return this.rawModePrompt(promptStr);
  }

  /** 设置输入历史 */
  setHistory(history: string[]): void {
    this.history = [...history];
  }

  /** 销毁，恢复 stdin 状态 */
  destroy(): void {
    this.destroyed = true;
    if (process.stdin.isTTY && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // ignore
      }
    }
  }

  /** readline 单行回退模式 */
  private readlineFallback(promptStr: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(promptStr, (answer) => {
        rl.close();
        resolve(answer);
      });
      rl.once('close', () => reject(new Error('readline closed')));
    });
  }

  /** raw mode 多行输入 */
  private rawModePrompt(promptStr: string): Promise<string> {
    return new Promise((resolve) => {
      const buffer = new InputBuffer();
      const continuationPrefix = '... ';

      // 初始化 keypress 事件（只需一次）
      if (!this.keypressInitialized) {
        readline.emitKeypressEvents(process.stdin);
        this.keypressInitialized = true;
      }

      // 设置 raw mode
      process.stdin.setRawMode(true);
      process.stdin.resume();

      // 显示初始提示符
      process.stdout.write(promptStr);

      /** 上一次渲染的行数（用于清除） */
      let prevLineCount = 1;

      /** 渲染（带行数追踪） */
      const renderWithTracking = (): void => {
        // 清除之前渲染的所有行：移到第一行，逐行清除
        let clearSeq = '\r\x1b[K';
        for (let i = 1; i < prevLineCount; i++) {
          clearSeq = '\x1b[A\r\x1b[K' + clearSeq;
        }
        process.stdout.write(clearSeq);

        const cursorLine = buffer.cursor.line;
        const cursorCol = buffer.cursor.col;

        // 单行优化：最常见的情况，不需要复杂的光标管理
        if (buffer.lines.length === 1) {
          const line = buffer.lines[0];
          const beforeCursor = line.slice(0, cursorCol);
          const afterCursor = line.slice(cursorCol);
          // 写提示符 + 光标前的文本
          process.stdout.write(promptStr + beforeCursor);
          if (afterCursor.length > 0) {
            // 保存光标，写剩余文本，恢复光标
            process.stdout.write('\x1b7' + afterCursor + '\x1b8');
          }
          prevLineCount = 1;
          return;
        }

        // 多行：逐行重绘，在光标位置使用 DEC save/restore
        for (let i = 0; i < buffer.lines.length; i++) {
          const prefix = i === 0 ? promptStr : continuationPrefix;
          if (i > 0) {
            process.stdout.write('\n');
          }

          if (i === cursorLine) {
            const beforeCursor = buffer.lines[i].slice(0, cursorCol);
            const afterCursor = buffer.lines[i].slice(cursorCol);
            process.stdout.write(prefix + beforeCursor);
            process.stdout.write('\x1b7'); // DEC save cursor
            process.stdout.write(afterCursor);
          } else {
            process.stdout.write(prefix + buffer.lines[i]);
          }
        }

        prevLineCount = buffer.lines.length;

        // DEC restore cursor
        process.stdout.write('\x1b8');
      };

      const cleanup = (): void => {
        process.stdin.removeListener('keypress', onKeypress);
        try {
          process.stdin.setRawMode(false);
        } catch {
          // ignore
        }
        process.stdin.pause();
      };

      /** Ctrl+R 历史搜索状态 */
      let searchState: HistorySearchState | null = null;

      /** 渲染搜索模式提示 */
      const renderSearch = (): void => {
        if (!searchState) return;
        const prompt = formatSearchPrompt(searchState);
        // Clear current line and show search prompt
        process.stdout.write('\r\x1b[K' + prompt);
      };

      /** 退出搜索模式，将文本放入缓冲区 */
      const exitSearch = (text: string): void => {
        searchState = null;
        buffer.clear();
        for (const ch of text) {
          buffer.insertChar(ch);
        }
        prevLineCount = 1;
        renderWithTracking();
      };

      const onKeypress = (ch: string | undefined, key: KeypressEvent | undefined): void => {
        if (this.destroyed) {
          cleanup();
          return;
        }

        // Handle Ctrl+R search mode
        if (searchState) {
          if (key?.name === 'return') {
            // Enter: select match and exit search
            const selected = searchSelect(searchState);
            exitSearch(selected ?? '');
            return;
          }
          if (key?.name === 'escape') {
            // Escape: cancel search, restore saved input
            const saved = searchEscape(searchState);
            exitSearch(saved);
            return;
          }
          if (key?.name === 'r' && key?.ctrl) {
            // Ctrl+R again: cycle to older match
            searchState = searchCycleOlder(searchState, this.history);
            renderSearch();
            return;
          }
          if (key?.name === 'backspace') {
            searchState = searchBackspace(searchState, this.history);
            renderSearch();
            return;
          }
          if (key?.name === 'c' && key?.ctrl) {
            // Ctrl+C: exit search, clear
            exitSearch('');
            return;
          }
          // Regular character: append to search query
          if (ch && ch.length === 1 && ch >= ' ') {
            searchState = searchAppendChar(searchState, ch, this.history);
            renderSearch();
            return;
          }
          return;
        }

        // Ctrl+R: enter search mode
        if (key?.name === 'r' && key?.ctrl) {
          searchState = createSearchState(buffer.getText());
          renderSearch();
          return;
        }

        const action = handleKeypress(buffer, ch, key);

        switch (action) {
          case 'submit': {
            const text = buffer.getText();
            cleanup();
            // 移到最后一行末尾并换行
            const lastLine = buffer.lines.length - 1;
            const cursorLine = buffer.cursor.line;
            if (cursorLine < lastLine) {
              process.stdout.write(`\x1b[${lastLine - cursorLine}B`);
            }
            process.stdout.write('\n');
            resolve(text);
            return;
          }
          case 'clear':
            buffer.clear();
            prevLineCount = Math.max(prevLineCount, 1);
            renderWithTracking();
            return;
          case 'continue':
            renderWithTracking();
            return;
        }
      };

      process.stdin.on('keypress', onKeypress);
    });
  }
}
