/**
 * MCP (Model Context Protocol) 客户端
 *
 * 通过 stdio transport 与 MCP 服务器通信：
 * - spawn 子进程，stdin/stdout 传输 JSON-RPC 2.0 消息
 * - initialize 握手 + initialized 通知
 * - tools/list 工具发现
 * - tools/call 工具执行
 * - 30s 超时 + 崩溃优雅降级
 *
 * 参考 Claude Code: MCP 客户端实现
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

/** JSON-RPC 2.0 请求 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 响应 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/** MCP 工具 schema */
export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** MCP 工具调用结果内容项 */
interface McpToolContent {
  type: string;
  text?: string;
}

/**
 * MCP 客户端
 *
 * 管理与单个 MCP 服务器的连接生命周期：
 * connect → initialize → tools/list → callTool → disconnect
 */
export class McpClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = '';
  private tools: McpToolSchema[] = [];
  private _connected = false;

  constructor(
    private readonly _name: string,
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env: Record<string, string> = {},
  ) {
    super();
  }

  /** 服务器名称 */
  get name(): string {
    return this._name;
  }

  /** 是否已连接 */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * 连接到 MCP 服务器：spawn 子进程 + initialize 握手
   *
   * 流程：
   * 1. spawn 子进程（stdio transport）
   * 2. 发送 initialize 请求
   * 3. 发送 initialized 通知
   * 4. 发送 tools/list 发现可用工具
   */
  async connect(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    this.process.stdout?.on('data', (chunk: Buffer) => this.handleData(chunk.toString()));
    this.process.stderr?.on('data', (_chunk: Buffer) => {
      // MCP server stderr — logged but not processed as JSON-RPC
    });
    this.process.on('exit', () => {
      this._connected = false;
      this.rejectAllPending(new Error('MCP server process exited'));
      this.emit('disconnected');
    });
    this.process.on('error', (err: Error) => {
      this._connected = false;
      this.rejectAllPending(err);
      this.emit('error', err);
    });

    // Initialize handshake
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'xiaomi-code', version: '2.0.0' },
    });

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});

    // Discover tools
    const toolsResult = (await this.sendRequest('tools/list', {})) as {
      tools: McpToolSchema[];
    };
    this.tools = toolsResult.tools ?? [];
    this._connected = true;
  }

  /**
   * 执行工具调用
   *
   * @param name - 工具名称
   * @param args - 工具参数
   * @returns 工具执行结果文本
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as { content: McpToolContent[] };
    return result.content?.map((c) => c.text ?? '').join('\n') ?? '';
  }

  /** 获取已发现的工具列表 */
  getTools(): McpToolSchema[] {
    return this.tools;
  }

  /** 断开连接 */
  disconnect(): void {
    this.process?.kill();
    this.process = null;
    this._connected = false;
  }

  /**
   * 发送 JSON-RPC 请求（带 30s 超时）
   */
  sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, 30000);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });

      this.process?.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * 发送 JSON-RPC 通知（无 id，无响应）
   */
  sendNotification(method: string, params: Record<string, unknown>): void {
    const notification = { jsonrpc: '2.0', method, params };
    this.process?.stdin?.write(JSON.stringify(notification) + '\n');
  }

  /**
   * 处理从 stdout 接收的数据
   *
   * 按行分割，解析 JSON-RPC 响应，匹配 pending 请求。
   */
  handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id && this.pending.has(msg.id)) {
          const entry = this.pending.get(msg.id);
          if (!entry) continue;
          const { resolve, reject } = entry;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {
        /* ignore malformed JSON */
      }
    }
  }

  /** 拒绝所有 pending 请求（进程退出时） */
  private rejectAllPending(error: Error): void {
    for (const [id, { reject }] of this.pending) {
      reject(error);
      this.pending.delete(id);
    }
  }
}
