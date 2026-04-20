# Task 30-33: Phase 6 — 多 Agent 与记忆

> 分支: `phase-6/multi-agent-and-memory`
> 标签: `v0.6.0`

## 做了什么

4 个新系统：子 Agent 委派、跨会话记忆、语义召回、Hook 事件。

### Task 30: 子 Agent 架构

```
父 Agent → 调用 agent 工具 → 生成独立 QueryEngine → 子 Agent 执行 → 返回结果

类型：
  general: 全部工具（排除 agent 防无限嵌套），maxTurns=20
  explore: 只读工具（read_file, grep_search, list_files）
```

**上下文隔离**：子 Agent 不继承父 Agent 的对话历史，只接收 `task` 参数。这确保子任务的细节不会污染父 Agent 的上下文。

### Task 31: 记忆系统

```
~/.mini-claude/memory/
├── user-prefer-dark-mode.md      # 用户偏好
├── feedback-use-vitest.md        # 行为反馈
├── project-code-freeze.md        # 项目动态
└── reference-api-docs.md         # 外部引用

每个文件格式：
---
type: feedback
description: 测试用 Vitest 不是 Jest
created: 2025-04-20
---

## Why
项目使用 Vitest 作为测试框架...

## How to apply
运行测试时使用 pnpm test 而非 npx jest...
```

命令：
- `/remember <text>` — 创建记忆（自动分类类型）
- `/memory` — 列出所有记忆

### Task 32: 语义召回

```
用户查询 → 扫描 frontmatter → LLM 评估相关性 → 选最多 5 条 → 注入对话
```

去重：同一会话中已召回的记忆不会被再次召回。总量限制 30K 字符。

### Task 33: Hook 系统

```json
// ~/.mini-claude/settings.json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{ "type": "command", "command": "npm run lint" }]
    }]
  }
}
```

6 个事件：PreToolUse / PostToolUse / Stop / SessionStart / SessionEnd / UserPromptSubmit

**信任检查**：未信任工作区跳过所有 hook，防止恶意仓库通过 hook 执行代码。

## 测试覆盖

43 个新增测试（agent-tool 7 + memory-store 13 + memory-recall 6 + hooks 17）

```bash
pnpm test  # ✅ 337 tests passed
```

## 本地手动测试

```bash
pnpm run build

# 记忆系统
node dist/index.js --provider deepseek
> /remember 测试用 Vitest 不是 Jest
# 预期：Memory saved: feedback-测试用-vitest-不是-jest.md [feedback]
> /memory
# 预期：列出所有记忆

# 子 Agent（需要 API Key）
node dist/index.js --provider deepseek "用子 Agent 探索 src 目录的结构"
# 预期：Agent 调用 agent 工具，子 Agent 用 list_files 探索后返回结果
```
