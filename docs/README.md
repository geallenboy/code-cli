# Mini Claude Code — 开发文档

> 从零构建一个迷你版 Claude Code 的完整开发记录。每个任务记录了做了什么、为什么这样做、以及对应 Claude Code 的哪些概念。

## 项目目标

通过从零实现一个最小可用的 CLI 编程 Agent，深入理解 Claude Code 的核心架构设计。项目分三个阶段递进实现：

| 阶段 | 分支 | 目标 |
|------|------|------|
| Phase 1 | `phase-1/minimal-skeleton` | 最小可运行骨架：Agent Loop + API + 基础工具 + CLI |
| Phase 2 | `phase-2/core-enhancement` | 核心增强：编辑策略 + 搜索 + 安全 + 压缩 + 持久化 |
| Phase 3 | `phase-3/advanced-features` | 高级特性：CLAUDE.md + Yolo + 代码质量 + 完整测试 |

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| TypeScript | ^6.0.2 | 语言（strict mode） |
| Vercel AI SDK (`ai`) | ^6.0.162 | 多提供商统一 API |
| `@ai-sdk/anthropic` | ^3.0.69 | Anthropic 适配器 |
| `@ai-sdk/openai` | ^3.0.53 | OpenAI 适配器 |
| `@ai-sdk/google` | ^3.0.63 | Google 适配器 |
| Zod | ^4.3.6 | 工具参数 Schema 验证 |
| Chalk | ^5.6.2 | 终端彩色输出 |
| Vitest | ^4.1.4 | 测试框架 |
| fast-check | ^4.6.0 | 属性测试 |
| pnpm | — | 包管理器 |

## 开发日志

- [Task 1: 项目初始化与工程基础搭建](./01-project-init.md)
- [Task 2: AI Provider 工厂](./02-provider-factory.md)
- [Task 3: Prompt 编排器](./03-prompt-orchestration.md)

## 项目结构

```
mini-claude-code/
├── src/
│   ├── index.ts              # CLI 入口点
│   ├── cli.ts                # 命令行参数解析 + REPL
│   ├── ui.ts                 # 终端 UI 输出
│   ├── agent.ts              # Agent Loop 核心
│   ├── prompt.ts             # Prompt 编排
│   ├── provider.ts           # AI 提供商工厂
│   ├── compactor.ts          # 上下文压缩器
│   ├── session.ts            # 会话持久化
│   ├── errors.ts             # 自定义错误类
│   ├── types.ts              # 共享类型定义
│   ├── system-prompt.md      # 系统提示词模板
│   └── tools/
│       ├── index.ts          # 工具注册表
│       ├── file-ops.ts       # 文件操作工具
│       ├── shell.ts          # Shell 执行工具
│       └── editor.ts         # 编辑策略工具
├── tests/
│   ├── unit/                 # 单元测试
│   └── integration/          # 集成测试
├── docs/                     # 开发文档（你在这里）
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Git 提交历史

```
6b5cad5 feat: 实现 Prompt 编排器 — 系统提示词动态组装
aee0b3d feat: 实现 AI Provider 工厂 — Vercel AI SDK 多提供商支持
9d087d1 chore: 项目初始化 — TypeScript + Vercel AI SDK + Vitest 工程骨架
```
