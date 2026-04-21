/**
 * MCP → AI SDK 工具转换器
 *
 * 将 MCP 工具 schema（JSON Schema）转换为 Vercel AI SDK tool() 定义。
 * 工具名称前缀 mcp_{serverName}_{toolName} 避免与内置工具冲突。
 *
 * 参考 Claude Code: MCP tool conversion
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { McpClient } from './client.js';

/**
 * 将 JSON Schema 转换为 Zod schema（简化版）
 *
 * 支持的类型：string, number, boolean, integer, array, object
 * 不支持的类型回退到 z.unknown()
 *
 * @param schema - JSON Schema 对象
 * @returns 对应的 Zod schema
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  const type = schema.type as string;

  if (type === 'string') {
    let s = z.string();
    if (schema.description) s = s.describe(schema.description as string);
    return s;
  }
  if (type === 'number' || type === 'integer') {
    let n = z.number();
    if (schema.description) n = n.describe(schema.description as string);
    return n;
  }
  if (type === 'boolean') {
    let b = z.boolean();
    if (schema.description) b = b.describe(schema.description as string);
    return b;
  }
  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    const itemSchema = items ? jsonSchemaToZod(items) : z.unknown();
    return z.array(itemSchema);
  }
  if (type === 'object' && schema.properties) {
    const shape: Record<string, z.ZodType> = {};
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const required = (schema.required as string[]) ?? [];
    for (const [key, propSchema] of Object.entries(props)) {
      const zodType = jsonSchemaToZod(propSchema);
      shape[key] = required.includes(key) ? zodType : zodType.optional();
    }
    return z.object(shape);
  }

  return z.unknown();
}

/**
 * 将 MCP 客户端的工具转换为 AI SDK tool 定义
 *
 * 工具名称格式：mcp_{serverName}_{toolName}
 * 每个工具的 execute 函数调用 MCP 客户端的 callTool 方法。
 *
 * @param client - MCP 客户端实例
 * @returns AI SDK 工具定义映射
 */
export function convertMcpTools(client: McpClient): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const mcpTool of client.getTools()) {
    const zodSchema = jsonSchemaToZod(mcpTool.inputSchema);
    const toolName = `mcp_${client.name}_${mcpTool.name}`;

    // Use tool() with a concrete z.object schema for proper AI SDK typing
    // For MCP tools, we build a z.object with a passthrough to accept any shape
    const inputSchema = zodSchema instanceof z.ZodObject
      ? zodSchema
      : z.object({});

    tools[toolName] = tool({
      description: mcpTool.description ?? mcpTool.name,
      inputSchema,
      execute: async (args: Record<string, unknown>) => {
        try {
          return await client.callTool(mcpTool.name, args);
        } catch (e) {
          return `MCP error: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    });
  }

  return tools;
}
