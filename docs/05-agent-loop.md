# Task 5: Agent Loop 核心循环

> 对应需求: 4.1-4.7, 12.1-12.3
> 分支: `phase-1/minimal-skeleton`
> 提交: `83c6922`

## 做了什么

实现了整个项目的灵魂——Agent Loop。这是 Claude Code 架构中最核心的部分：一个 `while(true)` 循环，驱动"调用模型 → 执行工具 → 注入结果"的自主编程流程。

### 核心循环：`chat()` 方法

```
用户输入 → push 到消息历史
    ↓
while (true) {
    调用 streamText (AI SDK)
        ↓
    流式输出文本到终端
        ↓
    收集工具调用列表
        ↓
    工具调用为空？ → break（任务完成）
        ↓
    打印工具调用信息
        ↓
    将工具结果注入消息历史
        ↓
    继续循环
}
```

### Vercel AI SDK 的 `streamText` 用法

```typescript
const result = streamText({
  model: this.modelInstance,      // LanguageModel 实例
  system: systemPrompt,           // 系统提示词
  messages: this.messages,        // 对话历史
  tools: getToolDefinitions(),    // 工具定义（带 execute 函数）
  stopWhen: stepCountIs(1),       // 每次只执行一步，手动控制循环
  abortSignal: controller.signal, // 中止信号
});

// 流式消费文本
for await (const chunk of result.textStream) {
  printAssistantText(chunk);  // 实时输出到终端
}

// 获取工具调用结果
const toolCalls = await result.toolCalls;
const toolResults = await result.toolResults;
```

**关键设计决策：`stopWhen: stepCountIs(1)` vs `maxSteps: 25`**

AI SDK 支持 `maxSteps` 让 SDK 自动处理多轮工具调用。但我们选择 `stepCountIs(1)` + 手动循环，原因：
1. **学习目的**：手动循环让你看到每一步发生了什么
2. **控制力**：可以在每轮之间插入自定义逻辑（权限检查、压缩触发、用户确认）
3. **对标 Claude Code**：Claude Code 的 `while(true)` 循环也是手动控制的

### 消息格式（AI SDK v6）

AI SDK v6 使用 `ModelMessage` 类型（不是 v4 的 `CoreMessage`）：

```typescript
// 用户消息
{ role: 'user', content: 'Read test.ts' }

// 助手消息（可包含文本 + 工具调用）
{ role: 'assistant', content: [
  { type: 'text', text: 'Let me read that file.' },
  { type: 'tool-call', toolCallId: 'tc1', toolName: 'read_file', input: { file_path: 'test.ts' } }
]}

// 工具结果消息
{ role: 'tool', content: [
  { type: 'tool-result', toolCallId: 'tc1', toolName: 'read_file', output: { type: 'text', value: '...' } }
]}
```

### 指数退避重试 (`withRetry`)

```typescript
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableError(error) || attempt === maxRetries) throw error;
      // 延迟 = min(1s * 2^attempt, 30s) + 随机抖动
      const delay = Math.min(1000 * 2 ** attempt, 30000) + Math.random() * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

**可重试错误码**：429（限流）、503（服务不可用）、529（过载）
**不可重试错误码**：400（请求错误）、401（认证失败）

随机抖动（jitter）防止"惊群效应"——多个客户端同时被限流后，如果都在完全相同的时间重试，会再次触发限流。

## 对应 Claude Code 的概念

| 特性 | Claude Code | Mini Claude Code |
|------|-------------|------------------|
| 架构 | 双层 Generator（QueryEngine + query()） | 单层 while(true) |
| 错误恢复 | 7 个 Continue Site | 基本重试 + 中止 |
| 流式处理 | StreamingToolExecutor 并行执行 | 串行执行 |
| 错误隐藏 | 可恢复错误不暴露给用户 | 直接报告 |
| Token 追踪 | 5 种 token 类型（含缓存） | 2 种（input + output） |

**为什么 Claude Code 需要双层架构？**

- **QueryEngine**（外层）：管理会话生命周期——持久化、预算检查、用户中断、权限追踪
- **query()**（内层）：管理单次循环——API 调用、工具执行、错误恢复、压缩触发

Mini 版只有一层，所有逻辑都在 `chat()` 方法里。当你想加会话恢复、预算控制、权限追踪时，就会发现单层循环变得臃肿——这就是分层的动机。

## 测试覆盖

26 个新增测试：

| 类别 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `isRetryableError` | 11 | 状态码判断、fallback 检查、边界值 |
| `withRetry` | 8 | 成功/重试/不重试/耗尽/中止 |
| `Agent` 类 | 7 | 循环终止、token 累计、工具调用、清空历史 |

```bash
pnpm test  # ✅ 108 tests passed
```
