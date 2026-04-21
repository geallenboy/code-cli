# Task 3: Prompt 编排器

> 对应需求: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7
> 分支: `phase-1/minimal-skeleton`
> 提交: `6b5cad5`

## 做了什么

实现了 `src/prompt.ts` — 系统提示词的运行时动态组装。

### 核心概念：为什么需要 Prompt 编排？

大模型的能力完全取决于它"看到"什么。同一个模型，给它精心组织的上下文 vs 随意拼凑的上下文，表现可以天差地别。Prompt 编排就是解决"如何让模型看到正确的信息"这个问题。

### 组装流程

```
加载模板 (system-prompt.md)
    ↓
替换环境占位符 (cwd, platform, date, shell)
    ↓
注入工具描述 (每个工具的 name + description)
    ↓
注入 git 上下文 (分支、提交、状态)
    ↓
注入 CLAUDE.md (项目级指令)
    ↓
完整的系统提示词
```

### 系统提示词模板 (`src/system-prompt.md`)

模板使用 `{{placeholder}}` 占位符，运行时替换为实际值：

```markdown
You are a programming assistant agent...

## Environment
- Working directory: {{cwd}}
- Platform: {{platform}}
- Date: {{date}}

## Available Tools
{{tool_descriptions}}

## Behavioral Guidelines
1. Read before edit — 编辑前必须先读取文件
2. Prefer editing over creating — 优先编辑而非新建
3. Use dedicated tools — 用专用工具而非 shell 命令
...
```

**行为指导规则**是 Prompt 编排的关键部分。Claude Code 的系统提示词包含大量针对 Claude 模型特性优化的行为指令。Mini 版提取了 8 条最核心的规则。

### Git 上下文获取

```typescript
export function getGitContext(): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { timeout: 3000 });
    const log = execSync('git log --oneline -5', { timeout: 3000 });
    const status = execSync('git status --short', { timeout: 3000 });
    // 组装返回
  } catch {
    return '';  // 优雅降级：不在 git 仓库中？没关系，跳过
  }
}
```

**设计决策：3 秒超时 + 优雅降级**

为什么不直接让 git 命令无限等待？因为：
1. 用户可能不在 git 仓库中（`git rev-parse` 会报错）
2. 用户可能没安装 git
3. 大型仓库的 `git status` 可能很慢
4. git 仓库可能损坏

任何一种情况都不应该阻止 Agent 正常工作。git 上下文是"锦上添花"，不是"必须有"。

### CLAUDE.md 加载

Phase 1 仅加载当前目录的 CLAUDE.md，Phase 3 会扩展为从当前目录向上遍历，收集所有祖先目录的 CLAUDE.md（祖先优先）。

## 对应 Claude Code 的概念

Claude Code 的 Prompt 编排（`src/context.ts` 190 行 + `src/services/api/claude.ts` 3,419 行）远比 Mini 版复杂：

| 特性 | Claude Code | Xiaomi Code |
|------|-------------|------------------|
| 组装方式 | 缓存感知分层组装 | 简单模板替换 |
| 缓存策略 | 静态内容 prefix caching | 无缓存 |
| 上下文结构 | 三层（system / user context / messages） | 单层 system prompt |
| 工具描述 | 按需加载 + shouldDefer 延迟 | 全量注入 |

**为什么 Claude Code 需要缓存感知？**

每次 API 调用都发送完整的系统提示词。如果提示词有 10K tokens，100 轮对话就是 1M tokens 的重复发送。Anthropic 的 prompt caching 可以缓存不变的前缀，大幅降低延迟和成本。但这要求提示词的"静态部分"（角色定义、工具描述）和"动态部分"（git 状态、日期）有明确的边界。

Mini 版不做这个优化——当你发现长对话越来越慢、成本越来越高时，就理解了为什么需要缓存策略。

## 测试覆盖

13 个单元测试，覆盖：
- ✅ 环境信息注入（cwd, platform, date）
- ✅ 工具描述注入（有工具 / 无工具）
- ✅ 行为指导规则存在性
- ✅ git 上下文成功获取
- ✅ git 失败优雅降级
- ✅ git 超时优雅降级
- ✅ 工作区状态（clean / dirty）

```bash
pnpm test  # ✅ 38 tests passed
```
