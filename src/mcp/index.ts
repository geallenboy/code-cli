/**
 * MCP 模块入口
 *
 * 导出 MCP 客户端、配置加载和工具转换功能。
 * 提供 MCP 管理器用于管理多个并发 MCP 服务器连接。
 */

export { McpClient } from './client.js';
export type { McpToolSchema, JsonRpcRequest, JsonRpcResponse } from './client.js';
export { loadMcpConfig, getEnabledServers } from './config.js';
export type { McpServerConfig, McpConfig } from './config.js';
export { convertMcpTools, jsonSchemaToZod } from './converter.js';

import { McpClient } from './client.js';
import { loadMcpConfig, getEnabledServers } from './config.js';
import { convertMcpTools } from './converter.js';
import type { Tool } from 'ai';

/**
 * MCP 管理器
 *
 * 管理多个 MCP 服务器连接的生命周期：
 * - 从配置文件加载并连接所有启用的服务器
 * - 收集所有服务器的工具定义
 * - 优雅降级：单个服务器失败不影响其他服务器
 */
export class McpManager {
  private clients: Map<string, McpClient> = new Map();

  /** 从配置文件初始化所有 MCP 服务器连接 */
  async initialize(): Promise<void> {
    const config = loadMcpConfig();
    const servers = getEnabledServers(config);

    for (const server of servers) {
      try {
        const client = new McpClient(
          server.name,
          server.config.command,
          server.config.args ?? [],
          server.config.env ?? {},
        );
        await client.connect();
        this.clients.set(server.name, client);

        // 监听断开事件，自动移除
        client.on('disconnected', () => {
          this.clients.delete(server.name);
        });
      } catch {
        // 优雅降级：单个服务器连接失败不影响其他服务器
        // 错误已在 connect() 中处理
      }
    }
  }

  /** 获取所有已连接服务器的 AI SDK 工具定义 */
  getAllTools(): Record<string, Tool> {
    const allTools: Record<string, Tool> = {};
    for (const client of this.clients.values()) {
      const tools = convertMcpTools(client);
      Object.assign(allTools, tools);
    }
    return allTools;
  }

  /** 获取已连接的服务器列表 */
  getConnectedServers(): Array<{ name: string; toolCount: number }> {
    return Array.from(this.clients.entries()).map(([name, client]) => ({
      name,
      toolCount: client.getTools().length,
    }));
  }

  /** 断开所有服务器 */
  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }

  /** 获取已连接的客户端数量 */
  get size(): number {
    return this.clients.size;
  }
}
