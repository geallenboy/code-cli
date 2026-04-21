# Task 44-46: Phase 9 — 技能与任务

> 分支: `phase-9/skills-and-tasks`
> 标签: `v1.2.0`

## 做了什么

3 个新系统：技能（可复用工作流）、任务管理（进度追踪）、并发执行增强。

### Task 44: 技能系统

```bash
> /commit     # 内置：分析 git diff → 生成 commit message → 执行 git commit
> /review     # 内置：审查当前变更 → 识别 bug → 建议改进
> /debug      # 内置：分析错误 → 定位根因 → 建议修复
> /skill      # 列出所有技能
> /skill name # 调用自定义技能
```

**懒加载**：启动时只读 frontmatter（name/description/trigger），调用时才加载完整 prompt。

自定义技能放在 `~/.mini-claude/skills/` 目录：
```markdown
---
name: my-skill
description: 做某件事
trigger: manual
---
这里是完整的 prompt 模板...
```

### Task 45: 任务管理

```bash
> /task add 重构认证模块    # 创建任务
> /task list                # 列出所有任务（含进度）
> /task run task-xxx        # 执行任务（spawn 子 Agent）
```

- 文件级存储：`~/.mini-claude/tasks/{id}.json`
- 依赖检查：有未完成依赖的任务不可执行
- 原子 claiming：文件锁防止并发冲突

### Task 46: 并发执行增强

- `Promise.allSettled`：单个工具失败不阻塞其他并发工具
- **级联中止**：Bash 失败 → 取消兄弟 Bash，但不取消 read-only 工具
- **执行计时**：报告 wall-clock vs sum，显示并行收益

## 测试覆盖

38 个新增测试（skills 11 + tasks 18 + executor 9）

```bash
pnpm test  # ✅ 451 tests passed
```
