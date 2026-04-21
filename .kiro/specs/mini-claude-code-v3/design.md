# 技术设计文档：Mini Claude Code v3 — Phase 8-10

## Overview

v3 从 60% 提升到 80% 特性覆盖，聚焦三个方向：上下文工程深化、技能/任务系统、生产级打磨。

### v1.0.0 → v2.0.0 演进

| 维度 | v1.0.0 (Phase 1-7) | v2.0.0 (Phase 8-10) |
|------|---------------------|---------------------|
| 压缩 | 3 级 (Snip→Micro→Auto) | 4 级 (+Context Collapse) + 压缩后恢复 |
| 缓存 | memoize 静态 prompt | 真正的 prefix caching + 命中率追踪 |
| 技能 | 无 | 3 个内置 + 自定义 + 懒加载 |
| 任务 | 无 | 文件级存储 + 依赖追踪 + 子 Agent 执行 |
| 工具执行 | 基础并行 | 流式并行 + 级联中止 |
| Bash 安全 | 正则 + 结构化 | AST 级解析 + 15 个静态检查 |
| 工具数 | 7 | 9 (+web_fetch, web_search) |
| UI | chalk 文本 | Markdown 渲染 + diff 高亮 + spinner |
| 发布 | 本地构建 | npm 包 + npx 支持 |

## Architecture

### Phase 8 组件

#### Context Collapse (`src/compactor/collapse.ts`) — 需求 17

```typescript
interface CollapseSegment {
  startIdx: number;
  endIdx: number;
  summary: string;
  originalMessages: ModelMessage[];
  isActive: boolean;
}

export class ContextCollapse {
  private segments: CollapseSegment[];

  /** 识别不活跃段并折叠 */
  applyCollapses(messages: ModelMessage[], recentTurns: number): {
    projected: ModelMessage[];  // 折叠后的视图（发给 API）
    original: ModelMessage[];   // 原始完整历史（保留在内存）
    tokensFreed: number;
  };

  /** 当工具引用折叠段内容时展开 */
  unfoldSegment(segmentIdx: number): ModelMessage[];
}
```

#### Post-Compression Recovery (`src/compactor/recovery.ts`) — 需求 18

```typescript
export async function recoverAfterCompact(
  preCompactMessages: ModelMessage[],
  model: LanguageModel,
): Promise<ModelMessage[]>;
// 1. 从 preCompactMessages 提取最近 5 个编辑过的文件路径
// 2. 重新读取这些文件（每个 ≤5K chars）
// 3. 注入为 system-reminder 消息
```

#### Prompt Cache Tracking (`src/cache-tracker.ts`) — 需求 19

```typescript
export class CacheTracker {
  private history: Array<{ cacheRead: number; cacheCreation: number; total: number }>;

  trackUsage(usage: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number }): void;
  getCacheHitRate(): number;  // 0-100%
  isBreaking(): boolean;      // 连续 3 次 <50%
}
```

### Phase 9 组件

#### Skill System (`src/skills/`) — 需求 20

```typescript
// src/skills/store.ts
interface SkillDefinition {
  name: string;
  description: string;
  trigger: 'manual' | 'auto' | 'both';
  prompt: string;
}

export function loadSkills(): SkillDefinition[];  // 懒加载 frontmatter
export function getSkillPrompt(name: string): string;  // 按需加载完整内容
export function getBuiltinSkills(): SkillDefinition[];  // commit/review/debug

// src/skills/index.ts
export { loadSkills, getSkillPrompt, getBuiltinSkills };
```

#### Task System (`src/tasks/`) — 需求 21

```typescript
// src/tasks/store.ts
interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  description: string;
  dependencies: string[];
  result?: string;
}

export function createTask(title: string, description: string): Task;
export function listTasks(): Task[];
export function claimTask(id: string): boolean;  // 原子操作
export function completeTask(id: string, result: string): void;
export function canExecute(task: Task): boolean;  // 检查依赖
```

### Phase 10 组件

#### Bash AST Parser (`src/bash-parser.ts`) — 需求 23

```typescript
interface CommandToken {
  type: 'command' | 'argument' | 'redirect' | 'pipe' | 'and' | 'or' | 'subshell';
  value: string;
  children?: CommandToken[];
}

export function parseCommand(cmd: string): CommandToken[];
export function extractCommandNames(tokens: CommandToken[]): string[];
export function runSecurityChecks(tokens: CommandToken[]): SecurityCheckResult[];
```

#### Web Tools (`src/tools/web.ts`) — 需求 24

```typescript
export async function webFetch(url: string): Promise<string>;  // HTTPS only, 10s timeout, 1MB limit
export async function webSearch(query: string): Promise<string>;  // Top 5 results
```

#### Markdown Renderer (`src/markdown.ts`) — 需求 25

```typescript
export function renderMarkdown(text: string): string;  // Terminal-friendly rendering
export function renderDiff(oldContent: string, newContent: string): string;  // git diff style
```

## 目录结构演进

```
src/
├── compactor/
│   ├── collapse.ts          # 【新】Context Collapse
│   ├── recovery.ts          # 【新】压缩后恢复
│   └── ... (existing)
├── cache-tracker.ts         # 【新】缓存命中率追踪
├── skills/                  # 【新】技能系统
│   ├── index.ts
│   ├── store.ts
│   └── builtins/            # 内置技能 (commit/review/debug)
├── tasks/                   # 【新】任务管理
│   ├── index.ts
│   └── store.ts
├── bash-parser.ts           # 【新】Bash AST 解析
├── markdown.ts              # 【新】Markdown 终端渲染
├── tools/
│   ├── web.ts               # 【新】web_fetch + web_search
│   └── ... (existing)
└── ... (existing)
```

## Correctness Properties

### Phase 8
- **P20**: Context Collapse 保持 tool_use/tool_result 配对完整性
- **P21**: 压缩后恢复的文件路径来自 pre-compression 历史
- **P22**: 缓存命中率计算正确（cacheRead / (cacheRead + cacheCreation)）

### Phase 9
- **P23**: 技能懒加载——启动时只读 frontmatter，不读完整内容
- **P24**: 任务依赖检查——有未完成依赖的任务不可执行
- **P25**: 并发工具 Bash 级联中止——Bash 失败取消兄弟 Bash，不取消 read-only

### Phase 10
- **P26**: Bash AST 解析——命令替换内的危险命令被检测到
- **P27**: web_fetch 只允许 HTTPS URL
- **P28**: Markdown 渲染幂等——渲染已渲染的文本不产生额外标记

## Testing Strategy

每个 Phase 新增 ~30-40 个测试，目标总计 ~500 个。

| Phase | 新增测试 | 累计 |
|-------|----------|------|
| 8 | ~35 (collapse + recovery + cache) | ~420 |
| 9 | ~35 (skills + tasks + executor) | ~455 |
| 10 | ~45 (parser + web + markdown + e2e) | ~500 |
