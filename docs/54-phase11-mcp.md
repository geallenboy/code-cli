# Phase 11: MCP 协议支持 (v2.1.0)

> Task 54-55 | 分支: `phase-11/mcp-protocol`

## 概述

实现 Model Context Protocol (MCP) 客户端，让 Agent 能接入外部工具（数据库、API、Kubernetes 等），不再局限于内置工具。

## 新增模块

```
src/mcp/
├── client.ts      # MCP 客户端（stdio transport + JSON-RPC 2.0）
├── config.ts      # 配置加载（~/.xiaomi-code/mcp.json）
├── converter.ts   # MCP tool schema → AI SDK tool() 转换
└── index.ts       # McpManager + 公共 API
```

## 核心实现

### 1. McpClient (`src/mcp/client.ts`)

stdio transport 实现：
- spawn 子进程，通过 stdin/stdout 传输 JSON-RPC 2.0 消息
- `initialize` 握手 + `initialized` 通知
- `tools/list` 工具发现
- `tools/call` 工具执行
- 30s 超时 + 进程崩溃优雅降级
- 按行分割 buffer 解析 JSON-RPC 响应

```typescript
const client = new McpClient('my-server', 'node', ['server.js']);
await client.connect();       // spawn + initialize + tools/list
const tools = client.getTools(); // 获取已发现的工具
const result = await client.callTool('query', { sql: 'SELECT 1' });
client.disconnect();
```

### 2. 配置加载 (`src/mcp/config.ts`)

从 `~/.xiaomi-code/mcp.json` 加载服务器配置：

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "node",
      "args": ["sqlite-server.js"],
      "env": { "DB_PATH": "/data/db.sqlite" },
      "disabled": false
    }
  }
}
```

- 支持多个并发服务器
- `disabled: true` 跳过该服务器
- 配置文件不存在时返回空配置（不报错）

### 3. 工具转换 (`src/mcp/converter.ts`)

MCP tool schema (JSON Schema) → Vercel AI SDK `tool()` 定义：

- `jsonSchemaToZod()`: JSON Schema → Zod schema 递归转换
  - 支持: string, number, boolean, integer, array, object
  - 不支持的类型回退到 `z.unknown()`
  - 处理 required/optional 字段
- `convertMcpTools()`: 批量转换 + 命名空间前缀
  - 工具名格式: `mcp_{serverName}_{toolName}`
  - execute 函数代理到 `client.callTool()`
  - 错误捕获返回 `MCP error: ...`

### 4. McpManager (`src/mcp/index.ts`)

管理多个 MCP 服务器连接的生命周期：

- `initialize()`: 从配置加载并连接所有启用的服务器
- `getAllTools()`: 收集所有服务器的 AI SDK 工具定义
- `getConnectedServers()`: 列出已连接服务器和工具数量
- `disconnectAll()`: 断开所有连接
- 优雅降级：单个服务器失败不影响其他服务器

### 5. CLI 集成

- `--mcp` 启动标志：启用 MCP 工具加载
- `/mcp` 斜杠命令：列出已连接的 MCP 服务器和工具
- MCP 工具通过相同的权限系统检查

## 正确性属性

**P29**: MCP 工具通过与内置工具相同的权限系统

## 测试

37 个新增测试 (`tests/unit/mcp-client.test.ts`)：

| 测试组 | 数量 | 覆盖 |
|--------|------|------|
| McpClient 构造和属性 | 4 | 名称、连接状态、命令参数 |
| JSON-RPC 消息处理 | 6 | 请求格式、响应解析、错误处理 |
| 超时处理 | 3 | 30s 超时、pending 清理 |
| 进程生命周期 | 4 | 退出降级、错误事件 |
| 配置加载 | 6 | 正常加载、文件不存在、disabled 过滤 |
| jsonSchemaToZod | 8 | 各类型转换、嵌套对象、可选字段 |
| convertMcpTools | 3 | 命名空间、execute 代理、错误捕获 |
| McpManager | 3 | 初始化、工具收集、断开连接 |

## 对应 Claude Code 概念

| 本项目 | Claude Code |
|--------|-------------|
| McpClient (stdio) | MCP Client (stdio transport) |
| JSON-RPC 2.0 | JSON-RPC 2.0 protocol |
| mcp.json 配置 | MCP server configuration |
| McpManager | MCP connection manager |
| jsonSchemaToZod | Schema conversion layer |
| mcp_{server}_{tool} 命名 | Namespaced MCP tools |

## 统计

| 指标 | 数值 |
|------|------|
| 新增源文件 | 4 |
| 新增测试 | 37 |
| 总测试数 | 578 |
| check-all | ✅ 通过 |
