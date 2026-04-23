/**
 * Agent — 向后兼容包装器
 *
 * v2 中实际逻辑在 QueryEngine + query() 中。
 * 此文件保留以兼容现有测试和 CLI。
 *
 * 参考 Claude Code: src/QueryEngine.ts + src/query.ts
 */

import { QueryEngine } from './query-engine.js';
import type { AgentConfig, StreamEvent, Terminal, TokenUsage, QueryEngineConfig } from './types.js';
import type { ModelMessage } from 'ai';

// Re-export from query.ts for backward compatibility
export { isRetryableError, withRetry } from './query.js';

/**
 * Agent 核心类 — 向后兼容包装器
 *
 * 委托所有操作给 QueryEngine，保持与 v1 相同的公共 API。
 */
export class Agent {
  private engine: QueryEngine;

  constructor(config: AgentConfig) {
    const engineConfig: QueryEngineConfig = { ...config, maxTurns: 15 };
    this.engine = new QueryEngine(engineConfig);
  }

  /** 处理用户输入 */
  async chat(userMessage: string): Promise<void> {
    return this.engine.chat(userMessage);
  }

  /** 流式查询 — 暴露 StreamEvent generator 给调用方 */
  async *queryStream(userMessage: string): AsyncGenerator<StreamEvent, Terminal> {
    return yield* this.engine.queryStream(userMessage);
  }

  /** 中止当前操作 */
  abort(): void {
    this.engine.abort();
  }

  /** 清空对话历史 */
  clearHistory(): void {
    this.engine.clearHistory();
  }

  /** 恢复消息历史（用于会话恢复） */
  restoreMessages(messages: ModelMessage[]): void {
    this.engine.restoreMessages(messages);
  }

  /** 手动触发压缩 */
  async compact(): Promise<void> {
    return this.engine.compact();
  }

  /** 当前是否正在处理 */
  get isProcessing(): boolean {
    return this.engine.isProcessing;
  }

  /** 获取 Agent 配置（返回 AgentConfig，不含 QueryEngine 扩展字段） */
  get config(): AgentConfig {
    const { provider, model, yolo, effectiveContextWindow } = this.engine.config;
    return { provider, model, yolo, effectiveContextWindow };
  }

  /** 获取消息历史 */
  get messages(): ModelMessage[] {
    return this.engine.messages;
  }

  /** 获取已确认的命令集合 */
  get confirmedCommands(): Set<string> {
    return this.engine.confirmedCommands;
  }

  /** 获取 token 使用量 */
  get tokenUsage(): TokenUsage {
    return this.engine.tokenUsage;
  }

  /** 获取 API 计时统计 */
  get apiTimingStats(): { callCount: number; totalTime: number } {
    return this.engine.apiTimingStats;
  }
}
