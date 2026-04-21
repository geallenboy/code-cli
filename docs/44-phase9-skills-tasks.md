# Task 44-46: Phase 9 — 技能与任务

> 分支: `phase-9/skills-and-tasks`
> 标签: `v1.2.0`

## 做了什么

3 个新系统：技能（可复用工作流）、任务管理（进度追踪）、并发执行增强。

### Task 44: 技能系统

3 个内置技能 + 自定义技能支持：

| 命令 | 技能 | 功能 |
|------|------|------|
| `/commit` | commit | 分析 git diff → 生成 commit message → 执行 git commit |
| `/review` | review | 分析当前变更 → 代码审查 → 建议改进 |
| `/debug` | debug | 分析错误 → 定位根因 → 建议修复 |
| `/skill <name>` | 自定义 | 从 ~/.mini-claude/skills/ 加载 |

**懒加载**：启动时只读 frontmatter（name/description/trigger），调用时才加载完整 prompt。

### Task 45: 任务管理

```bash
/task add "重构认证模块"     # 创建任务
/task list                   # 列出所有任务 (2/5 completed)
/task run task-1713456789    # 执行任务（spawn 子 Agent）
```

文件级存储（`~/.mini-claude/tasks/`），支持依赖检查和原子 claiming。

### Task 46: 并发执行增强

- `Promise.allSettled`：单个工具失败不阻塞其他并发工具
- 级联中止：Bash 失败取消兄弟 Bash，但不取消 read-only 工具
- 执行计时：报告 wall-clock vs sum，显示并行收益

## 测试覆盖

38 个新增测试（skills 11 + tasks 18 + executor 9）

```bash
pnpm test  # ✅ 451 tests passed
```
