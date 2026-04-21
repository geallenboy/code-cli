/**
 * Bash AST 解析器
 *
 * 增强的 Bash 命令解析器，生成结构化 AST。
 * 处理嵌套引号、heredoc、进程替换、算术展开、花括号展开。
 *
 * 设计为可替换为 tree-sitter-bash WASM 的接口。
 * 当前实现使用增强的递归下降解析器。
 * 降级：解析失败时回退到 bash-parser.ts（P32）。
 *
 * 参考 Claude Code: tree-sitter-bash WASM 解析
 */

import { parseCommand, type CommandToken } from '../bash-parser.js';

/** AST 节点类型 */
export type AstNodeType =
  | 'program'
  | 'command'
  | 'pipeline'
  | 'list'           // && / || / ;
  | 'subshell'       // $() or ()
  | 'process_sub'    // <() or >()
  | 'heredoc'        // <<EOF
  | 'arithmetic'     // $(())
  | 'brace_expand'   // {a,b,c}
  | 'word'
  | 'redirect'
  | 'assignment';

/** AST 节点 */
export interface AstNode {
  type: AstNodeType;
  value: string;
  children: AstNode[];
  /** 原始位置（字符偏移） */
  start?: number;
  end?: number;
}

/** 解析结果 */
export interface ParseResult {
  /** 解析后的 AST */
  ast: AstNode;
  /** 是否使用了降级解析器 */
  fallback: boolean;
  /** 解析错误（如果有） */
  error?: string;
}

/**
 * Bash AST 解析器
 *
 * 提供增强的 Bash 命令解析，支持：
 * - 嵌套引号
 * - Heredoc (<<EOF)
 * - 进程替换 (<() / >())
 * - 算术展开 ($(()))
 * - 花括号展开 ({a,b,c})
 *
 * 降级机制（P32）：解析失败时回退到 bash-parser.ts
 */
export class BashAstParser {
  private _loaded = false;

  /** 是否已加载（懒加载模拟） */
  get loaded(): boolean {
    return this._loaded;
  }

  /**
   * 懒加载解析器
   *
   * 模拟 tree-sitter WASM 的懒加载行为。
   * 不影响启动时间。
   */
  async load(): Promise<void> {
    // 模拟 WASM 加载（实际使用增强的递归下降解析器）
    this._loaded = true;
  }

  /**
   * 解析 Bash 命令为 AST
   *
   * @param command - Bash 命令字符串
   * @returns 解析结果（包含 AST 和降级标志）
   */
  parse(command: string): ParseResult {
    try {
      const ast = this.buildAst(command);
      return { ast, fallback: false };
    } catch (error) {
      // P32: 解析失败时回退到 bash-parser.ts
      return this.fallbackParse(command, error);
    }
  }

  /**
   * 构建 AST
   *
   * 增强解析：检测 heredoc、进程替换、算术展开、花括号展开，
   * 然后委托给基础解析器处理命令结构。
   */
  private buildAst(command: string): AstNode {
    const trimmed = command.trim();
    if (!trimmed) {
      return { type: 'program', value: '', children: [] };
    }

    const children: AstNode[] = [];

    // 检测 heredoc
    const heredocMatch = trimmed.match(/<<-?\s*['"]?(\w+)['"]?/);
    if (heredocMatch) {
      children.push({
        type: 'heredoc',
        value: heredocMatch[0],
        children: [{ type: 'word', value: heredocMatch[1], children: [] }],
      });
    }

    // 检测进程替换 <() / >()
    const procSubMatches = trimmed.matchAll(/[<>]\(([^)]*)\)/g);
    for (const match of procSubMatches) {
      children.push({
        type: 'process_sub',
        value: match[0],
        children: match[1] ? [this.buildAst(match[1])] : [],
      });
    }

    // 检测算术展开 $(())
    const arithMatches = trimmed.matchAll(/\$\(\(([^)]*)\)\)/g);
    for (const match of arithMatches) {
      children.push({
        type: 'arithmetic',
        value: match[0],
        children: [{ type: 'word', value: match[1] ?? '', children: [] }],
      });
    }

    // 检测花括号展开 {a,b,c}
    const braceMatches = trimmed.matchAll(/\{([^}]*,[^}]*)\}/g);
    for (const match of braceMatches) {
      children.push({
        type: 'brace_expand',
        value: match[0],
        children: (match[1] ?? '').split(',').map(v => ({
          type: 'word' as const,
          value: v.trim(),
          children: [],
        })),
      });
    }

    // 使用基础解析器处理命令结构
    const tokens = parseCommand(trimmed);
    children.push(...this.tokensToAst(tokens));

    return {
      type: 'program',
      value: trimmed,
      children,
    };
  }

  /**
   * 将 CommandToken 转换为 AstNode
   */
  private tokensToAst(tokens: CommandToken[]): AstNode[] {
    const nodes: AstNode[] = [];

    for (const token of tokens) {
      switch (token.type) {
        case 'command':
          nodes.push({
            type: 'command',
            value: token.value,
            children: token.children?.map(c => this.tokenToAst(c)) ?? [],
          });
          break;
        case 'pipe':
          nodes.push({ type: 'pipeline', value: '|', children: [] });
          break;
        case 'and':
        case 'or':
        case 'semicolon':
          nodes.push({ type: 'list', value: token.value, children: [] });
          break;
        case 'subshell':
          nodes.push({
            type: 'subshell',
            value: token.value,
            children: token.children?.map(c => this.tokenToAst(c)) ?? [],
          });
          break;
        default:
          nodes.push({ type: 'word', value: token.value, children: [] });
      }
    }

    return nodes;
  }

  /**
   * 将单个 CommandToken 转换为 AstNode
   */
  private tokenToAst(token: CommandToken): AstNode {
    if (token.type === 'subshell') {
      return {
        type: 'subshell',
        value: token.value,
        children: token.children?.map(c => this.tokenToAst(c)) ?? [],
      };
    }
    if (token.type === 'redirect') {
      return { type: 'redirect', value: token.value, children: [] };
    }
    // 检测赋值 KEY=VALUE
    if (token.type === 'argument' && /^\w+=/.test(token.value)) {
      return { type: 'assignment', value: token.value, children: [] };
    }
    return { type: 'word', value: token.value, children: [] };
  }

  /**
   * 降级解析（P32）
   *
   * 当增强解析器失败时，回退到 bash-parser.ts 的基础解析器。
   */
  private fallbackParse(command: string, error: unknown): ParseResult {
    try {
      const tokens = parseCommand(command);
      const children = this.tokensToAst(tokens);
      return {
        ast: { type: 'program', value: command, children },
        fallback: true,
        error: error instanceof Error ? error.message : String(error),
      };
    } catch {
      // 连降级也失败了，返回最小 AST
      return {
        ast: {
          type: 'program',
          value: command,
          children: [{ type: 'word', value: command, children: [] }],
        },
        fallback: true,
        error: 'Both enhanced and fallback parsers failed',
      };
    }
  }
}
