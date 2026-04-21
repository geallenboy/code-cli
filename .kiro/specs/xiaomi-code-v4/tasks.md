# 实现计划：Xiaomi Code v4 — Phase 11-15

## 概述

v4 从 80% 提升到 90%+ 特性覆盖。任务编号 54-73，延续 v1-v3(1-53)。

---

## Phase 11: `phase-11/mcp-protocol` — MCP 协议支持

- [x] 54. MCP 客户端核心
  - [ ] 54.1 实现 MCP 客户端 (`src/mcp/client.ts`)
    - stdio transport: spawn 子进程，stdin/stdout JSON-RPC 2.0
    - initialize 握手 + initialized 通知
    - tools/list 工具发现
    - tools/call 工具执行
    - 30s 超时 + 崩溃优雅降级
    - _需求: 28.1-28.3, 28.5, 28.8_
  - [ ] 54.2 实现 MCP 配置加载 (`src/mcp/config.ts`)
    - 从 ~/.xiaomi-code/mcp.json 加载服务器配置
    - 支持多个并发服务器
    - _需求: 28.6-28.7, 29.1_
  - [ ] 54.3 实现 MCP → AI SDK 工具转换 (`src/mcp/converter.ts`)
    - MCP tool schema → Vercel AI SDK tool() 定义
    - 自动 Zod schema 生成
    - _需求: 28.4_
  - [ ] 54.4 集成到工具注册表和权限系统
    - MCP 工具通过相同权限检查
    - --mcp 启动标志
    - /mcp 命令列出连接的服务器
    - _需求: 28.9-28.10, 29.2-29.3_
  - [ ] 54.5 为 MCP 编写测试
    - 模拟 MCP 服务器（mock subprocess）
    - 测试握手、工具发现、执行、超时、降级
    - _需求: 36_

- [ ] 55. Phase 11 检查点
  - 合并到 master，打标签 `v2.1.0`

---

## Phase 12: `phase-12/coordinator-swarm` — 多 Agent 协调

- [ ] 56. Coordinator 模式
  - [ ] 56.1 实现 Coordinator (`src/coordinator/coordinator.ts`)
    - 4 阶段工作流: Research → Synthesize → Implement → Verify
    - 只能分配任务，不能直接使用文件/Shell 工具
    - spawn 子 Agent 执行实现任务
    - _需求: 30.1-30.3, 30.5_
  - [ ] 56.2 实现 Git Worktree 隔离 (`src/coordinator/worktree.ts`)
    - 为每个子 Agent 创建独立 worktree
    - 任务完成后自动清理
    - _需求: 30.4_
  - [ ] 56.3 集成到 CLI
    - --coordinator 启动标志
    - _需求: 30.6_
  - [ ] 56.4 为 Coordinator 编写测试
    - _需求: 36_

- [ ] 57. Swarm 模式
  - [ ] 57.1 实现 Swarm 管理器 (`src/swarm/swarm.ts`)
    - 命名 Agent 注册和生命周期管理
    - _需求: 31.1-31.2_
  - [ ] 57.2 实现消息邮箱 (`src/swarm/mailbox.ts`)
    - send(agentName, message) + receive() 原语
    - 消息队列 + 超时
    - _需求: 31.3_
  - [ ] 57.3 实现 Swarm Agent (`src/swarm/agent.ts`)
    - 独立上下文 + 工具集 + 消息队列
    - 完成时通知 coordinator
    - _需求: 31.4-31.5_
  - [ ] 57.4 集成到 CLI
    - --swarm 启动标志
    - _需求: 31.6_
  - [ ] 57.5 为 Swarm 编写测试
    - _需求: 36_

- [ ] 58. Phase 12 检查点
  - 合并到 master，打标签 `v2.2.0`

---

## Phase 13: `phase-13/tree-sitter-ast` — Bash AST 安全分析

- [ ] 59. tree-sitter 集成
  - [ ] 59.1 安装 tree-sitter-bash WASM (`src/bash-ast/parser.ts`)
    - 懒加载 WASM 模块（不影响启动时间）
    - 解析命令为完整 AST
    - _需求: 32.1, 32.6_
  - [ ] 59.2 实现 AST 遍历器 (`src/bash-ast/walker.ts`)
    - 遍历 AST 提取所有命令调用
    - 处理嵌套引号、heredoc、进程替换、算术展开、花括号展开
    - _需求: 32.2-32.3_
  - [ ] 59.3 实现 23 个静态安全检查 (`src/bash-ast/checks.ts`)
    - 从当前 15 个扩展到 23 个
    - 新增: heredoc 注入、进程替换、算术注入、别名覆盖、history 操作、crontab 修改、Docker 逃逸、网络监听
    - _需求: 32.4_
  - [ ] 59.4 实现降级机制
    - tree-sitter 解析失败 → 回退到 bash-parser.ts
    - _需求: 32.5_
  - [ ] 59.5 为 tree-sitter 编写测试
    - _需求: 36_

- [ ] 60. Phase 13 检查点
  - 合并到 master，打标签 `v2.3.0`

---

## Phase 14: `phase-14/react-ink-ui` — React + Ink 终端 UI

- [ ] 61. Ink 渲染器基础
  - [ ] 61.1 安装 Ink + React 依赖
    - ink, react, @types/react
    - _需求: 33.1_
  - [ ] 61.2 实现主应用组件 (`src/ink/app.tsx`)
    - REPL 输入 + 消息列表 + 工具进度
    - _需求: 33.1_
  - [ ] 61.3 实现流式文本组件 (`src/ink/components/streaming-text.tsx`)
    - 实时 Markdown 渲染 + 语法高亮
    - _需求: 33.2_
  - [ ] 61.4 实现权限对话框 (`src/ink/components/permission-dialog.tsx`)
    - 风险解释 + 建议规则 + y/n/always 选项
    - _需求: 33.3_

- [ ] 62. Ink 高级组件
  - [ ] 62.1 实现工具进度组件 (`src/ink/components/tool-progress.tsx`)
    - 工具名 + 耗时 + spinner
    - 嵌套显示（子 Agent 工具缩进）
    - _需求: 33.4-33.5_
  - [ ] 62.2 实现虚拟滚动
    - 长消息历史高效渲染
    - _需求: 33.6_
  - [ ] 62.3 实现 --no-ink 降级
    - 回退到 chalk 输出
    - _需求: 33.7_
  - [ ] 62.4 实现 Vim 键绑定
    - _需求: 33.8_
  - [ ] 62.5 为 Ink UI 编写测试
    - _需求: 36_

- [ ] 63. Phase 14 检查点
  - 合并到 master，打标签 `v2.4.0`

---

## Phase 15: `phase-15/extended-thinking` — Extended Thinking

- [ ] 64. Thinking 支持
  - [ ] 64.1 实现 Thinking 参数注入 (`src/thinking.ts`)
    - Anthropic 提供商启用 thinking 参数
    - --thinking-budget 配置（默认 10000）
    - --no-thinking 禁用
    - 非 Anthropic 静默忽略
    - _需求: 34.1, 34.3, 34.5-34.6_
  - [ ] 64.2 实现 Thinking 显示
    - 可折叠格式：首行可见，展开查看完整内容
    - /cost 显示 thinking token 单独统计
    - _需求: 34.2, 34.4_
  - [ ] 64.3 为 Thinking 编写测试
    - _需求: 36_

- [ ] 65. Structured Output
  - [ ] 65.1 实现 JSON Schema 输出 (`src/structured-output.ts`)
    - --json 标志
    - JSON Schema 传给 API
    - 响应验证
    - _需求: 35.1-35.3_
  - [ ] 65.2 为 Structured Output 编写测试
    - _需求: 36_

- [ ] 66. 最终测试与质量门
  - [ ] 66.1 更新 e2e 测试脚本
  - [ ] 66.2 确保 80%+ 覆盖率
  - [ ] 66.3 确保 check-all 通过

- [ ] 67. Phase 15 检查点 — v3.0.0 最终验证
  - 合并到 master，打标签 `v3.0.0`
  - 更新 docs/

## 说明

- 任务编号 54-67 延续 v1-v3(1-53)
- 每个 Phase 对应独立 git 分支
- 属性测试引用 design.md 中的 P29-P34
- 每个任务完成后同步更新 docs/
