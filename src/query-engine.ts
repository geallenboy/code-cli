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
import { printToolCall, printToolResult, Spinner } from './ui.js';
import { StreamingMarkdownRenderer } from './markdown.js';
import type { QueryEngineConfig, StreamEvent, Terminal, TokenUsage } from './types.js';
import { saveSession } from './session.js';
import type { ToolContext } from './tools/index.js';
import * as readline from 'node:readline';
import { PermissionDialog } from './ink/components/permission-dialog.js';
import type { RiskLevel } from './ink/components/permission-dialog.js';
import { renderStatusLine, formatTokenCount, formatCost } from './box.js';

/**
 * 在终端中提示用户确认操作。
 * 使用增强版 PermissionDialog，支持防误触延迟和风险等级颜色。
 *
 * @param message - 确认提示消息
 * @returns 用户是否确认（y/Y = 确认）
 */
async function askConfirmation(message: string): Promise<boolean> {
  const dialog = new PermissionDialog();

  // 从消息中推断风险等级
  const riskLevel: RiskLevel = message.includes('Dangerous') ? 'HIGH' : 'MEDIUM';

  // 渲染增强对话框
  const rendered = dialog.renderEnhanced({
    toolName: 'shell',
    riskLevel,
    riskExplanation: message,
    antiMisclickDelay: 200,
  });
  process.stdout.write(rendered + '\n');

  // 等待防误触延迟结束
  const remaining = dialog.getRemainingDelay();
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
    // 刷新选项显示（从 dim 变为正常）
    process.stdout.write('\r' + dialog.renderOptions() + '\n');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Allow? [y/N] ', (answer) => {
      rl.close();
      const choice = dialog.parseChoice(answer);
      resolve(choice === 'yes' || choice === 'always');
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
  private apiCallCount = 0;
  private totalApiTime = 0;
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
    const chatStartTime = performance.now();

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
        maxTurns: this._config.maxTurns ?? 15,
      };

      // Consume the query generator — this is the key dual-layer connection
      const generator = query(params);
      let lastText = '';
      const markdownRenderer = new StreamingMarkdownRenderer();
      const spinner = new Spinner();
      spinner.setMode('requesting');
      spinner.start();
      let firstTextReceived = false;
      let toolCallStartTime = 0;
      let apiCallStartTime = performance.now();

      while (true) {
        const { value, done } = await generator.next();

        if (done) {
          spinner.stop();
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
            if (!firstTextReceived) {
              firstTextReceived = true;
              spinner.setMode('responding');
              spinner.stop();
            }
            spinner.tick();
            const rendered = markdownRenderer.push(event.text);
            if (rendered) process.stdout.write(rendered);
            lastText += event.text;
            break;
          }
          case 'tool_call':
            spinner.stop();
            toolCallStartTime = Date.now();
            printToolCall(event.toolName, event.input);
            // Restart spinner in requesting mode for next API call
            firstTextReceived = false;
            spinner.setMode('requesting');
            spinner.start();
            break;
          case 'tool_result':
            {
              const toolElapsed = toolCallStartTime > 0 ? Date.now() - toolCallStartTime : undefined;
              toolCallStartTime = 0;
              printToolResult(event.toolName, event.result, toolElapsed);
            }
            break;
          case 'usage':
            this.totalInputTokens += event.inputTokens;
            this.totalOutputTokens += event.outputTokens;
            // Track API call timing: each usage event = one API call completed
            {
              const now = performance.now();
              if (apiCallStartTime > 0) {
                this.totalApiTime += now - apiCallStartTime;
              }
              this.apiCallCount++;
              apiCallStartTime = now; // Reset for next API call
            }
            break;
          case 'compact':
            // Could print a notification here
            break;
          case 'error':
            spinner.stop();
            if (!event.recoverable) {
              console.error(`Error: ${event.error.message}`);
            }
            break;
        }
      }
    } finally {
      // Render per-turn status bar
      try {
        const elapsed = ((performance.now() - chatStartTime) / 1000).toFixed(1);
        const totalTokens = this.totalInputTokens + this.totalOutputTokens;
        const tokens = formatTokenCount(totalTokens);
        const cost = formatCost(this.estimateCost());
        const parts = [`${tokens} tokens`, cost, `${elapsed}s`];
        if (this.apiCallCount > 0) {
          const avgApi = (this.totalApiTime / this.apiCallCount / 1000).toFixed(1);
          parts.push(`${avgApi}s avg API`);
        }
        const statusLine = renderStatusLine(parts);
        process.stdout.write('\n' + statusLine + '\n');
      } catch {
        // Status bar is best-effort
      }
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

  /**
   * 流式查询 — 暴露 query() generator 的 StreamEvent 给调用方。
   *
   * 与 chat() 相同的会话管理（消息推送、AbortController、session 保存），
   * 但不消费事件，而是 yield 给调用方（如 Ink UI）。
   *
   * @param userMessage - 用户输入的消息
   * @yields StreamEvent 事件
   * @returns Terminal 终止状态
   */
  async *queryStream(userMessage: string): AsyncGenerator<StreamEvent, Terminal> {
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
        maxTurns: this._config.maxTurns ?? 15,
      };

      const generator = query(params);
      let terminal: Terminal;

      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          terminal = value;
          break;
        }
        // Track usage internally for session stats
        if (value.type === 'usage') {
          this.totalInputTokens += value.inputTokens;
          this.totalOutputTokens += value.outputTokens;
          this.apiCallCount++;
        }
        yield value;
      }

      return terminal;
    } finally {
      try {
        saveSession(this.sessionId, {
          id: this.sessionId,
          startTime: new Date().toISOString(),
          cwd: process.cwd(),
          messages: this._messages,
        });
      } catch {
        // Session save is best-effort
      }
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

  /** 获取 API 计时统计 */
  get apiTimingStats(): { callCount: number; totalTime: number } {
    return {
      callCount: this.apiCallCount,
      totalTime: this.totalApiTime,
    };
  }
}
