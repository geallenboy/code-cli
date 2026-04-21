/**
 * Post-Compression Recovery — 压缩后自动恢复
 *
 * Auto 压缩完成后，重新读取最近编辑的文件以恢复上下文。
 * 从 pre-compression 历史中提取 edit_file/write_file 工具调用的文件路径，
 * 重新读取文件内容并注入为 system-reminder 消息。
 *
 * 关键原则：Recovery 在 autoCompact 之后运行，不在压缩过程中运行。
 */

import type { ModelMessage } from 'ai';
import { readFileContent } from '../tools/file-ops.js';

/** 最大恢复文件数 */
const MAX_FILES = 5;

/** 每个文件最大字符数 */
const MAX_PER_FILE = 5000;

/** 总恢复内容最大字符数 */
const MAX_RECOVERY_CHARS = 25000;

/**
 * 从消息历史中提取最近编辑过的文件路径。
 *
 * 扫描 assistant 消息中的 edit_file/write_file 工具调用，
 * 从最新到最旧收集，去重后返回最多 MAX_FILES 个路径。
 *
 * @param messages - 消息历史（通常是 pre-compression 历史）
 * @returns 最近编辑的文件路径列表
 */
export function extractRecentlyEditedFiles(messages: ModelMessage[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  // Scan from end to find most recent edits
  for (let i = messages.length - 1; i >= 0 && files.length < MAX_FILES; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

    for (const part of msg.content) {
      if (files.length >= MAX_FILES) break;
      if (part.type === 'tool-call') {
        const tc = part as { toolName: string; input: Record<string, unknown> };
        if (
          (tc.toolName === 'edit_file' || tc.toolName === 'write_file') &&
          tc.input['file_path']
        ) {
          const path = String(tc.input['file_path']);
          if (!seen.has(path)) {
            seen.add(path);
            files.push(path);
          }
        }
      }
    }
  }

  return files;
}

/**
 * 构建恢复消息：读取文件内容并打包为 system-reminder 消息。
 *
 * 每个文件内容截断到 MAX_PER_FILE 字符，总量不超过 MAX_RECOVERY_CHARS。
 * 文件不存在或读取失败时静默跳过。
 *
 * @param filePaths - 要恢复的文件路径列表
 * @returns 恢复消息数组（0 或 1 条消息）
 */
export function buildRecoveryMessages(filePaths: string[]): ModelMessage[] {
  const parts: string[] = [];
  let totalChars = 0;

  for (const path of filePaths) {
    const content = readFileContent(path);
    if (content.startsWith('Error:')) continue; // File doesn't exist or read error

    const truncated = content.length > MAX_PER_FILE
      ? content.slice(0, MAX_PER_FILE) + '\n[truncated]'
      : content;

    if (totalChars + truncated.length > MAX_RECOVERY_CHARS) break;

    parts.push(`File: ${path}\n${truncated}`);
    totalChars += truncated.length;
  }

  if (parts.length === 0) return [];

  return [
    {
      role: 'user' as const,
      content: `[Post-compression recovery] Recently edited files:\n\n${parts.join('\n\n---\n\n')}`,
    },
  ];
}
