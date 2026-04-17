# Task 7: Phase 1 检查点 — 最小可运行骨架完成

> 分支: `phase-1/minimal-skeleton` → 合并到 `master`
> 标签: `v0.1.0`

## Phase 1 总结

Phase 1 的目标是搭建一个**最小可运行的编程 Agent**——能接受用户输入、调用 AI 模型、执行工具、循环直到任务完成。

### 完成了什么

| Task | 组件 | 核心文件 | 测试数 |
|------|------|----------|--------|
| 1 | 项目初始化 | package.json, tsconfig.json, errors.ts | 1 |
| 2 | Provider 工厂 | provider.ts | 24 |
| 3 | Prompt 编排 | prompt.ts, system-prompt.md | 13 |
| 4 | 工具注册表 + 基础工具 | tools/*.ts | 34 |
| 5 | Agent Loop | agent.ts | 26 |
| 6 | CLI 界面 | cli.ts, ui.ts, index.ts | 9 |
| **合计** | **7 个组件** | **15 个源文件** | **108 tests** |

### 架构回顾

Phase 1 实现了 Claude Code 文档中描述的 7 个最小必要组件：

```
用户 → CLI (cli.ts)
         ↓
       Agent Loop (agent.ts)  ← 核心 while(true) 循环
         ↓           ↓
  Prompt 编排    工具注册表
  (prompt.ts)   (tools/index.ts)
                    ↓
              ┌─────┼─────┐
          read_file  write_file  run_shell
```

### 关键设计决策回顾

1. **Vercel AI SDK 而非 Anthropic SDK**：多提供商支持，一行代码切换模型
2. **单层 while(true) 而非双层 Generator**：学习项目不需要分离会话管理和查询执行
3. **模板替换而非缓存感知组装**：简单直接，理解缓存策略的动机留给后续体验
4. **错误是数据**：工具错误返回字符串给模型，不抛异常
5. **Zod Schema + AI SDK tool()**：类型安全的工具声明，自动参数验证

### Git 工作流

```
master ← merge: Phase 1 完成 (tag: v0.1.0)
  └── phase-1/minimal-skeleton
        ├── 9d087d1 chore: 项目初始化
        ├── aee0b3d feat: Provider 工厂
        ├── 6b5cad5 feat: Prompt 编排器
        ├── 71c7c97 feat: 工具注册表 + 基础工具
        ├── 83c6922 feat: Agent Loop + CLI
        └── 42fdfef docs: 开发文档
```

**分支策略**：
- 在 `master` 上创建初始 commit
- 切到 `phase-1/minimal-skeleton` 分支开发
- 完成后 `--no-ff` 合并回 `master`，保留分支历史
- 打 `v0.1.0` 标签标记里程碑

这种分支策略让你可以随时 `git log --oneline phase-1/minimal-skeleton` 查看某个阶段的所有提交。

### 从 Phase 1 到 Phase 2

Phase 1 的 Agent 能工作，但有明显的局限：
- **没有精确编辑**：只能用 `write_file` 重写整个文件（Phase 2 加 `edit_file`）
- **没有搜索能力**：不能 grep 搜索代码（Phase 2 加 `grep_search` + `list_files`）
- **没有安全防护**：`rm -rf /` 会直接执行（Phase 2 加危险命令检测）
- **没有上下文管理**：长对话会超限崩溃（Phase 2 加压缩）
- **没有会话持久化**：关闭终端就丢失进度（Phase 2 加 session）

这些局限正是 Phase 2 要解决的问题。
