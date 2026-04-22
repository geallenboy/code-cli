# Code CLI — 开发文档

> 从零构建一个迷你版 Claude Code 的完整开发记录。每个任务记录了做了什么、为什么这样做、以及对应 Claude Code 的哪些概念。

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置 API Key
cp .env.example .env
# 编辑 .env，填入至少一个 API Key（推荐 DEEPSEEK_API_KEY）

# 构建
pnpm run build

# 运行（交互模式）
node dist/index.js --provider deepseek

# 运行（一次性模式）
node dist/index.js --provider deepseek "读取 package.json"

# 运行测试
pnpm test                      # 1030 个单元测试
bash scripts/e2e-test.sh       # 27 个端到端测试
```

## 项目目标

通过从零实现一个 CLI 编程 Agent，深入理解 Claude Code 的核心架构设计。项目分 7 个阶段递进实现：

| 阶段 | 分支 | 标签 | 目标 |
|------|------|------|------|
| Phase 1 | `phase-1/minimal-skeleton` | v0.1.0 | 最小骨架：Agent Loop + API + 基础工具 + CLI |
| Phase 2 | `phase-2/core-enhancement` | v0.2.0 | 核心增强：编辑策略 + 搜索 + 安全 + 压缩 + 持久化 |
| Phase 3 | `phase-3/advanced-features` | v0.3.0 | 高级特性：CLAUDE.md + Yolo + 代码质量 |
| Phase 4 | `phase-4/architecture-upgrade` | v0.4.0 | 架构升级：双层 Generator + 三级压缩 + 错误恢复 |
| Phase 5 | `phase-5/security-and-tools` | v0.5.0 | 安全与工具：权限规则 + 安全语义 + 流式并行 |
| Phase 6 | `phase-6/multi-agent-and-memory` | v0.6.0 | 多 Agent：子 Agent + 记忆系统 + Hook |
| Phase 7 | `phase-7/plan-mode-and-polish` | v1.0.0 | 计划模式 + 提示词缓存 + UI 增强 |
| Phase 8 | `phase-8/context-engineering` | v1.1.0 | 上下文折叠 + 恢复 + 缓存追踪 |
| Phase 9 | `phase-9/skills-tasks` | v1.2.0 | 技能系统 + 任务管理 |
| Phase 10 | `phase-10/production` | v2.0.0 | 并发增强 + Bash AST + Web 工具 + Markdown |
| Phase 11 | `phase-11/mcp-protocol` | v2.1.0 | MCP 协议支持（接入外部工具） |
| Phase 12 | `phase-12/coordinator-swarm` | v2.2.0 | Coordinator + Swarm 多 Agent |
| Phase 13 | `phase-13/tree-sitter-ast` | v2.3.0 | Bash AST 增强安全分析 (23 检查) |
| Phase 14 | `phase-14/react-ink-ui` | v2.4.0 | 组件化终端 UI |
| Phase 15 | `phase-15/extended-thinking` | v3.0.0 | Extended Thinking + Structured Output |

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| TypeScript | ^6.0.2 | 语言（strict mode） |
| Vercel AI SDK (`ai`) | ^6.0.162 | 多提供商统一 API |
| `@ai-sdk/anthropic` | ^3.0.69 | Anthropic 适配器 |
| `@ai-sdk/openai` | ^3.0.53 | OpenAI 适配器 |
| `@ai-sdk/google` | ^3.0.63 | Google 适配器 |
| `@ai-sdk/deepseek` | ^2.0.29 | DeepSeek 适配器 |
| `@ai-sdk/openai-compatible` | ^2.0.41 | 智谱等 OpenAI 兼容 API |
| dotenv | ^17.4.2 | .env 文件加载 |
| Zod | ^4.3.6 | 工具参数 Schema 验证 |
| Chalk | ^5.6.2 | 终端彩色输出 |
| Vitest | ^4.1.4 | 测试框架 |
| fast-check | ^4.6.0 | 属性测试 |
| ESLint + Prettier | — | 代码质量 |
| pnpm | — | 包管理器 |

## 开发日志

### Phase 1: 最小可运行骨架 (v0.1.0)

- [Task 1: 项目初始化与工程基础搭建](./01-project-init.md)
- [Task 2: AI Provider 工厂](./02-provider-factory.md)
- [Task 3: Prompt 编排器](./03-prompt-orchestration.md)
- [Task 4: 工具注册表与基础工具](./04-tool-registry.md)
- [Task 5: Agent Loop 核心循环](./05-agent-loop.md)
- [Task 6: CLI 交互界面](./06-cli-interface.md)
- [Task 7: Phase 1 检查点](./07-phase1-checkpoint.md)

### Phase 2: 核心能力增强 (v0.2.0)

- [Task 8: Search-and-Replace 编辑策略](./08-edit-strategy.md)
- [Task 9: 文件搜索与浏览工具](./09-file-search.md)
- [Task 10: 危险命令检测与用户确认](./10-dangerous-commands.md)
- [Task 11: 上下文压缩](./11-context-compaction.md)
- [Task 12: 会话持久化](./12-session-persistence.md)
- [Task 13: Phase 2 检查点](./13-phase2-checkpoint.md)

### Phase 3: 高级特性与质量保障 (v0.3.0)

- [Task 14-19: Phase 3 总结](./14-19-phase3-summary.md)

### Phase 4: 架构升级 (v0.4.0)

- [Task 20: 双层架构重构](./20-dual-layer-architecture.md)
- [Task 21: 三级渐进压缩管线](./21-three-level-compression.md)
- [Task 22: 错误恢复与 Continue Site](./22-error-recovery.md)
- [Task 23: 消息规范化](./23-message-normalization.md)
- [Task 24: Phase 4 检查点](./24-phase4-checkpoint.md)

### Phase 5: 安全与工具 (v0.5.0)

- [Task 25-28: Phase 5 总结](./25-phase5-security.md)

### Phase 6: 多 Agent 与记忆 (v0.6.0)

- [Task 30-33: Phase 6 总结](./30-phase6-multi-agent-memory.md)

### Phase 7: 计划模式与优化 (v1.0.0)

- [Task 35-39: Phase 7 最终版](./35-phase7-final.md)

### 测试文档

- [测试指南总览](./test/README.md)

## 项目结构

```
code-cli/
├── src/
│   ├── index.ts                  # CLI 入口点
│   ├── cli.ts                    # 命令行参数解析 + REPL 循环
│   ├── ui.ts                     # 终端 UI 输出（彩色、图标、token bar）
│   ├── query-engine.ts           # QueryEngine 外层会话管理
│   ├── query.ts                  # query() 内层循环 (async generator)
│   ├── agent.ts                  # Agent 向后兼容包装器
│   ├── prompt.ts                 # Prompt 编排（静态/动态分离 + memoize）
│   ├── provider.ts               # AI 提供商工厂（5 个提供商）
│   ├── normalizer.ts             # 消息规范化（配对修复 + 合并）
│   ├── permissions.ts            # 权限规则系统（deny-first）
│   ├── streaming-tool-executor.ts # 流式并行工具执行器
│   ├── plan-mode.ts              # 计划模式（权限降级 + 审批）
│   ├── hooks.ts                  # Hook 事件系统（6 事件 + Command）
│   ├── session.ts                # 会话持久化
│   ├── errors.ts                 # 自定义错误类
│   ├── types.ts                  # 共享类型定义
│   ├── system-prompt.md          # 系统提示词模板
│   ├── compactor/                # 三级渐进压缩管线
│   │   ├── index.ts              # 管线入口
│   │   ├── snip.ts               # 第1级：零成本截断
│   │   ├── micro.ts              # 第2级：零成本压缩
│   │   └── auto.ts               # 第3级：模型摘要 + 断路器
│   ├── memory/                   # 跨会话记忆系统
│   │   ├── index.ts              # 公共 API
│   │   ├── store.ts              # 存储层（Markdown + YAML frontmatter）
│   │   └── recall.ts             # 语义召回（LLM 评估相关性）
│   ├── mcp/                      # MCP 协议客户端
│   │   ├── index.ts              # McpManager + 公共 API
│   │   ├── client.ts             # stdio transport + JSON-RPC 2.0
│   │   ├── config.ts             # 配置加载（~/.code-cli/mcp.json）
│   │   └── converter.ts          # MCP schema → AI SDK tool 转换
│   ├── coordinator/              # Coordinator 多 Agent 模式
│   │   ├── index.ts              # 公共 API
│   │   ├── coordinator.ts        # 4 阶段工作流
│   │   └── worktree.ts           # Git Worktree 隔离
│   ├── swarm/                    # Swarm 对等协作模式
│   │   ├── index.ts              # 公共 API
│   │   ├── swarm.ts              # Swarm 管理器
│   │   ├── mailbox.ts            # 消息邮箱系统
│   │   └── agent.ts              # Swarm Agent 实例
│   └── tools/                    # 工具系统
│       ├── index.ts              # 工具注册表 + 安全语义元数据
│       ├── file-ops.ts           # read_file + grep_search + list_files
│       ├── shell.ts              # run_shell + 结构化命令解析 + 危险检测
│       ├── editor.ts             # edit_file (search-and-replace) + write_file
│       └── agent-tool.ts         # 子 Agent 委派工具
├── tests/
│   ├── unit/                     # 24 个单元测试文件
│   └── integration/              # 集成测试
├── scripts/
│   └── e2e-test.sh               # 端到端自动化测试（27 个场景）
├── docs/                         # 开发文档（22 篇）
│   └── test/                     # 测试文档（9 篇）
├── test-reports/                 # 测试日志（.gitignore）
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
├── .env.example                  # API Key 配置模板
└── CLAUDE.md                     # 项目级指令（可选）
```

## 可用命令

### 开发命令

```bash
pnpm run build          # TypeScript 编译
pnpm run dev            # 监听模式编译
pnpm test               # 运行 1030 个单元测试
pnpm test:watch         # 监听模式测试
pnpm test:coverage      # 覆盖率报告
pnpm run lint           # ESLint 检查
pnpm run format         # Prettier 格式化
pnpm run typecheck      # tsc --noEmit 类型检查
pnpm run check-all      # typecheck + lint + test 一键质量门
bash scripts/e2e-test.sh # 27 个端到端测试
```

### CLI 命令

```bash
node dist/index.js                              # REPL 交互模式（默认 Anthropic）
node dist/index.js --provider deepseek           # 指定提供商
node dist/index.js --model gpt-4o-mini           # 指定模型
node dist/index.js --yolo                        # 跳过所有确认
node dist/index.js --resume                      # 恢复上次会话
node dist/index.js "读取 package.json"            # 一次性模式
```

### REPL 斜杠命令

| 命令 | 功能 |
|------|------|
| `/clear` | 清空对话历史 |
| `/cost` | 显示 token 用量和估算成本 |
| `/compact` | 手动触发上下文压缩 |
| `/remember <text>` | 创建跨会话记忆 |
| `/memory` | 列出所有记忆 |
| `/plan` | 进入计划模式（只读） |
| `/status` | 显示会话状态 |
| `/rules` | 显示权限规则 |
| `/mcp` | 列出已连接的 MCP 服务器 |

## 支持的 AI 提供商

| 提供商 | 默认模型 | 环境变量 |
|--------|----------|----------|
| `anthropic` | claude-sonnet-4-20250514 | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o | `OPENAI_API_KEY` |
| `google` | gemini-2.5-flash | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `deepseek` | deepseek-chat | `DEEPSEEK_API_KEY` |
| `zhipu` | glm-4-plus | `ZHIPU_API_KEY` |

## 最终指标

| 指标 | 数值 |
|------|------|
| 单元测试 | 1030 |
| 端到端测试 | 27 |
| 源文件 | 60+ |
| 工具 | 6 + agent + MCP |
| 提供商 | 5 |
| 开发文档 | 30+ 篇 |
| 测试文档 | 9 篇 |
| Git 标签 | v0.1.0 → v3.3.0 (18 个) |
| Phase | 15 |
| Task | 67 |

### Phase 8: 上下文工程深化 (v1.1.0)

- [Task 40-42: Phase 8 总结](./40-phase8-context-cache.md)

### Phase 9: 技能与任务 (v1.2.0)

- [Task 44-46: Phase 9 总结](./44-phase9-skills-tasks.md)

### Phase 10: 生产级打磨 (v2.0.0)

- [Task 48-51: Phase 10 总结](./48-phase10-production.md)

### Phase 11: MCP 协议支持 (v2.1.0)

- [Task 54-55: MCP 协议客户端](./54-phase11-mcp.md)

### Phase 12: Coordinator/Swarm 多 Agent (v2.2.0)

- [Task 56-58: Coordinator + Swarm 模式](./56-phase12-coordinator-swarm.md)

### Phase 13: Bash AST 增强安全分析 (v2.3.0)

- [Task 59-60: 23 个安全检查 + AST 解析](./59-phase13-tree-sitter-ast.md)

### Phase 14: 组件化终端 UI (v2.4.0)

- [Task 61-63: Ink 组件 + chalk 降级](./61-phase14-ink-ui.md)

### Phase 15: Extended Thinking + Structured Output (v3.0.0)

- [Task 64-67: Thinking + JSON 输出](./64-phase15-thinking-structured.md)
