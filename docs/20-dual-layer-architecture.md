# Task 20: 双层架构重构

> 对应需求: v2-1
> 分支: `phase-4/architecture-upgrade`
> 提交: `bfbdaeb`

## 做了什么

将 v1 的单层 `Agent.chat()` while(true) 循环拆分为双层 Generator 架构：

```
v1:  Agent.chat() → while(true) { streamText → tools → inject }
v2:  QueryEngine.chat() → for await (event of query()) { handle event }
       ↓                        ↓
     会话层                   循环层 (async generator)
     消息持久化               API 调用
     token 累计               工具执行
     预算检查                 错误恢复
     用户输入                 压缩触发
```

### 为什么要拆？

v1 的 `chat()` 方法里混杂了两类完全不同的关注点：
- **会话层**："这个会话花了多少钱？该不该继续？消息要不要保存？"
- **循环层**："这一轮 API 返回了什么？工具执行成功了吗？需要压缩吗？"

当你想加预算控制、会话恢复、权限追踪时，单层循环会变得臃肿。双层分离让每层只关心自己的事。

### 关键设计：async generator 连接

```typescript
// query.ts — 内层循环，yield 事件，return 终止状态
export async function* query(params): AsyncGenerator<StreamEvent, Terminal> {
  while (true) {
    // ... API 调用、工具执行 ...
    yield { type: 'text', text: chunk };      // 流式文本
    yield { type: 'tool_call', ... };          // 工具调用
    yield { type: 'usage', inputTokens, outputTokens }; // token 用量
    return { reason: 'complete' };             // 循环结束
  }
}

// query-engine.ts — 外层会话，消费 generator
const generator = query(params);
while (true) {
  const { value, done } = await generator.next();
  if (done) break;  // Terminal
  switch (value.type) {
    case 'text': printAssistantText(value.text); break;
    case 'usage': this.totalInputTokens += value.inputTokens; break;
  }
}
```

### 向后兼容

`agent.ts` 保留为包装器，委托给 QueryEngine。所有 174 个现有测试零修改通过。

### 新增类型

```typescript
type StreamEvent = { type: 'text' } | { type: 'tool_call' } | { type: 'usage' } | ...
interface Terminal { reason: 'complete' | 'aborted' | 'max_turns' | ... }
type ContinueReason = 'next_turn' | 'ptl_recovery' | 'mot_escalation' | 'mot_continuation'
interface QueryEngineConfig extends AgentConfig { maxTurns?: number; maxBudgetUsd?: number }
```

## 对应 Claude Code 的概念

Claude Code 的 `QueryEngine.ts`（1,295 行）和 `query.ts`（1,729 行）通过 async generator 连接，与我们的设计完全一致。区别在于 Claude Code 的 QueryEngine 还处理 8 个生命周期阶段（setup → orphaned permission → input → system init → local cmd → main loop → budget → result），我们简化为 3 个（input → loop → save）。

## 本地手动测试

```bash
pnpm run build

# 功能不变，但内部架构已重构
node dist/index.js --provider deepseek "读取 package.json"
# 预期：与 v1 完全相同的行为

# 验证向后兼容
pnpm test  # ✅ 174 tests passed
```
