/**
 * QueryEngine — 外层会话管理器
 *
 * 从 agent.ts 拆分的会话层，管理消息持久化、token 累计、
 * 预算检查和用户输入处理。通过 async generator 连接 query() 循环层。
 *
 * 参考 Claude Code: src/QueryEngine.ts (1,295 行)
 * 简化：直接消费 query() generator，无中间事件总线
 */

import type { ModelMessage } from 'ai';
import type { LanguageModel } from 'ai';
import { createModel } from './provider.js';
import { query, type QueryParams } from './query.js';
import { printToolCall, printToolResult } from './ui.js';
import { StreamingMarkdownRenderer } from './markdown.js';
import type { QueryEngineConfig, StreamEvent, TokenUsage } from './types.js';
import { saveSession } from './session.js';
import type { ToolContext } from './tools/index.js';
import * as readline from 'node:readline';

/**
 * 在终端中提示用户确认操作。
 * @param message - 确认提示消息
 * @returns 用户是否确认（y/Y = 确认）
 */
async function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message}\nAllow? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * QueryEngine — 会话生命周期管理器
 *
 * 管理对话历史、token 追踪、预算检查，
 * 通过消费 query() async generator 驱动内层循环。
 */
export class QueryEngine {
  private _messages: ModelMessage[] = [];
  private abortController: AbortController | null = null;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private _confirmedCommands: Set<string> = new Set();
  private _isProcessing = false;
  private readonly _config: QueryEngineConfig;
  private readonly modelInstance: LanguageModel;
  private readonly sessionId: string;

  constructor(config: QueryEngineConfig) {
    this._config = config;
    this.modelInstance = createModel(config.provider, config.model);
    this.sessionId = `session-${Date.now()}`;
  }

  /**
   * 处理用户输入，消费 query() generator 驱动内层循环。
   *
   * 核心流程：push user message → 构建参数 → 消费 generator →
   * 处理 StreamEvent → 累计 token → 保存会话
   *
   * @param userMessage - 用户输入的消息
   */
  async chat(userMessage: string): Promise<void> {
    this._isProcessing = true;
    this.abortController = new AbortController();

    try {
      this._messages.push({ role: 'user', content: userMessage });

      const toolCtx: ToolContext = {
        yolo: this._config.yolo,
        confirm: askConfirmation,
        confirmedCommands: this._confirmedCommands,
      };

      const params: QueryParams = {
        model: this.modelInstance,
        messages: this._messages,
        toolContext: toolCtx,
        effectiveContextWindow: this._config.effectiveContextWindow,
        abortSignal: this.abortController.signal,
        maxTurns: this._config.maxTurns ?? 50,
      };

      // Consume the query generator — this is the key dual-layer connection
      const generator = query(params);
      let lastText = '';
      const markdownRenderer = new StreamingMarkdownRenderer();

      while (true) {
        const { value, done } = await generator.next();

        if (done) {
          // value is Terminal
          if (lastText) {
            const remaining = markdownRenderer.flush();
            if (remaining) process.stdout.write(remaining);
            process.stdout.write('\n');
          }
          break;
        }

        // value is StreamEvent
        const event: StreamEvent = value;
        switch (event.type) {
          case 'text': {
            const rendered = markdownRenderer.push(event.text);
            if (rendered) process.stdout.write(rendered);
            lastText += event.text;
            break;
          }
          case 'tool_call':
            printToolCall(event.toolName, event.input);
            break;
          case 'tool_result':
            printToolResult(event.toolName, event.result);
            break;
          case 'usage':
            this.totalInputTokens += event.inputTokens;
            this.totalOutputTokens += event.outputTokens;
            break;
          case 'compact':
            // Could print a notification here
            break;
          case 'error':
            if (!event.recoverable) {
              console.error(`Error: ${event.error.message}`);
            }
            break;
        }
      }
    } finally {
      saveSession(this.sessionId, {
        id: this.sessionId,
        startTime: new Date().toISOString(),
        cwd: process.cwd(),
        messages: this._messages,
      });
      this._isProcessing = false;
      this.abortController = null;
    }
  }

  /** 估算当前会话成本（USD） */
  private estimateCost(): number {
    return (this.totalInputTokens / 1_000_000) * 3 + (this.totalOutputTokens / 1_000_000) * 15;
  }

  /** 中止当前操作 */
  abort(): void {
    this.abortController?.abort();
  }

  /** 清空对话历史 */
  clearHistory(): void {
    this._messages = [];
  }

  /** 恢复消息历史（用于会话恢复） */
  restoreMessages(messages: ModelMessage[]): void {
    this._messages = messages;
  }

  /** 手动触发压缩 */
  async compact(): Promise<void> {
    const { autoCompact } = await import('./compactor/auto.js');
    const result = await autoCompact(this._messages, this.modelInstance, 0);
    if (!result.failed) {
      this._messages = result.messages;
    }
  }

  /** 当前是否正在处理 */
  get isProcessing(): boolean {
    return this._isProcessing;
  }

  /** 获取配置 */
  get config(): QueryEngineConfig {
    return this._config;
  }

  /** 获取消息历史 */
  get messages(): ModelMessage[] {
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
