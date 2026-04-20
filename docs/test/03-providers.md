# 测试 03: 多提供商切换

## 前置条件

在 `.env` 中配置对应的 API Key。

## 测试场景

### 3.1 Anthropic（默认）

```bash
node dist/index.js "hello"
```

**预期**：`Provider: anthropic | Model: claude-sonnet-4-20250514`

### 3.2 OpenAI

```bash
node dist/index.js --provider openai "hello"
```

**预期**：`Provider: openai | Model: gpt-4o`

### 3.3 Google

```bash
node dist/index.js --provider google "hello"
```

**预期**：`Provider: google | Model: gemini-2.5-flash`

### 3.4 DeepSeek

```bash
node dist/index.js --provider deepseek "你好"
```

**预期**：`Provider: deepseek | Model: deepseek-chat`

### 3.5 智谱

```bash
node dist/index.js --provider zhipu "你好"
```

**预期**：`Provider: zhipu | Model: glm-4-plus`

### 3.6 自定义模型

```bash
node dist/index.js --provider openai --model gpt-4o-mini "hello"
```

**预期**：`Provider: openai | Model: gpt-4o-mini`

### 3.7 工具调用兼容性

对每个提供商测试工具调用是否正常：

```bash
node dist/index.js --provider deepseek "读取 package.json 的 name 字段"
node dist/index.js --provider openai "读取 package.json 的 name 字段"
```

**预期**：Agent 调用 read_file 工具并正确回答（不同提供商的工具调用格式由 AI SDK 统一处理）
