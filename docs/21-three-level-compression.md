# Task 21: 三级渐进压缩管线

> 对应需求: v2-2
> 分支: `phase-4/architecture-upgrade`
> 提交: `a0bad83`

## 做了什么

将 v1 的单级 Autocompact 升级为三级渐进管线：Snip → Micro → Auto。

### 为什么要三级？

v1 只有一级：token 超限 → 调用模型生成摘要。问题：
1. **每次压缩都要 API 调用**（慢 + 贵）
2. **摘要不可逆地丢失细节**
3. **很多情况下只需要删掉旧的大工具结果就够了**

三级管线的核心思想：**先用最轻量的方式释放空间，只在必要时才用重量级压缩**。

### 三级对比

| 级别 | 文件 | 成本 | 触发条件 | 做什么 |
|------|------|------|----------|--------|
| **Snip** | `compactor/snip.ts` | 零 | 每轮自动 | >10K 字符的旧工具结果（>3 轮前）→ 首尾 200 字符 + 占位符 |
| **Micro** | `compactor/micro.ts` | 零 | 每轮自动 | >5 轮前的工具结果 → 压缩到 500 字符 + [compressed] |
| **Auto** | `compactor/auto.ts` | 全 | token >80% | 模型生成摘要，保留最近 3 轮 + 最后 user 消息 |

### 关键设计

**Snip 保留首尾**：模型可能需要回忆"那个文件开头是什么"或"结尾有什么"，首尾 200 字符通常包含文件头和最后的导出。

**Micro 的 500 字符**：足够保留工具结果的关键信息（如"File edited: src/agent.ts (replaced 3 lines)"），但去掉了大段的文件内容。

**Auto 的断路器**：连续 3 次 autocompact 失败后停止尝试。Claude Code 的生产数据显示，没有断路器时一个会话可能浪费 3,272 次连续失败的 API 调用。

```typescript
if (consecutiveFailures >= 3) {
  return { messages, failed: true }; // 断路器触发，不再尝试
}
```

### 管线执行顺序

```typescript
// 每轮工具执行后，按序执行三级
const snipResult = snipCompact(state.messages);     // 1. 零成本
const microResult = microCompact(state.messages);    // 2. 零成本
if (shouldAutoCompact(tokens, window)) {             // 3. 仅在需要时
  const autoResult = await autoCompact(messages, model, failures);
}
```

## 对应 Claude Code 的概念

Claude Code 有 5 级：Snip → Microcompact → Context Collapse → Autocompact + Tool Result Budget。我们实现了最高价值的 3 级，跳过了 Context Collapse（投影式折叠，实现复杂度高但收益有限）和 Tool Result Budget（与 Snip 功能重叠）。

## 测试覆盖

16 个新增测试：
- Snip: 7 个（>10K 截断、最近 3 轮保护、<=10K 不动、token 计算、ID 保留）
- Micro: 6 个（>5 轮压缩、最近保护、<=500 不动、ID 保留、空列表）
- Auto: 3 个（断路器触发、断路器未触发、向后兼容导出）

```bash
pnpm test  # ✅ 190 tests passed
```

## 本地手动测试

```bash
pnpm run build

# 直接测试 Snip（不需要 API Key）
node -e "
  import('./dist/compactor/snip.js').then(m => {
    const msgs = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'old', toolName: 'read_file', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'old', toolName: 'read_file', output: { type: 'text', value: 'x'.repeat(15000) } }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'r1', toolName: 'read_file', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'r1', toolName: 'read_file', output: { type: 'text', value: 'recent' } }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'r2', toolName: 'read_file', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'r2', toolName: 'read_file', output: { type: 'text', value: 'recent' } }] },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'r3', toolName: 'read_file', input: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'r3', toolName: 'read_file', output: { type: 'text', value: 'recent' } }] },
    ];
    const result = m.snipCompact(msgs);
    console.log('Tokens freed:', result.tokensFreed);
    const oldOutput = result.messages[1].content[0].output.value;
    console.log('Snipped:', oldOutput.includes('[snipped'));
  });
"
# 预期：Tokens freed > 3000, Snipped: true
```
