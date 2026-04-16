/**
 * 会话持久化管理
 *
 * 将对话历史保存到磁盘，支持会话恢复。
 * 存储路径：~/.mini-claude/sessions/
 *
 * 参考 Claude Code: 会话管理机制
 * 简化：JSON 文件存储代替数据库
 */

import type { SessionData } from './types.js';

/**
 * 保存会话到磁盘
 * @param _id - 会话 ID
 * @param _data - 会话数据
 */
export function saveSession(_id: string, _data: SessionData): void {
  // TODO: Phase 2 — 实现会话保存
  throw new Error('Not implemented');
}

/**
 * 加载最近的会话
 * @returns 最近的会话数据，不存在时返回 null
 */
export function loadLatestSession(): SessionData | null {
  // TODO: Phase 2 — 实现会话加载
  throw new Error('Not implemented');
}

/**
 * 加载指定会话
 * @param _id - 会话 ID
 * @returns 会话数据，不存在时返回 null
 */
export function loadSession(_id: string): SessionData | null {
  // TODO: Phase 2 — 实现指定会话加载
  throw new Error('Not implemented');
}
