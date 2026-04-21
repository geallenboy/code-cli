/**
 * MCP 客户端单元测试
 *
 * 测试 MCP 模块的核心逻辑：
 * - McpClient 构造和属性
 * - JSON-RPC 消息格式化和解析
 * - 配置加载（mock fs）
 * - 工具 schema 转换（jsonSchemaToZod）
 * - 超时处理
 * - 优雅降级
 * - McpManager 管理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpClient } from '../../src/mcp/client.js';
import { loadMcpConfig, getEnabledServers } from '../../src/mcp/config.js';
import { jsonSchemaToZod, convertMcpTools } from '../../src/mcp/converter.js';
import { McpManager } from '../../src/mcp/index.js';

// ===== McpClient Tests =====

describe('McpClient', () => {
  describe('construction', () => {
    it('should create a client with name, command, args, and env', () => {
      const client = new McpClient('test-server', 'node', ['server.js'], { KEY: 'value' });
      expect(client.name).toBe('test-server');
      expect(client.connected).toBe(false);
    });

    it('should default args and env to empty', () => {
      const client = new McpClient('test', 'echo');
      expect(client.name).toBe('test');
      expect(client.connected).toBe(false);
    });

    it('should be an EventEmitter', () => {
      const client = new McpClient('test', 'echo');
      expect(typeof client.on).toBe('function');
      expect(typeof client.emit).toBe('function');
    });
  });

  describe('disconnect', () => {
    it('should set connected to false after disconnect', () => {
      const client = new McpClient('test', 'echo');
      client.disconnect();
      expect(client.connected).toBe(false);
    });

    it('should return empty tools before connect', () => {
      const client = new McpClient('test', 'echo');
      expect(client.getTools()).toEqual([]);
    });
  });

  describe('handleData — JSON-RPC parsing', () => {
    it('should resolve pending request on valid response', async () => {
      const client = new McpClient('test', 'echo');

      // Manually set up a pending request
      const promise = new Promise((resolve, reject) => {
        (client as unknown as { pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> }).pending.set(1, { resolve, reject });
      });

      // Simulate receiving a response
      client.handleData('{"jsonrpc":"2.0","id":1,"result":{"status":"ok"}}\n');

      const result = await promise;
      expect(result).toEqual({ status: 'ok' });
    });

    it('should reject pending request on error response', async () => {
      const client = new McpClient('test', 'echo');

      const promise = new Promise((resolve, reject) => {
        (client as unknown as { pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> }).pending.set(2, { resolve, reject });
      });

      client.handleData('{"jsonrpc":"2.0","id":2,"error":{"code":-32600,"message":"Invalid Request"}}\n');

      await expect(promise).rejects.toThrow('Invalid Request');
    });

    it('should handle multiple messages in one chunk', async () => {
      const client = new McpClient('test', 'echo');

      const promise1 = new Promise((resolve, reject) => {
        (client as unknown as { pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> }).pending.set(1, { resolve, reject });
      });
      const promise2 = new Promise((resolve, reject) => {
        (client as unknown as { pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> }).pending.set(2, { resolve, reject });
      });

      client.handleData(
        '{"jsonrpc":"2.0","id":1,"result":"first"}\n{"jsonrpc":"2.0","id":2,"result":"second"}\n',
      );

      expect(await promise1).toBe('first');
      expect(await promise2).toBe('second');
    });

    it('should handle partial messages across chunks (buffering)', async () => {
      const client = new McpClient('test', 'echo');

      const promise = new Promise((resolve, reject) => {
        (client as unknown as { pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> }).pending.set(1, { resolve, reject });
      });

      // Send partial data
      client.handleData('{"jsonrpc":"2.0","id":1,');
      // Complete the message
      client.handleData('"result":"buffered"}\n');

      expect(await promise).toBe('buffered');
    });

    it('should ignore malformed JSON lines', () => {
      const client = new McpClient('test', 'echo');
      // Should not throw
      client.handleData('not valid json\n');
      client.handleData('{incomplete\n');
    });

    it('should ignore empty lines', () => {
      const client = new McpClient('test', 'echo');
      // Should not throw
      client.handleData('\n\n\n');
    });

    it('should ignore responses with unknown ids', () => {
      const client = new McpClient('test', 'echo');
      // No pending request for id 999 — should not throw
      client.handleData('{"jsonrpc":"2.0","id":999,"result":"orphan"}\n');
    });
  });

  describe('sendRequest — JSON-RPC formatting', () => {
    it('should format a valid JSON-RPC request with incrementing id', () => {
      const client = new McpClient('test', 'echo');
      const written: string[] = [];

      // Mock the process stdin
      const mockProcess = {
        stdin: {
          write: (data: string) => {
            written.push(data);
            return true;
          },
        },
        kill: vi.fn(),
      };
      (client as unknown as { process: unknown }).process = mockProcess;

      // Send two requests (don't await — they'll timeout, but we can check the format)
      const p1 = client.sendRequest('initialize', { protocolVersion: '2024-11-05' });
      const p2 = client.sendRequest('tools/list', {});

      // Parse the written data
      expect(written).toHaveLength(2);
      const req1 = JSON.parse(written[0].replace('\n', ''));
      const req2 = JSON.parse(written[1].replace('\n', ''));

      expect(req1.jsonrpc).toBe('2.0');
      expect(req1.id).toBe(1);
      expect(req1.method).toBe('initialize');
      expect(req1.params).toEqual({ protocolVersion: '2024-11-05' });

      expect(req2.id).toBe(2);
      expect(req2.method).toBe('tools/list');

      // Resolve the pending requests to avoid unhandled rejections
      client.handleData(`{"jsonrpc":"2.0","id":1,"result":{}}\n{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n`);
      // Wait for promises to settle
      return Promise.allSettled([p1, p2]);
    });
  });

  describe('sendNotification', () => {
    it('should format a notification without id', () => {
      const client = new McpClient('test', 'echo');
      const written: string[] = [];

      const mockProcess = {
        stdin: {
          write: (data: string) => {
            written.push(data);
            return true;
          },
        },
        kill: vi.fn(),
      };
      (client as unknown as { process: unknown }).process = mockProcess;

      client.sendNotification('notifications/initialized', {});

      expect(written).toHaveLength(1);
      const notification = JSON.parse(written[0].replace('\n', ''));
      expect(notification.jsonrpc).toBe('2.0');
      expect(notification.method).toBe('notifications/initialized');
      expect(notification).not.toHaveProperty('id');
    });
  });

  describe('timeout handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should reject with timeout error after 30s', async () => {
      const client = new McpClient('test', 'echo');
      const mockProcess = {
        stdin: { write: vi.fn().mockReturnValue(true) },
        kill: vi.fn(),
      };
      (client as unknown as { process: unknown }).process = mockProcess;

      const promise = client.sendRequest('tools/list', {});

      // Advance time past the 30s timeout
      vi.advanceTimersByTime(30001);

      await expect(promise).rejects.toThrow('MCP request timed out: tools/list');
    });
  });
});

// ===== Config Tests =====

describe('MCP Config', () => {
  describe('loadMcpConfig', () => {
    it('should return empty config when file does not exist', () => {
      const config = loadMcpConfig('/nonexistent/path/mcp.json');
      expect(config).toEqual({ mcpServers: {} });
    });

    it('should return empty config for invalid JSON', () => {
      // Use a path that exists but isn't valid JSON
      const config = loadMcpConfig('/dev/null');
      expect(config).toEqual({ mcpServers: {} });
    });
  });

  describe('getEnabledServers', () => {
    it('should return all servers when none are disabled', () => {
      const config = {
        mcpServers: {
          'server-a': { command: 'node', args: ['a.js'] },
          'server-b': { command: 'python', args: ['b.py'] },
        },
      };
      const servers = getEnabledServers(config);
      expect(servers).toHaveLength(2);
      expect(servers[0].name).toBe('server-a');
      expect(servers[1].name).toBe('server-b');
    });

    it('should filter out disabled servers', () => {
      const config = {
        mcpServers: {
          'server-a': { command: 'node', disabled: false },
          'server-b': { command: 'python', disabled: true },
          'server-c': { command: 'ruby' },
        },
      };
      const servers = getEnabledServers(config);
      expect(servers).toHaveLength(2);
      expect(servers.map((s) => s.name)).toEqual(['server-a', 'server-c']);
    });

    it('should return empty array for empty config', () => {
      const config = { mcpServers: {} };
      expect(getEnabledServers(config)).toEqual([]);
    });
  });
});

// ===== Converter Tests =====

describe('MCP Converter', () => {
  describe('jsonSchemaToZod', () => {
    it('should convert string type', () => {
      const schema = jsonSchemaToZod({ type: 'string' });
      expect(schema.safeParse('hello').success).toBe(true);
      expect(schema.safeParse(123).success).toBe(false);
    });

    it('should convert number type', () => {
      const schema = jsonSchemaToZod({ type: 'number' });
      expect(schema.safeParse(42).success).toBe(true);
      expect(schema.safeParse('hello').success).toBe(false);
    });

    it('should convert integer type as number', () => {
      const schema = jsonSchemaToZod({ type: 'integer' });
      expect(schema.safeParse(42).success).toBe(true);
    });

    it('should convert boolean type', () => {
      const schema = jsonSchemaToZod({ type: 'boolean' });
      expect(schema.safeParse(true).success).toBe(true);
      expect(schema.safeParse('true').success).toBe(false);
    });

    it('should convert array type', () => {
      const schema = jsonSchemaToZod({ type: 'array', items: { type: 'string' } });
      expect(schema.safeParse(['a', 'b']).success).toBe(true);
      expect(schema.safeParse('not-array').success).toBe(false);
    });

    it('should convert object type with properties', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      });

      expect(schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
      expect(schema.safeParse({ name: 'Bob' }).success).toBe(true);
      // Missing required field
      expect(schema.safeParse({ age: 30 }).success).toBe(false);
    });

    it('should handle object with no required fields', () => {
      const schema = jsonSchemaToZod({
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      });
      // All fields optional
      expect(schema.safeParse({}).success).toBe(true);
    });

    it('should return z.unknown() for unsupported types', () => {
      const schema = jsonSchemaToZod({ type: 'null' });
      // z.unknown() accepts anything
      expect(schema.safeParse(null).success).toBe(true);
      expect(schema.safeParse('anything').success).toBe(true);
    });

    it('should preserve descriptions', () => {
      const schema = jsonSchemaToZod({ type: 'string', description: 'A name' });
      expect(schema.description).toBe('A name');
    });
  });

  describe('convertMcpTools', () => {
    it('should convert MCP tools to AI SDK tool definitions', () => {
      const mockClient = {
        name: 'test-server',
        getTools: () => [
          {
            name: 'query',
            description: 'Run a database query',
            inputSchema: {
              type: 'object',
              properties: {
                sql: { type: 'string' },
              },
              required: ['sql'],
            },
          },
        ],
        callTool: vi.fn().mockResolvedValue('result'),
      } as unknown as McpClient;

      const tools = convertMcpTools(mockClient);

      expect(Object.keys(tools)).toEqual(['mcp_test-server_query']);
      const queryTool = tools['mcp_test-server_query'];
      expect(queryTool.description).toBe('Run a database query');
      expect(typeof queryTool.execute).toBe('function');
    });

    it('should prefix tool names with mcp_{serverName}_{toolName}', () => {
      const mockClient = {
        name: 'my-db',
        getTools: () => [
          { name: 'select', description: 'Select', inputSchema: { type: 'object', properties: {} } },
          { name: 'insert', description: 'Insert', inputSchema: { type: 'object', properties: {} } },
        ],
        callTool: vi.fn(),
      } as unknown as McpClient;

      const tools = convertMcpTools(mockClient);
      expect(Object.keys(tools)).toEqual(['mcp_my-db_select', 'mcp_my-db_insert']);
    });

    it('should use tool name as description when description is missing', () => {
      const mockClient = {
        name: 'srv',
        getTools: () => [
          { name: 'ping', inputSchema: { type: 'object', properties: {} } },
        ],
        callTool: vi.fn(),
      } as unknown as McpClient;

      const tools = convertMcpTools(mockClient);
      expect(tools['mcp_srv_ping'].description).toBe('ping');
    });

    it('should return empty object when no tools', () => {
      const mockClient = {
        name: 'empty',
        getTools: () => [],
        callTool: vi.fn(),
      } as unknown as McpClient;

      const tools = convertMcpTools(mockClient);
      expect(Object.keys(tools)).toHaveLength(0);
    });

    it('should handle MCP callTool errors gracefully in execute', async () => {
      const mockClient = {
        name: 'err',
        getTools: () => [
          {
            name: 'fail',
            description: 'Fails',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        callTool: vi.fn().mockRejectedValue(new Error('Connection lost')),
      } as unknown as McpClient;

      const tools = convertMcpTools(mockClient);
      const result = await tools['mcp_err_fail'].execute!({}, { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal });
      expect(result).toBe('MCP error: Connection lost');
    });
  });
});

// ===== McpManager Tests =====

describe('McpManager', () => {
  it('should start with no connected servers', () => {
    const manager = new McpManager();
    expect(manager.size).toBe(0);
    expect(manager.getConnectedServers()).toEqual([]);
  });

  it('should return empty tools when no servers connected', () => {
    const manager = new McpManager();
    expect(manager.getAllTools()).toEqual({});
  });

  it('should disconnect all servers', () => {
    const manager = new McpManager();
    // Should not throw even with no servers
    manager.disconnectAll();
    expect(manager.size).toBe(0);
  });
});
