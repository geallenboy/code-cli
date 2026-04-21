/**
 * Swarm Agent
 *
 * Swarm 中的独立 Agent 实例：
 * - 独立上下文窗口
 * - 独立工具集
 * - 通过 Mailbox 与其他 Agent 通信
 * - 完成时通知 coordinator
 *
 * 参考 Claude Code: Swarm Agent with mailbox communication
 */

import { QueryEngine } from '../query-engine.js';
import type { QueryEngineConfig } from '../types.js';
import type { Mailbox } from './mailbox.js';

/** Swarm Agent 配置 */
export interface SwarmAgentConfig extends QueryEngineConfig {
  /** Agent 名称（唯一标识） */
  name: string;
  /** Agent 角色描述 */
  role?: string;
  /** 允许使用的工具列表（空 = 全部） */
  allowedTools?: string[];
}

/** Swarm Agent 状态 */
export interface SwarmAgentStatus {
  /** Agent 名称 */
  name: string;
  /** 当前状态 */
  state: 'idle' | 'running' | 'completed' | 'failed';
  /** 执行结果 */
  result?: string;
  /** 错误信息 */
  error?: string;
  /** 已处理的消息数 */
  messagesProcessed: number;
}

/**
 * Swarm Agent — 独立的协作 Agent
 *
 * 每个 Swarm Agent 拥有：
 * - 独立的 QueryEngine（独立上下文窗口）
 * - 独立的消息队列（通过 Mailbox）
 * - 独立的工具集
 *
 * Agent 间通过 Mailbox 通信，消息不跨 Agent 泄露（P31）。
 */
export class SwarmAgent {
  private readonly config: SwarmAgentConfig;
  private readonly mailbox: Mailbox;
  private engine: QueryEngine | null = null;
  private _state: SwarmAgentStatus['state'] = 'idle';
  private _result?: string;
  private _error?: string;
  private _messagesProcessed = 0;

  constructor(config: SwarmAgentConfig, mailbox: Mailbox) {
    this.config = config;
    this.mailbox = mailbox;

    // 注册到邮箱
    this.mailbox.register(config.name);
  }

  /** Agent 名称 */
  get name(): string {
    return this.config.name;
  }

  /** 当前状态 */
  get state(): SwarmAgentStatus['state'] {
    return this._state;
  }

  /** 获取状态信息 */
  getStatus(): SwarmAgentStatus {
    return {
      name: this.config.name,
      state: this._state,
      result: this._result,
      error: this._error,
      messagesProcessed: this._messagesProcessed,
    };
  }

  /**
   * 发送消息给另一个 Agent
   *
   * @param to - 目标 Agent 名称
   * @param content - 消息内容
   * @returns 消息 ID
   */
  send(to: string, content: string): string {
    return this.mailbox.send(this.config.name, to, content);
  }

  /**
   * 接收消息
   *
   * @param timeout - 超时时间（ms）
   * @returns 消息，超时返回 null
   */
  async receive(timeout?: number) {
    const msg = await this.mailbox.receive(this.config.name, timeout);
    if (msg) this._messagesProcessed++;
    return msg;
  }

  /**
   * 执行任务
   *
   * 创建独立的 QueryEngine 执行任务。
   * 完成后通过 Mailbox 通知 coordinator。
   *
   * @param task - 任务描述
   * @param coordinatorName - coordinator Agent 名称（完成后通知）
   */
  async execute(task: string, coordinatorName?: string): Promise<string> {
    this._state = 'running';

    try {
      const subConfig: QueryEngineConfig = {
        ...this.config,
        maxTurns: 20,
      };
      this.engine = new QueryEngine(subConfig);

      // 构建带角色的提示
      const rolePrefix = this.config.role
        ? `You are ${this.config.role}.\n\n`
        : '';
      const prompt = `${rolePrefix}${task}`;

      await this.engine.chat(prompt);

      // 提取结果
      const messages = this.engine.messages;
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      let result = 'Task completed but produced no text output.';

      if (lastAssistant) {
        const content = lastAssistant.content;
        if (typeof content === 'string') {
          result = content;
        } else if (Array.isArray(content)) {
          const textParts = content.filter(
            (p): p is { type: 'text'; text: string } =>
              typeof p === 'object' && p !== null && 'type' in p && p.type === 'text',
          );
          result = textParts.map(p => p.text).join('\n') || result;
        }
      }

      this._result = result;
      this._state = 'completed';

      // 通知 coordinator
      if (coordinatorName) {
        try {
          this.mailbox.send(
            this.config.name,
            coordinatorName,
            `Task completed by ${this.config.name}: ${result.slice(0, 500)}`,
          );
        } catch {
          // coordinator 可能已注销
        }
      }

      return result;
    } catch (error) {
      this._state = 'failed';
      this._error = error instanceof Error ? error.message : String(error);

      // 通知 coordinator 失败
      if (coordinatorName) {
        try {
          this.mailbox.send(
            this.config.name,
            coordinatorName,
            `Task failed by ${this.config.name}: ${this._error}`,
          );
        } catch {
          // coordinator 可能已注销
        }
      }

      throw error;
    }
  }

  /** 清理资源 */
  cleanup(): void {
    this.mailbox.unregister(this.config.name);
    this.engine = null;
  }
}
