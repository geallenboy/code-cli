# 技术设计文档：Xiaomi Code v4 — Phase 11-15

## Overview

v4 从 80% 提升到 90%+ 特性覆盖，实现 5 个高级特性。

### 新增模块

| Phase | 新模块 | 说明 |
|-------|--------|------|
| 11 | src/mcp/ (client, config, converter) | MCP 协议客户端 |
| 12 | src/coordinator/, src/swarm/ | 多 Agent 协调 |
| 13 | src/bash-ast/ (tree-sitter WASM) | AST 级安全分析 |
| 14 | src/ink/ (components, renderer) | React 终端 UI |
| 15 | src/thinking.ts | Extended Thinking |

## Architecture

### Phase 11: MCP 协议

src/mcp/client.ts — stdio transport + JSON-RPC 2.0
src/mcp/config.ts — 加载 ~/.xiaomi-code/mcp.json
src/mcp/converter.ts — MCP tool schema → AI SDK tool()

流程: 启动 → mcp.json → spawn → initialize → tools/list → convert → register

### Phase 12: Coordinator/Swarm

src/coordinator/coordinator.ts — 4 阶段: Research → Synthesize → Implement → Verify
src/coordinator/worktree.ts — Git Worktree 隔离
src/swarm/swarm.ts — Swarm 管理器
src/swarm/mailbox.ts — 消息邮箱 (send/receive)
src/swarm/agent.ts — Swarm Agent 实例

### Phase 13: tree-sitter Bash AST

src/bash-ast/parser.ts — tree-sitter-bash WASM 加载 + 解析
src/bash-ast/walker.ts — AST 遍历 + 命令提取
src/bash-ast/checks.ts — 23 个静态安全检查
降级: WASM 加载失败 → 回退到现有 bash-parser.ts

### Phase 14: React + Ink UI

src/ink/app.tsx — 主应用组件
src/ink/components/streaming-text.tsx — 流式 Markdown 渲染
src/ink/components/permission-dialog.tsx — 权限确认对话框
src/ink/components/tool-progress.tsx — 工具进度指示器
src/ink/components/spinner.tsx — 状态 spinner
降级: --no-ink → 回退到现有 chalk UI

### Phase 15: Extended Thinking

src/thinking.ts — thinking 参数注入 + token 追踪
支持 --thinking-budget 和 --no-thinking 标志
非 Anthropic 提供商静默忽略

## Correctness Properties

P29: MCP 工具通过与内置工具相同的权限系统
P30: Coordinator 不能直接使用文件/Shell 工具
P31: Swarm 消息不跨 Agent 泄露（隔离性）
P32: tree-sitter 解析失败时回退到 regex 解析器
P33: --no-ink 回退到 chalk 输出（功能等价）
P34: 非 Anthropic 提供商忽略 thinking 参数

## Testing Strategy

每个 Phase 新增 ~30 个测试，目标总计 ~700。
