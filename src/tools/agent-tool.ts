/**
 * Sub-Agent 工具
 *
 * 允许父 Agent 委派子任务给独立的子 Agent 执行。
 * 子 Agent 拥有独立的上下文窗口和工具集，不继承父 Agent 的对话历史。
 *
 * 参考 Claude Code: src/tools/AgentTool/AgentTool.tsx
 * 简化：2 种内置类型（general / explore），最大 20 轮
 */

import { tool } from 'ai';
import { z } from 'zod';
import { QueryEngine } from '../query-engine.js';
import { getToolDefinitions } from './index.js';
import type { QueryEngineConfig } from '../types.js';

/** 子 Agent 最大轮数 */
const SUB_AGENT_MAX_TURNS = 20;

/**
 * 根据 Agent 类型过滤可用工具列表。
 *
 * - explore: 只读工具（read_file, grep_search, list_files）
 * - general: 排除 agent 工具（防止无限嵌套）
 * - allowedTools: 自定义工具白名单
 *
 * @param type - Agent 类型
 * @param allowedTools - 可选的工具白名单
 * @returns 过滤后的工具名列表
 */
export function filterTools(type: string, allowedTools?: string[]): string[] {
  const allTools = Object.keys(getToolDefinitions());
  if (type === 'explore') {
    return ['read_file', 'grep_search', 'list_files'].filter(t => allTools.includes(t));
  }
  if (allowedTools) {
    return allowedTools.filter(t => allTools.includes(t));
  }
  // General: exclude 'agent' tool to prevent infinite nesting
  return allTools.filter(t => t !== 'agent');
}

/**
 * 创建 agent 工具定义。
 *
 * 子 Agent 使用独立的 QueryEngine 实例，继承父 Agent 的 provider/model 配置，
 * 但拥有独立的消息历史和 token 追踪。
 *
 * @param parentConfig - 父 Agent 的配置
 * @returns AI SDK tool 定义
 */
export function createAgentTool(parentConfig: QueryEngineConfig) {
  return tool({
    description:
      'Delegate a subtask to an independent sub-agent with its own context window. Use for complex subtasks like code exploration or multi-file analysis.',
    inputSchema: z.object({
      task: z
        .string()
        .describe('Self-contained task description with all needed context'),
      type: z
        .enum(['general', 'explore'])
        .default('general')
        .describe(
          'Agent type: general (full tools) or explore (read-only tools only: read_file, grep_search, list_files)',
        ),
    }),
    execute: async ({ task, type }) => {
      try {
        const subConfig: QueryEngineConfig = {
          ...parentConfig,
          maxTurns: SUB_AGENT_MAX_TURNS,
        };
        const subEngine = new QueryEngine(subConfig);

        // Include type info in the task description for the sub-agent
        const taskWithContext =
          type === 'explore'
            ? `[READ-ONLY MODE] You may only use read_file, grep_search, and list_files tools. Do NOT modify any files.\n\n${task}`
            : task;

        await subEngine.chat(taskWithContext);

        // Return the last assistant message as result
        const messages = subEngine.messages;
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
          const content = lastAssistant.content;
          if (typeof content === 'string') return content;
          if (Array.isArray(content)) {
            const textParts = content.filter(
              (p): p is { type: 'text'; text: string } =>
                typeof p === 'object' && p !== null && 'type' in p && p.type === 'text',
            );
            return textParts.map(p => p.text).join('\n') || 'Sub-agent completed but produced no text output.';
          }
        }
        return 'Sub-agent completed but produced no text output.';
      } catch (error) {
        return `Sub-agent error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
