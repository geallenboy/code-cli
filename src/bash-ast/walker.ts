/**
 * AST 遍历器
 *
 * 遍历 Bash AST 提取所有命令调用信息。
 * 处理嵌套子 shell、管道、复合命令中的命令。
 *
 * 参考 Claude Code: AST walker for command extraction
 */

import type { AstNode } from './parser.js';

/** 命令信息 */
export interface CommandInfo {
  /** 命令名称 */
  name: string;
  /** 命令参数 */
  args: string[];
  /** 完整命令文本 */
  fullText: string;
  /** 是否在子 shell 中 */
  inSubshell: boolean;
  /** 是否在管道中 */
  inPipeline: boolean;
  /** 嵌套深度 */
  depth: number;
}

/**
 * AST 遍历器
 *
 * 深度优先遍历 AST，提取所有命令调用。
 * 追踪上下文信息（子 shell、管道、嵌套深度）。
 */
export class AstWalker {
  /**
   * 提取所有命令信息
   *
   * @param ast - AST 根节点
   * @returns 命令信息列表
   */
  extractCommands(ast: AstNode): CommandInfo[] {
    const commands: CommandInfo[] = [];
    this.walk(ast, commands, false, false, 0);
    return commands;
  }

  /**
   * 提取所有命令名称（去重）
   *
   * @param ast - AST 根节点
   * @returns 命令名称列表
   */
  extractCommandNames(ast: AstNode): string[] {
    const commands = this.extractCommands(ast);
    return [...new Set(commands.map(c => c.name))];
  }

  /**
   * 检查是否包含特定命令
   *
   * @param ast - AST 根节点
   * @param commandName - 要查找的命令名
   * @returns 是否包含
   */
  hasCommand(ast: AstNode, commandName: string): boolean {
    const commands = this.extractCommands(ast);
    return commands.some(c => c.name === commandName);
  }

  /**
   * 获取所有子 shell 中的命令
   *
   * @param ast - AST 根节点
   * @returns 子 shell 中的命令列表
   */
  getSubshellCommands(ast: AstNode): CommandInfo[] {
    return this.extractCommands(ast).filter(c => c.inSubshell);
  }

  /**
   * 递归遍历 AST
   */
  private walk(
    node: AstNode,
    commands: CommandInfo[],
    inSubshell: boolean,
    inPipeline: boolean,
    depth: number,
  ): void {
    switch (node.type) {
      case 'command': {
        const info = this.parseCommandNode(node, inSubshell, inPipeline, depth);
        if (info) commands.push(info);
        break;
      }
      case 'subshell':
      case 'process_sub':
        for (const child of node.children) {
          this.walk(child, commands, true, inPipeline, depth + 1);
        }
        break;
      case 'pipeline':
        // 后续节点在管道中
        break;
      default:
        for (const child of node.children) {
          this.walk(child, commands, inSubshell, inPipeline, depth);
        }
    }
  }

  /**
   * 从命令节点提取命令信息
   */
  private parseCommandNode(
    node: AstNode,
    inSubshell: boolean,
    inPipeline: boolean,
    depth: number,
  ): CommandInfo | null {
    const words = node.children.filter(c => c.type === 'word' || c.type === 'assignment');
    if (words.length === 0) return null;

    // 跳过赋值前缀
    let cmdIdx = 0;
    while (cmdIdx < words.length && words[cmdIdx].type === 'assignment') {
      cmdIdx++;
    }

    if (cmdIdx >= words.length) return null;

    const cmdWord = words[cmdIdx];
    const name = cmdWord.value.replace(/^['"`]|['"`]$/g, '');
    const args = words.slice(cmdIdx + 1).map(w => w.value);

    // 递归遍历子 shell 子节点
    for (const child of node.children) {
      if (child.type === 'subshell' || child.type === 'process_sub') {
        for (const subChild of child.children) {
          this.walk(subChild, [], true, inPipeline, depth + 1);
        }
      }
    }

    return {
      name,
      args,
      fullText: node.value,
      inSubshell,
      inPipeline,
      depth,
    };
  }
}
