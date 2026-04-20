/**
 * 记忆语义召回
 *
 * 使用当前模型评估记忆与用户查询的相关性，
 * 选择最多 5 条最相关的记忆注入对话。
 *
 * 参考 Claude Code: src/memdir/memoryScan.ts + selectRelevantMemories()
 * 简化：直接使用 generateText 评估相关性
 */

import { generateText, type LanguageModel } from 'ai';
import { listMemories, loadMemory, type MemoryFile } from './store.js';

/** 最大召回记忆数 */
const MAX_RECALLED = 5;

/** 最大总字符数 */
const MAX_TOTAL_CHARS = 30000;

/**
 * 根据用户查询召回相关记忆。
 *
 * 流程：
 * 1. 扫描所有记忆的 frontmatter 构建 manifest
 * 2. 使用模型评估相关性，选择最多 5 条
 * 3. 加载完整内容，限制总量 30K 字符
 * 4. 会话内去重（通过 alreadyRecalled 集合）
 *
 * @param query - 用户查询
 * @param model - 语言模型实例
 * @param alreadyRecalled - 已召回的记忆文件名集合（用于去重）
 * @returns 召回的记忆文件列表
 */
export async function recallRelevantMemories(
  query: string,
  model: LanguageModel,
  alreadyRecalled: Set<string>,
): Promise<MemoryFile[]> {
  const memories = listMemories().filter(m => !alreadyRecalled.has(m.filename));
  if (memories.length === 0) return [];

  const manifest = memories
    .map(m => `[${m.type}] ${m.filename} (${m.age}): ${m.description}`)
    .join('\n');

  try {
    const { text } = await generateText({
      model,
      prompt: `Given this user query: "${query}"\n\nWhich of these memories are relevant? Return ONLY the filenames, one per line, most relevant first. Return at most ${MAX_RECALLED} filenames.\n\n${manifest}`,
    });

    const selectedFiles = text
      .trim()
      .split('\n')
      .map(l => l.trim())
      .filter(l => memories.some(m => m.filename === l))
      .slice(0, MAX_RECALLED);

    const results: MemoryFile[] = [];
    let totalChars = 0;
    for (const filename of selectedFiles) {
      const mem = loadMemory(filename);
      if (!mem) continue;
      if (totalChars + mem.content.length > MAX_TOTAL_CHARS) break;
      totalChars += mem.content.length;
      alreadyRecalled.add(filename);
      results.push(mem);
    }
    return results;
  } catch {
    return []; // Graceful degradation
  }
}
