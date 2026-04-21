/**
 * 会话持久化管理
 *
 * 将对话历史保存到磁盘，支持会话恢复。
 * 存储路径：~/.xiaomi-code/sessions/
 *
 * 参考 Claude Code: 会话管理机制
 * 简化：JSON 文件存储代替数据库
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SessionData } from './types.js';

const SESSIONS_DIR = join(homedir(), '.xiaomi-code', 'sessions');

/**
 * 确保会话目录存在
 */
function ensureDir(): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * 保存会话到磁盘
 * @param id - 会话 ID
 * @param data - 会话数据
 */
export function saveSession(id: string, data: SessionData): void {
  try {
    ensureDir();
    const filePath = join(SESSIONS_DIR, `${id}.json`);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Silently fail — session persistence is best-effort
  }
}

/**
 * 加载最近的会话
 * @returns 最近的会话数据，不存在时返回 null
 */
export function loadLatestSession(): SessionData | null {
  try {
    ensureDir();
    const files = readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    return loadSession(files[0].replace('.json', ''));
  } catch {
    return null;
  }
}

/**
 * 加载指定会话
 * @param id - 会话 ID
 * @returns 会话数据，不存在时返回 null
 */
export function loadSession(id: string): SessionData | null {
  try {
    const filePath = join(SESSIONS_DIR, `${id}.json`);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as SessionData;
  } catch {
    return null; // Corrupted file — ignore
  }
}
