/**
 * 工具注册表 + dispatch
 *
 * 统一的工具声明、验证和调度机制。
 * 使用 Vercel AI SDK 的 tool() 函数 + Zod schema 声明工具，
 * 提供 dispatch 函数将工具名映射到执行函数。
 *
 * 参考 Claude Code: src/Tool.ts + src/tools.ts
 * 简化：AI SDK tool() 声明代替 Tool 泛型接口
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { readFileContent } from './file-ops.js';
import { writeFile } from './editor.js';
import { executeShellCommand } from './shell.js';

/**
 * read_file 工具定义
 *
 * 读取文件内容并添加行号前缀，方便模型引用具体行。
 */
const readFileTool = tool({
  description:
    'Read the contents of a file with line numbers. Use this to understand existing code before making changes.',
  inputSchema: z.object({
    file_path: z.string().describe('The absolute or relative path to the file to read'),
  }),
  execute: async ({ file_path }) => {
    try {
      return truncateResult(readFileContent(file_path));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }
  },
});

/**
 * write_file 工具定义
 *
 * 创建或覆写文件，自动创建缺失的父目录。
 */
const writeFileTool = tool({
  description:
    'Create a new file or overwrite an existing file with the provided content. Parent directories are created automatically.',
  inputSchema: z.object({
    file_path: z.string().describe('The path where the file should be written'),
    content: z.string().describe('The content to write to the file'),
  }),
  execute: async ({ file_path, content }) => {
    try {
      return writeFile(file_path, content);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }
  },
});

/**
 * run_shell 工具定义
 *
 * 执行 Shell 命令，带超时和输出缓冲区限制。
 */
const runShellTool = tool({
  description:
    'Execute a shell command and return its output. Use this for running tests, installing packages, git operations, etc. Commands have a 30-second default timeout.',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 30000)'),
  }),
  execute: async ({ command, timeout }) => {
    try {
      return truncateResult(executeShellCommand(command, timeout));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }
  },
});

/**
 * 获取所有工具定义（传给 AI SDK 的 streamText）
 *
 * 返回一个 Record，key 为工具名，value 为 Tool 定义。
 * Phase 1 注册 3 个基础工具：read_file, write_file, run_shell。
 *
 * @returns 工具名到工具定义的映射
 */
export function getToolDefinitions(): Record<string, Tool> {
  return {
    read_file: readFileTool,
    write_file: writeFileTool,
    run_shell: runShellTool,
  };
}

/**
 * 截断超长工具结果（保留首尾各半）
 *
 * 当结果字符串超过 maxChars 时，保留前半和后半，
 * 中间插入截断指示器显示被省略的字符数。
 *
 * @param result - 工具执行结果
 * @param maxChars - 最大字符数，默认 50000
 * @returns 截断后的结果
 */
export function truncateResult(result: string, maxChars = 50_000): string {
  if (result.length <= maxChars) {
    return result;
  }
  const half = Math.floor(maxChars / 2);
  const omitted = result.length - maxChars;
  return (
    result.slice(0, half) +
    `\n\n... [truncated ${omitted} characters] ...\n\n` +
    result.slice(-half)
  );
}
