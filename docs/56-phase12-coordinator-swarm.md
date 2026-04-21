# Phase 12: Coordinator/Swarm 多 Agent 协调 (v2.2.0)

> Task 56-58 | 分支: `phase-12/coordinator-swarm`

## 概述

实现两种高级多 Agent 协作模式：
- **Coordinator**: 纯指挥官模式，4 阶段工作流
- **Swarm**: 对等协作模式，通过 Mailbox 通信

## 新增模块

```
src/coordinator/
├── coordinator.ts   # Coordinator 模式（4 阶段工作流）
├── worktree.ts      # Git Worktree 隔离
└── index.ts         # 公共 API

src/swarm/
├── swarm.ts         # Swarm 管理器
├── mailbox.ts       # 消息邮箱系统
├── agent.ts         # Swarm Agent 实例
└── index.ts         # 公共 API
```

## 核心实现

### 1. Coordinator 模式 (`src/coordinator/coordinator.ts`)

4 阶段工作流：

1. **Research** — 使用 explore 子 Agent 探索代码库
2. **Synthesize** — Coordinator 分析结果，制定计划
3. **Implement** — 分配实现任务给 general 子 Agent（并行）
4. **Verify** — 使用 explore 子 Agent 验证结果

核心约束（P30）：Coordinator 不能直接使用文件/Shell 工具，所有操作通过子 Agent 执行。

```typescript
const coord = new Coordinator(config);
const result = await coord.run('Refactor authentication module');
// result.phases: { research, synthesize, implement, verify }
// result.tasks: CoordinatorTask[]
```

### 2. Git Worktree 隔离 (`src/coordinator/worktree.ts`)

为每个子 Agent 创建独立的 Git Worktree：

- Slug 验证（安全边界）：最大 64 字符，禁止路径遍历
- 自动创建/清理 worktree
- 无更改时自动删除，有更改时保留供用户决定

### 3. Mailbox 消息系统 (`src/swarm/mailbox.ts`)

Agent 间异步消息传递：

- `send(from, to, content)` — 发送消息
- `receive(agentName, timeout)` — 阻塞接收（支持超时）
- `peek(agentName)` — 查看不消费
- 消息隔离（P31）：Agent 只能读取自己的消息
- 异步交付：等待中的接收者立即获得新消息

### 4. Swarm Agent (`src/swarm/agent.ts`)

独立的协作 Agent 实例：

- 独立 QueryEngine（独立上下文窗口）
- 独立消息队列（通过 Mailbox）
- 角色描述注入到提示词
- 完成时通知 coordinator

### 5. Swarm Manager (`src/swarm/swarm.ts`)

管理多个对等 Agent 的生命周期：

- 注册/注销 Agent（最大数量限制）
- 并行任务分配（Promise.allSettled）
- 结果收集和汇总
- 完整的 run() 工作流

### 6. CLI 集成

- `--coordinator` 启动标志
- `--swarm` 启动标志

## 正确性属性

- **P30**: Coordinator 不能直接使用文件/Shell 工具
- **P31**: Swarm 消息不跨 Agent 泄露（隔离性）

## 测试

45 个新增测试：

| 测试文件 | 数量 | 覆盖 |
|----------|------|------|
| coordinator.test.ts | 12 | Worktree slug 验证、任务管理、阶段流转、P30 |
| swarm.test.ts | 33 | Mailbox FIFO、隔离性、异步交付、Agent 生命周期、Manager 注册 |

## 对应 Claude Code 概念

| 本项目 | Claude Code |
|--------|-------------|
| Coordinator 4 阶段 | Coordinator pattern (Research→Synthesize→Implement→Verify) |
| WorktreeManager | src/utils/worktree.ts |
| Mailbox | Named mailbox communication |
| SwarmAgent | Swarm team agent |
| SwarmManager | Swarm orchestrator |

## 统计

| 指标 | 数值 |
|------|------|
| 新增源文件 | 7 |
| 新增测试 | 45 |
| 总测试数 | 623 |
| check-all | ✅ 通过 |
