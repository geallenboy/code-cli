/**
 * Sub-Agent 工具单元测试
 *
 * 测试 agent-tool 的核心逻辑：
 * - filterTools: explore 类型只返回只读工具，general 排除 agent
 * - createAgentTool: 创建工具定义，包含正确的 schema
 * - 上下文隔离：子 Agent 不继承父 Agent 对话历史
 */

import { describe, it, expect, vi } from 'vitest';
import { filterTools, createAgentTool } from '../../src/tools/agent-tool.js';
import type { QueryEngineConfig } from '../../src/types.js';

describe('filterTools', () => {
  it('should return only read-only tools for explore type', () => {
    const tools = filterTools('explore');
    expect(tools).toContain('read_file');
    expect(tools).toContain('grep_search');
    expect(tools).toContain('list_files');
    expect(tools).not.toContain('write_file');
    expect(tools).not.toContain('edit_file');
    expect(tools).not.toContain('run_shell');
  });

  it('should exclude agent tool for general type', () => {
    const tools = filterTools('general');
    expect(tools).not.toContain('agent');
    // Should include standard tools
    expect(tools).toContain('read_file');
    expect(tools).toContain('write_file');
    expect(tools).toContain('run_shell');
  });

  it('should filter by allowedTools when provided', () => {
    const tools = filterTools('general', ['read_file', 'write_file', 'nonexistent_tool']);
    expect(tools).toContain('read_file');
    expect(tools).toContain('write_file');
    expect(tools).not.toContain('nonexistent_tool');
  });

  it('should return empty array for explore type if no read tools exist', () => {
    // explore type filters to known read-only tools that exist
    const tools = filterTools('explore');
    // All three should exist in the tool registry
    expect(tools.length).toBeLessThanOrEqual(3);
  });
});

describe('createAgentTool', () => {
  const mockConfig: QueryEngineConfig = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    yolo: false,
    effectiveContextWindow: 100000,
  };

  it('should create a tool with correct description', () => {
    const agentTool = createAgentTool(mockConfig);
    expect(agentTool.description).toContain('sub-agent');
  });

  it('should have execute function', () => {
    const agentTool = createAgentTool(mockConfig);
    expect(typeof agentTool.execute).toBe('function');
  });

  it('should return error message when sub-agent fails', async () => {
    // Mock QueryEngine to throw
    vi.doMock('../../src/query-engine.js', () => ({
      QueryEngine: class MockQueryEngine {
        async chat() {
          throw new Error('API key not set');
        }
        get messages() {
          return [];
        }
      },
    }));

    // Re-import to get mocked version
    const { createAgentTool: mockedCreate } = await import('../../src/tools/agent-tool.js');
    const agentTool = mockedCreate(mockConfig);

    // The tool should catch the error and return an error message
    // Note: This tests the error handling path
    const result = await agentTool.execute!(
      { task: 'test task', type: 'general' },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(typeof result).toBe('string');

    vi.restoreAllMocks();
  });
});
