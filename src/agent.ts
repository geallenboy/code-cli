/**
 * Agent Loop 核心
 *
 * 实现"思考 → 调用工具 → 观察结果"的自主循环。
 * 这是整个系统的灵魂，驱动模型与工具之间的交互。
 *
 * 参考 Claude Code: src/query.ts + src/QueryEngine.ts
 * 简化：单层 while(true) 循环代替双层 Generator 架构
 */

import type { AgentConfig, TokenUsage } from './types.js';

/**
 * Agent 核心类
 *
 * 管理对话历史、token 追踪和 Agent Loop 执行。
 */
export class Agent {
  private _messages: unknown[] = [];
  private abortController: AbortController | null = null;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private _confirmedCommands: Set<string> = new Set();
  private _isProcessing = false;
  private readonly _config: AgentConfig;

  constructor(config: AgentConfig) {
    this._config = config;
  }

  /** 处理用户输入，进入 Agent Loop */
  async chat(_userMessage: string): Promise<void> {
    // TODO: Phase 1 — 实现 Agent Loop
    throw new Error('Not implemented');
  }

  /** 中止当前操作 */
  abort(): void {
    this.abortController?.abort();
  }

  /** 清空对话历史 */
  clearHistory(): void {
    this._messages = [];
  }

  /** 手动触发压缩 */
  async compact(): Promise<void> {
    // TODO: Phase 2 — 实现上下文压缩
    throw new Error('Not implemented');
  }

  /** 显示 token 使用量和成本 */
  showCost(): void {
    // TODO: Phase 3 — 实现成本显示
    throw new Error('Not implemented');
  }

  /** 当前是否正在处理 */
  get isProcessing(): boolean {
    return this._isProcessing;
  }

  /** 获取 Agent 配置 */
  get config(): AgentConfig {
    return this._config;
  }

  /** 获取消息历史 */
  get messages(): unknown[] {
    return this._messages;
  }

  /** 获取已确认的命令集合 */
  get confirmedCommands(): Set<string> {
    return this._confirmedCommands;
  }

  /** 获取 token 使用量 */
  get tokenUsage(): TokenUsage {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
    };
  }
}
