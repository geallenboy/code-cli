# Task 11: 上下文压缩

> 对应需求: 9.1-9.5
> 分支: `phase-2/core-enhancement`
> 提交: `affa96f`

## 做了什么

实现了单级自动摘要压缩——当 token 使用量超过上下文窗口的 85% 时，自动请求模型生成对话摘要并替换历史。

### shouldCompact — 阈值判断

```typescript
export function shouldCompact(inputTokens: number, effectiveWindow: number): boolean {
  return inputTokens > effectiveWindow * 0.85;
}
```

### compactConversation — 摘要压缩

```
原始历史（N 条消息）
    ↓ generateText 生成摘要
[summary user msg] + [assistant ack] + [最后一条 user msg]
    = 3 条消息
```

摘要 prompt 要求保留：关键决策、修改的文件路径、当前任务进度、遇到的错误。

**优雅降级**：如果摘要 API 调用失败，返回原始消息不做任何修改。

### 集成到 Agent Loop

```typescript
// 每轮工具执行后检查
if (shouldCompact(this.totalInputTokens, this._config.effectiveContextWindow)) {
  this._messages = await compactConversation(this._messages, this.modelInstance);
}
```

`/compact` 命令手动触发，不受阈值限制。

## 对应 Claude Code 的概念

| 级别 | Claude Code | Mini Claude Code |
|------|-------------|------------------|
| 1 | Snip（零成本，删除旧工具结果） | — |
| 2 | Microcompact（近零成本，压缩单个结果） | — |
| 3 | Context Collapse（中等成本，折叠消息段） | — |
| 4 | Autocompact（全成本，模型生成摘要） | ✅ 单级摘要 |

Mini 版只有第 4 级。当你发现每次压缩都要等 API 返回时，就理解了为什么 Claude Code 先尝试零成本的 Snip 和 Microcompact。

## 测试覆盖

13 个测试：阈值边界、少于 4 条跳过、摘要生成、API 失败降级、最后消息保留

## 本地手动测试

```bash
pnpm run build

# 测试 /compact 命令（需要 API Key）
node dist/index.js --provider deepseek
> 你好
> 帮我读取 package.json
> /compact
# 预期：Conversation compacted.（对话被压缩为摘要）
> /cost
# 预期：token 数量应该比压缩前少
```
