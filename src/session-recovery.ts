/**
 * 自动会话恢复提示
 *
 * 启动时检测 ~/.code-cli/sessions/ 中最近的会话文件，
 * 判断是否为"未完成"会话（未通过双击 Ctrl+C 或 /exit 正常退出），
 * 提示用户是否恢复。
 *
 * 纯逻辑部分与 I/O 部分分离，便于测试。
 *
 * 参考设计文档：P2 会话恢复
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SESSIONS_DIR = join(homedir(), '.code-cli', 'sessions');

/** 会话恢复检测结果 */
export interface RecoveryCandidate {
  /** 会话 ID */
  id: string;
  /** 会话开始时间 */
  startTime: string;
  /** 工作目录 */
  cwd: string;
  /** 消息数量 */
  messageCount: number;
}

/** 会话文件中的数据结构（最小化，只读取需要的字段） */
interface SessionFileData {
  id?: string;
  startTime?: string;
  cwd?: string;
  messages?: unknown[];
  exitClean?: boolean;
}

/**
 * 检测是否存在可恢复的未完成会话。
 *
 * "未完成"定义：会话文件中没有 exitClean: true 标记。
 * 只检查最近的一个会话文件。
 *
 * @param sessionsDir - 会话目录路径（可选，默认 ~/.code-cli/sessions/）
 * @returns 恢复候选，null 表示无可恢复会话
 */
export function detectRecoverableSession(
  sessionsDir: string = SESSIONS_DIR,
): RecoveryCandidate | null {
  try {
    if (!existsSync(sessionsDir)) return null;

    const files = readdirSync(sessionsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const latestFile = files[0];
    const filePath = join(sessionsDir, latestFile);
    const content = readFileSync(filePath, 'utf-8');
    const data: SessionFileData = JSON.parse(content);

    // If session exited cleanly, no recovery needed
    if (data.exitClean === true) return null;

    // Must have messages to be worth recovering
    const messageCount = Array.isArray(data.messages) ? data.messages.length : 0;
    if (messageCount === 0) return null;

    return {
      id: data.id ?? latestFile.replace('.json', ''),
      startTime: data.startTime ?? 'unknown',
      cwd: data.cwd ?? 'unknown',
      messageCount,
    };
  } catch {
    // Corrupted file or read error — skip recovery
    return null;
  }
}

/**
 * 格式化恢复提示消息。
 *
 * @param candidate - 恢复候选
 * @returns 提示消息文本
 */
export function formatRecoveryPrompt(candidate: RecoveryCandidate): string {
  const timeStr = candidate.startTime !== 'unknown'
    ? new Date(candidate.startTime).toLocaleString()
    : 'unknown time';
  return (
    `Found incomplete session from ${timeStr}\n` +
    `  Directory: ${candidate.cwd}\n` +
    `  Messages: ${candidate.messageCount}\n` +
    `Resume this session? (y/N)`
  );
}

/**
 * 解析用户对恢复提示的回答。
 *
 * @param answer - 用户输入
 * @returns true 表示恢复，false 表示新会话
 */
export function parseRecoveryAnswer(answer: string): boolean {
  const trimmed = answer.trim().toLowerCase();
  return trimmed === 'y' || trimmed === 'yes';
}
