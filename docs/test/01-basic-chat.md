# 测试 01: 基础对话

## 前置条件

```bash
pnpm run build
# .env 中至少配置一个 API Key
```

## 测试场景

### 1.1 一次性模式（One-shot）

```bash
node dist/index.js --provider deepseek "1+1等于几"
```

**预期**：
- 显示 `Provider: deepseek | Model: deepseek-chat`
- 模型回答后程序自动退出
- 不进入 REPL

### 1.2 REPL 交互模式

```bash
node dist/index.js --provider deepseek
```

**预期**：
- 显示 `Code CLI — type your message, /clear, /cost, or Ctrl+C to exit`
- 显示 `> ` 提示符
- 输入消息后模型回复，然后继续等待输入

### 1.3 流式输出

```bash
node dist/index.js --provider deepseek
> 用 100 字介绍什么是 Agent Loop
```

**预期**：
- 文本逐字出现（流式），不是等全部生成完才显示
- 文本为绿色

### 1.4 多轮对话

```bash
node dist/index.js --provider deepseek
> 我叫小明
> 我叫什么名字？
```

**预期**：
- 第二轮模型能回忆起"小明"（证明消息历史正确累积）

### 1.5 Ctrl+C 中断

```bash
node dist/index.js --provider deepseek
> 写一篇 1000 字的文章
# 在模型生成过程中按 Ctrl+C
```

**预期**：
- 显示 `⏹ Aborted`
- 返回 `> ` 提示符，不退出程序

### 1.6 Ctrl+C 退出

```bash
node dist/index.js --provider deepseek
> （空闲状态，按 Ctrl+C）
# 显示 "Press Ctrl+C again to exit"
> （再按 Ctrl+C）
# 显示 "Goodbye!" 并退出
```

### 1.7 缺少 API Key

```bash
ANTHROPIC_API_KEY= node dist/index.js "hello"
```

**预期**：
- 显示红色错误：`Error: API key not set. Please set the ANTHROPIC_API_KEY environment variable.`
- 程序退出

### 1.8 未知提供商

```bash
node dist/index.js --provider unknown "hello"
```

**预期**：
- 显示红色错误：`Error: Unknown provider: "unknown". Supported providers: ...`
