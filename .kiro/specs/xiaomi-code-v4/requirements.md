# 需求文档：Xiaomi Code v4 — Phase 11-15（80% → 90%+ 特性覆盖）

## 简介

v2.0.0 已覆盖 Claude Code ~80% 特性（541 测试、10 Phase、53 Task）。v4（Phase 11-15）实现 5 个高级特性，目标达到 90%+ 特性覆盖。

| Phase | 分支 | 目标 | 预估 |
|-------|------|------|------|
| 11 | `phase-11/mcp-protocol` | MCP 协议支持（接入外部工具） | 1.5 周 |
| 12 | `phase-12/coordinator-swarm` | Coordinator + Swarm 多 Agent 模式 | 1.5 周 |
| 13 | `phase-13/tree-sitter-ast` | tree-sitter Bash AST（替代简化解析器） | 1 周 |
| 14 | `phase-14/react-ink-ui` | React + Ink 终端 UI（替代 chalk） | 1.5 周 |
| 15 | `phase-15/extended-thinking` | Extended Thinking 支持 | 1 周 |

---

## Phase 11: MCP 协议支持

### 需求 28：MCP 客户端实现

**用户故事：** 作为用户，我希望能通过 MCP（Model Context Protocol）接入外部工具（数据库、API、Kubernetes 等），让 Agent 的能力不局限于内置工具。

#### 验收标准

1. THE MCP_Client SHALL support the stdio transport type: spawning a subprocess and communicating via stdin/stdout JSON-RPC
2. THE MCP_Client SHALL implement the MCP initialization handshake: `initialize` request → `initialized` notification
3. THE MCP_Client SHALL discover available tools from the MCP server via `tools/list` request
4. THE MCP_Client SHALL convert MCP tool schemas to Vercel AI SDK tool definitions automatically
5. THE MCP_Client SHALL execute MCP tool calls by sending `tools/call` requests to the server
6. THE MCP_Client SHALL load MCP server configurations from `~/.xiaomi-code/mcp.json`
7. THE MCP_Client SHALL support multiple concurrent MCP servers
8. WHEN an MCP server crashes or times out (30s), THE MCP_Client SHALL gracefully degrade by removing that server's tools without affecting other tools
9. MCP tools SHALL go through the same permission system as built-in tools
10. THE CLI SHALL support a `--mcp` flag to enable MCP tool loading at startup

### 需求 29：MCP 配置管理

#### 验收标准

1. THE MCP configuration file SHALL follow the format: `{ "mcpServers": { "name": { "command": "...", "args": [...], "env": {...} } } }`
2. THE CLI SHALL support a `/mcp` command to list connected MCP servers and their available tools
3. WHEN an MCP server is added or removed from the config, THE system SHALL reconnect without restarting

---

## Phase 12: Coordinator/Swarm 多 Agent 模式

### 需求 30：Coordinator 模式

**用户故事：** 作为用户，我希望 Agent 能作为纯指挥官分配任务给多个子 Agent，自己不直接执行代码操作，以便处理大型跨文件重构任务。

#### 验收标准

1. THE Coordinator SHALL be a special Agent mode that can ONLY assign tasks to sub-agents, NOT directly use file/shell tools
2. THE Coordinator SHALL follow a 4-phase workflow: Research → Synthesize → Implement → Verify
3. THE Coordinator SHALL spawn sub-agents for each implementation task and collect their results
4. THE Coordinator SHALL use Git Worktree to give each sub-agent an independent code copy when available
5. THE Coordinator SHALL merge sub-agent results and present a unified summary to the user
6. THE CLI SHALL support a `--coordinator` flag to start in coordinator mode

### 需求 31：Swarm 模式

**用户故事：** 作为用户，我希望多个 Agent 能以对等方式协作，通过消息传递协调工作，适合长时间并行任务。

#### 验收标准

1. THE Swarm SHALL support named agents that communicate via a shared mailbox system
2. EACH swarm agent SHALL have its own context window, tool set, and message queue
3. THE Swarm SHALL support `send(agentName, message)` and `receive()` primitives for inter-agent communication
4. THE Swarm SHALL support a coordinator agent that assigns initial tasks and monitors progress
5. WHEN a swarm agent completes its task, IT SHALL notify the coordinator via mailbox
6. THE CLI SHALL support a `--swarm` flag with a task description to start swarm execution

---

## Phase 13: tree-sitter Bash AST

### 需求 32：tree-sitter 集成

**用户故事：** 作为用户，我希望 Shell 命令的安全分析能真正理解 Bash 语法（而非正则/简化解析），准确处理嵌套引号、heredoc、进程替换等复杂语法。

#### 验收标准

1. THE Bash_Parser SHALL use tree-sitter-bash WASM module to parse commands into a full AST
2. THE AST parser SHALL correctly handle: nested quotes, heredocs (`<<EOF`), process substitution (`<(cmd)`), arithmetic expansion (`$((expr))`), and brace expansion (`{a,b,c}`)
3. THE security checker SHALL walk the AST tree to extract all command invocations, including those inside subshells, pipelines, and compound commands
4. THE security checker SHALL implement all 23 of Claude Code's static checks (currently 15)
5. WHEN tree-sitter parsing fails (malformed input), THE system SHALL fall back to the existing regex-based parser
6. THE tree-sitter WASM module SHALL be loaded lazily (not at startup) to avoid impacting startup time

---

## Phase 14: React + Ink 终端 UI

### 需求 33：Ink 渲染器

**用户故事：** 作为用户，我希望终端 UI 支持组件化渲染：权限确认对话框、流式代码高亮、嵌套工具进度指示器，而不是简单的文本输出。

#### 验收标准

1. THE UI layer SHALL use React + Ink to render terminal components
2. THE UI SHALL support a streaming text component that renders Markdown with syntax highlighting in real-time
3. THE UI SHALL support a permission dialog component with risk explanation, suggested rules, and y/n/always options
4. THE UI SHALL support a tool progress component showing: tool name, elapsed time, and a spinner
5. THE UI SHALL support nested tool progress (sub-agent tools shown indented under parent)
6. THE UI SHALL support virtual scrolling for long message histories
7. THE UI SHALL maintain backward compatibility: `--no-ink` flag falls back to the current chalk-based output
8. THE Ink renderer SHALL support Vim keybindings for input editing

---

## Phase 15: Extended Thinking 支持

### 需求 34：Thinking Blocks

**用户故事：** 作为用户，我希望 Agent 在处理复杂任务时能使用 Extended Thinking（思维链），让模型先推理再行动，提高复杂任务的成功率。

#### 验收标准

1. WHEN the Anthropic provider is used with a supported model, THE Agent SHALL enable extended thinking via the `thinking` parameter
2. THE Agent SHALL display thinking blocks in a collapsible format: first line visible, full content on expand
3. THE Agent SHALL support configuring thinking budget via `--thinking-budget` flag (default: 10000 tokens)
4. WHEN thinking is enabled, THE Agent SHALL track thinking tokens separately in the /cost display
5. THE Agent SHALL support `--no-thinking` flag to disable extended thinking
6. WHEN a non-Anthropic provider is used, THE thinking parameter SHALL be silently ignored

### 需求 35：Structured Output

#### 验收标准

1. THE Agent SHALL support `--json` flag to request structured JSON output
2. WHEN `--json` is used, THE Agent SHALL pass a JSON Schema to the API to enforce output format
3. THE Agent SHALL validate the model's response against the schema before returning

### 需求 36：测试与质量

#### 验收标准

1. THE Project SHALL maintain 80%+ line coverage
2. EACH new module SHALL have unit tests
3. THE e2e test script SHALL be updated for new features
4. `pnpm run check-all` SHALL pass before each Phase merge
