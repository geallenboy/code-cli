# 测试 09: 所有斜杠命令

## 命令汇总

```bash
node dist/index.js --provider deepseek
```

### /clear — 清空对话

```
> 你好
> /clear
```

**预期**：`Conversation cleared.`

### /cost — 显示 token 用量

```
> 你好
> /cost
```

**预期**：
```
Token usage: X input + Y output = Z total
Estimated cost: $0.XXXX (based on Anthropic Sonnet pricing)
```

### /compact — 手动压缩

```
> 你好
> 帮我读取 package.json
> /compact
```

**预期**：`Conversation compacted.`

### /remember — 创建记忆

```
> /remember 测试用 Vitest 不是 Jest
```

**预期**：`Memory saved: feedback-... [feedback]`

### /memory — 列出记忆

```
> /memory
```

**预期**：列出所有记忆或 `No memories stored.`

### /plan — 进入计划模式

```
> /plan
```

**预期**：`[PLAN MODE] Entering plan mode`，提示符变为 `[PLAN]>`

### /status — 会话状态

```
> /status
```

**预期**：
```
Session Status:
  Messages: N
  Tokens: X
  Tokens: [████░░░░░░] 5% (X/200,000)
  Plan mode: inactive
```

### /rules — 权限规则

```
> /rules
```

**预期**：`Permission Rules: (No rules configured)`

### 未知命令

```
> /unknown
```

**预期**：`Unknown command: /unknown`

### 空输入

```
> （直接回车）
```

**预期**：跳过，继续等待输入
