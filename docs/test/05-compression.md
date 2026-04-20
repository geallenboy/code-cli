# 测试 05: 上下文压缩

## A. 不需要 API Key 的直接测试

### 5.1 Snip 压缩

```bash
node -e "
import('./dist/compactor/snip.js').then(m => {
  const msgs = [
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'old', toolName: 'read_file', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'old', toolName: 'read_file', output: { type: 'text', value: 'x'.repeat(15000) } }] },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'r1', toolName: 'read_file', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'r1', toolName: 'read_file', output: { type: 'text', value: 'recent1' } }] },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'r2', toolName: 'read_file', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'r2', toolName: 'read_file', output: { type: 'text', value: 'recent2' } }] },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'r3', toolName: 'read_file', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'r3', toolName: 'read_file', output: { type: 'text', value: 'recent3' } }] },
  ];
  const result = m.snipCompact(msgs);
  console.log('Tokens freed:', result.tokensFreed);
  const old = result.messages[1].content[0].output.value;
  console.log('Snipped:', old.includes('[snipped'));
  console.log('Recent preserved:', result.messages[3].content[0].output.value === 'recent1');
});
"
```

**预期**：`Tokens freed: >3000`，`Snipped: true`，`Recent preserved: true`

### 5.2 shouldAutoCompact 阈值

```bash
node -e "
import('./dist/compactor/auto.js').then(m => {
  console.log('79%:', m.shouldAutoCompact(79000, 100000));  // false
  console.log('80%:', m.shouldAutoCompact(80000, 100000));  // false
  console.log('81%:', m.shouldAutoCompact(81000, 100000));  // true
});
"
```

**预期**：79% false，80% false，81% true

## B. 需要 API Key 的端到端测试

### 5.3 /compact 命令

```bash
node dist/index.js --provider deepseek
> 你好
> 帮我读取 package.json
> 帮我读取 tsconfig.json
> /compact
```

**预期**：`Conversation compacted.`（对话被压缩为摘要）

### 5.4 /cost 查看 token 变化

```bash
node dist/index.js --provider deepseek
> 你好
> /cost
# 记录 token 数
> 帮我读取 package.json
> /cost
# token 数应该增加
> /compact
> /cost
# 压缩后 token 数可能不变（累计值），但下次 API 调用的 input 会减少
```
