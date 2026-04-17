# Task 6: CLI 交互界面

> 对应需求: 8.1-8.7, 12.4-12.5
> 分支: `phase-1/minimal-skeleton`
> 提交: `83c6922`（与 Task 5 同一提交）

## 做了什么

实现了用户与 Agent 交互的界面层：参数解析、REPL 循环、终端 UI 输出。

### CLI 入口 (`src/index.ts`)

```typescript
#!/usr/bin/env node

async function main() {
  const args = parseArgs();
  validateApiKey(args.provider);
  const agent = new Agent({ provider, model, yolo, effectiveContextWindow });

  if (args.prompt) {
    await agent.chat(args.prompt);  // 一次性模式
  } else {
    await runRepl(agent);           // 交互模式
  }
}
```

两种运行模式：
- **一次性模式**：`mini-claude "fix the bug in index.ts"` → 执行后退出
- **REPL 模式**：`mini-claude` → 进入交互循环

### 参数解析 (`parseArgs`)

手动解析 `process.argv`，不引入 Commander.js（减少依赖）：

```bash
mini-claude --provider openai --model gpt-4o --yolo "fix the bug"
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--provider` | `anthropic` | AI 提供商 |
| `--model` | 由提供商决定 | 模型名称 |
| `--yolo` | `false` | 跳过确认 |
| `--resume` | `false` | 恢复会话 |
| 位置参数 | — | 一次性 prompt |

### REPL 循环 (`runRepl`)

```
Mini Claude Code — type your message, /clear, /cost, or Ctrl+C to exit

> 读取 src/index.ts 的内容
  🔧 read_file {"file_path":"src/index.ts"}
  ✓ read_file: #!/usr/bin/env node...
这个文件是 CLI 的入口点，它做了以下几件事...

> /clear
Conversation cleared.

> /cost
Token usage: 1,234 input + 567 output = 1,801 total
Estimated cost: $0.0042

> (Ctrl+C)
Press Ctrl+C again to exit
> (Ctrl+C)
Goodbye!
```

**Ctrl+C 处理**：
- Agent 处理中 → 中止当前操作，返回提示符
- 空闲状态 → 第一次提示"再按一次退出"，第二次退出

### 终端 UI (`src/ui.ts`)

使用 `chalk` 实现彩色输出：

```typescript
// 工具调用 — 黄色 + 🔧 图标
printToolCall('read_file', { file_path: 'test.ts' });
// →   🔧 read_file {"file_path":"test.ts"}

// 工具结果 — 灰色，截断到 500 字符
printToolResult('read_file', longContent);
// →   ✓ read_file: 1 | console.log("hello")...

// AI 文本 — 绿色，流式输出
printAssistantText('Let me read that file.');
// → Let me read that file.（逐字符出现）
```

**显示截断 vs 上下文保留**：`printToolResult` 只显示前 500 字符，但完整结果保留在模型的消息历史中。这是一个重要的 UX 设计——用户不需要看到 500 行的文件内容，但模型需要。

## 对应 Claude Code 的概念

Claude Code 的 CLI 层使用 **React + Ink** 构建终端 UI（自定义渲染器约 1MB），支持：
- 组件化状态管理
- 权限确认对话框
- 流式代码高亮
- 嵌套工具进度指示器
- Vim 模式

Mini 版用 `readline + chalk`，约 100 行代码。当你想加权限确认对话框、进度条、代码高亮时，就理解了为什么 Claude Code 需要一个完整的 React 渲染层。

## 测试覆盖

9 个 CLI 参数解析测试：
- ✅ 默认值
- ✅ 各参数独立解析
- ✅ 参数组合
- ✅ 位置参数拼接为 prompt
- ✅ 未知参数忽略

```bash
pnpm test  # ✅ 108 tests passed
```

## 本地手动测试

### 前置条件

```bash
cp .env.example .env
# 编辑 .env，填入至少一个 API Key
pnpm run build
```

### 测试参数解析

```bash
# 默认提供商 (anthropic)
node dist/index.js "hello"

# 指定提供商
node dist/index.js --provider deepseek "你好"

# 指定模型
node dist/index.js --provider openai --model gpt-4o-mini "hello"

# 缺少 API Key 时的错误提示
ANTHROPIC_API_KEY= node dist/index.js "hello"
# 预期：Error: API key not set. Please set the ANTHROPIC_API_KEY...

# 未知提供商
node dist/index.js --provider unknown "hello"
# 预期：Error: Unknown provider: "unknown". Supported providers: ...
```

### 测试 REPL 模式

```bash
node dist/index.js --provider deepseek
# 预期输出：
#   Provider: deepseek | Model: deepseek-chat
#   Mini Claude Code — type your message, /clear, /cost, or Ctrl+C to exit
#
#   >

# 在 > 提示符后测试：
> 你好                    # 普通对话
> /clear                  # 清空历史
> /cost                   # 显示 token 用量
> /compact                # 触发压缩（Phase 2 实现前会提示 not implemented）
> /unknown                # 未知命令提示
> （空回车）              # 跳过，继续等待输入
> Ctrl+C                  # 第一次：提示再按一次退出
> Ctrl+C                  # 第二次：退出
```

### 测试一次性模式

```bash
# 执行后自动退出
node dist/index.js --provider deepseek "1+1等于几"
# 预期：模型回答后程序退出，不进入 REPL
```
