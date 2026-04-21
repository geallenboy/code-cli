/**
 * MCP 配置加载
 *
 * 从 ~/.gearcode/mcp.json 加载 MCP 服务器配置。
 * 支持多个并发服务器，每个服务器有独立的 command、args、env。
 *
 * 配置格式：
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "node",
 *       "args": ["server.js"],
 *       "env": { "KEY": "value" },
 *       "disabled": false
 *     }
 *   }
 * }
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** 单个 MCP 服务器配置 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

/** MCP 配置文件结构 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/** 默认配置文件路径 */
const CONFIG_PATH = join(homedir(), '.gearcode', 'mcp.json');

/**
 * 加载 MCP 配置
 *
 * @param configPath - 配置文件路径（默认 ~/.gearcode/mcp.json）
 * @returns MCP 配置对象
 */
export function loadMcpConfig(configPath: string = CONFIG_PATH): McpConfig {
  if (!existsSync(configPath)) return { mcpServers: {} };
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as McpConfig;
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * 获取启用的服务器配置（过滤 disabled）
 *
 * @param config - MCP 配置
 * @returns 启用的服务器名称和配置
 */
export function getEnabledServers(
  config: McpConfig,
): Array<{ name: string; config: McpServerConfig }> {
  return Object.entries(config.mcpServers)
    .filter(([, serverConfig]) => !serverConfig.disabled)
    .map(([name, serverConfig]) => ({ name, config: serverConfig }));
}
