# Task 12: 会话持久化

> 对应需求: 10.1-10.4
> 分支: `phase-2/core-enhancement`
> 提交: `affa96f`（与 Task 11 同一提交）

## 做了什么

实现了会话的自动保存和恢复——关闭终端后可以恢复之前的工作进度。

### 存储位置

```
~/.code-cli/sessions/
├── session-1713456789.json
├── session-1713456800.json
└── ...
```

### 自动保存

每次 `chat()` 完成后（在 `finally` 块中），自动保存当前会话：

```typescript
finally {
  saveSession(this.sessionId, {
    id: this.sessionId,
    startTime: new Date().toISOString(),
    cwd: process.cwd(),
    messages: this._messages,
  });
  this._isProcessing = false;
}
```

### 恢复会话

```bash
# 恢复最近的会话
node dist/index.js --provider deepseek --resume
# 预期：Resumed session: session-1713456800
#        之前的对话上下文已恢复
```

`loadLatestSession()` 按文件名排序取最新的（session ID 包含时间戳，天然有序）。

### 损坏文件处理

JSON 解析失败时返回 `null`，不影响程序运行。

## 测试覆盖

6 个测试：保存/加载往返、最新会话、不存在的会话、损坏文件、复杂消息结构

## 本地手动测试

```bash
pnpm run build

# 1. 创建一个会话
node dist/index.js --provider deepseek
> 你好，我在做一个项目
> 帮我读取 package.json
> Ctrl+C Ctrl+C  # 退出

# 2. 检查会话文件
ls ~/.code-cli/sessions/
# 预期：看到 session-*.json 文件

# 3. 恢复会话
node dist/index.js --provider deepseek --resume
# 预期：Resumed session: session-xxx
> 刚才我们在做什么？
# 预期：模型能回忆起之前的对话内容
```
