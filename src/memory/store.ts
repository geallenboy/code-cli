/**
 * 记忆存储层
 *
 * 将记忆存储为 Markdown + YAML frontmatter 格式的文件。
 * 存储路径：~/.gearcode/memory/
 *
 * 参考 Claude Code: src/memdir/ 的存储机制
 * 简化：纯文件系统存储，无数据库
 */

import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MEMORY_DIR = join(homedir(), '.gearcode', 'memory');

/** 记忆类型：封闭四分类 */
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

/** 记忆条目（列表用） */
export interface MemoryEntry {
  filename: string;
  type: MemoryType;
  description: string;
  created: string;
  age: string;
}

/** 记忆文件（含内容） */
export interface MemoryFile extends MemoryEntry {
  content: string;
}

/** 确保记忆目录存在 */
function ensureDir(): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

/**
 * 计算记忆年龄的人类可读描述。
 *
 * @param created - 创建日期字符串（YYYY-MM-DD）
 * @returns 人类可读的年龄描述
 */
function formatAge(created: string): string {
  const days = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * 创建新记忆。
 *
 * 生成 Markdown 文件，包含 YAML frontmatter（type, description, created）。
 * 文件名格式：{type}-{slug}.md
 *
 * @param type - 记忆类型
 * @param description - 记忆描述
 * @param content - 记忆内容
 * @returns 生成的文件名
 */
export function createMemory(type: MemoryType, description: string, content: string): string {
  ensureDir();
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const filename = `${type}-${slug}.md`;
  const created = new Date().toISOString().split('T')[0];
  const frontmatter = `---\ntype: ${type}\ndescription: ${description}\ncreated: ${created}\n---\n\n`;
  writeFileSync(join(MEMORY_DIR, filename), frontmatter + content, 'utf-8');
  return filename;
}

/**
 * 列出所有记忆条目。
 *
 * 扫描记忆目录中的 .md 文件，解析 frontmatter 提取元数据。
 *
 * @returns 记忆条目列表
 */
export function listMemories(): MemoryEntry[] {
  ensureDir();
  try {
    return readdirSync(MEMORY_DIR)
      .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
      .map(filename => {
        const raw = readFileSync(join(MEMORY_DIR, filename), 'utf-8');
        const fm = parseFrontmatter(raw);
        return {
          filename,
          type: (fm.type ?? 'reference') as MemoryType,
          description: fm.description ?? filename,
          created: fm.created ?? 'unknown',
          age: fm.created ? formatAge(fm.created) : 'unknown',
        };
      });
  } catch {
    return [];
  }
}

/**
 * 加载单个记忆文件（含内容）。
 *
 * @param filename - 记忆文件名
 * @returns 记忆文件对象，不存在时返回 null
 */
export function loadMemory(filename: string): MemoryFile | null {
  const path = join(MEMORY_DIR, filename);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const fm = parseFrontmatter(raw);
    const content = raw.replace(/^---[\s\S]*?---\n*/, '');
    return {
      filename,
      type: (fm.type ?? 'reference') as MemoryType,
      description: fm.description ?? filename,
      created: fm.created ?? 'unknown',
      age: fm.created ? formatAge(fm.created) : 'unknown',
      content,
    };
  } catch {
    return null;
  }
}

/**
 * 构建 MEMORY.md 索引。
 *
 * 生成所有记忆的索引列表，限制 200 行 / 25KB。
 * 用于会话启动时注入系统提示词。
 *
 * @returns 索引内容字符串，无记忆时返回空字符串
 */
export function buildMemoryIndex(): string {
  const memories = listMemories();
  if (memories.length === 0) return '';
  const lines = memories.map(m => `- [${m.type}] ${m.filename} (${m.age}): ${m.description}`);
  const index = '# Memory Index\n\n' + lines.join('\n');
  // Limit to 200 lines / 25KB
  const limited = index.split('\n').slice(0, 200).join('\n');
  return limited.slice(0, 25000);
}

/**
 * 解析 YAML frontmatter。
 *
 * 从 Markdown 文件头部提取 key: value 对。
 *
 * @param content - 文件内容
 * @returns 键值对映射
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}
