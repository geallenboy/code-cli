# Task 4: 工具注册表与基础工具

> 对应需求: 3.1-3.4, 5.1-5.2, 6.1-6.4, 7.5, 12.9
> 分支: `phase-1/minimal-skeleton`
> 提交: `71c7c97`

## 做了什么

实现了工具系统的核心：统一的工具注册表 + 3 个 Phase 1 基础工具。

### 4.1 工具注册表 (`src/tools/index.ts`)

**核心设计：Vercel AI SDK 的 `tool()` 函数 + Zod Schema**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const readFileTool = tool({
  description: 'Read the contents of a file with line numbers...',
  inputSchema: z.object({
    file_path: z.string().describe('The path to the file to read'),
  }),
  execute: async ({ file_path }) => {
    return truncateResult(readFileContent(file_path));
  },
});
```

这里有三个关键设计决策：

1. **Zod Schema 而非 JSON Schema**：Vercel AI SDK 原生集成 Zod，一份 schema 同时提供运行时验证和 TypeScript 类型推导。模型返回的参数会自动通过 Zod 验证，无效输入在到达执行函数之前就被拦截。

2. **`execute` 函数内 try/catch**：工具执行中的任何错误都被捕获并转为字符串返回给模型。这就是"错误是数据"理念的实践——模型看到错误消息后可以自行修正（比如换一个文件路径）。

3. **`truncateResult()` 截断**：工具结果超过 50,000 字符时，保留首尾各半 + 截断指示器。防止单个工具结果撑爆上下文窗口。

```typescript
export function truncateResult(result: string, maxChars = 50_000): string {
  if (result.length <= maxChars) return result;
  const half = Math.floor(maxChars / 2);
  const omitted = result.length - maxChars;
  return result.slice(0, half) +
    `\n\n... [truncated ${omitted} characters] ...\n\n` +
    result.slice(-half);
}
```

### 4.2 read_file (`src/tools/file-ops.ts`)

```typescript
export function readFileContent(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const maxLineNumWidth = String(lines.length).length;
  return lines
    .map((line, index) => {
      const lineNum = String(index + 1).padStart(maxLineNumWidth, ' ');
      return `${lineNum} | ${line}`;
    })
    .join('\n');
}
```

**为什么加行号？** 模型在后续的 `edit_file` 操作中需要引用具体位置。行号让模型和用户都能精确定位代码。右对齐的行号（`  1 |`、` 10 |`、`100 |`）保持视觉整齐。

**文件不存在时返回错误消息字符串**，而不是抛出异常。这让模型可以看到"File not found: xxx"并尝试其他路径。

### 4.3 write_file (`src/tools/editor.ts`)

```typescript
export function writeFile(filePath: string, content: string): string {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });  // 自动创建父目录
  writeFileSync(filePath, content, 'utf-8');
  return `File written: ${filePath} (${lines} lines)`;
}
```

`recursive: true` 是关键——模型可能要创建 `src/utils/helpers.ts`，但 `src/utils/` 目录不存在。自动创建父目录让模型不需要先执行 `mkdir`。

### 4.4 run_shell (`src/tools/shell.ts`)

```typescript
export function executeShellCommand(command: string, timeout = 30_000): string {
  try {
    return execSync(command, {
      timeout,                          // 30 秒超时
      maxBuffer: 5 * 1024 * 1024,       // 5MB 输出上限
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],  // 捕获 stdin/stdout/stderr
    });
  } catch (error) {
    // 超时 → 返回超时消息 + 部分输出
    // 非零退出 → 返回 exit code + stdout + stderr
  }
}
```

三种失败模式的处理：
- **命令成功**（exit 0）→ 返回 stdout
- **命令失败**（exit ≠ 0）→ 返回 `Exit code: N\nSTDOUT:\n...\nSTDERR:\n...`
- **命令超时** → 返回 `Command timed out after 30000ms\nPartial output:\n...`

## 对应 Claude Code 的概念

Claude Code 的工具系统（`src/Tool.ts` + `src/tools.ts`）是整个架构中最复杂的部分之一：

| 特性 | Claude Code | Mini Claude Code |
|------|-------------|------------------|
| 工具数量 | 66+ | 3（Phase 1）→ 6（Phase 2） |
| 声明方式 | `Tool` 泛型接口 + `buildTool()` 工厂 | AI SDK `tool()` + Zod |
| 组装管线 | 3 层（编译时裁剪 → 运行时过滤 → 合并排序） | 简单 Record |
| 并发控制 | `isReadOnly()` + `isConcurrencySafe()` 声明式 | 无（串行执行） |
| 大结果处理 | >100K 自动存盘，模型只拿摘要 + 路径 | >50K 截断首尾 |
| 安全检查 | 8 阶段管线（查找→验证→权限→执行→结果→Hook→发射） | try/catch 包装 |

**Claude Code 的 `Tool` 接口有约 20 个字段和方法**，每个都在统一管线中扮演角色：
- `isReadOnly()` → 告诉权限系统是否可以跳过确认
- `isConcurrencySafe()` → 告诉 StreamingToolExecutor 是否可以并行
- `shouldDefer` → 告诉 API 层是否延迟发送 schema（节省 token）

Mini 版不需要这些——3 个工具串行执行就够了。但当你想加并行执行时，就理解了为什么需要声明式的并发安全标记。

## 测试覆盖

34 个新增单元测试：

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `tools.test.ts` | 8 | 工具注册完整性、truncateResult 截断逻辑 |
| `file-ops.test.ts` | 8 | 文件读取、行号格式、文件不存在处理 |
| `editor.test.ts` | 8 | 文件写入、父目录创建、覆写 |
| `shell.test.ts` | 10 | 命令执行、失败处理、超时 |

```bash
pnpm test  # ✅ 72 tests passed
```

## 本地手动测试

这些工具函数可以直接在 Node REPL 中测试，不需要 API Key：

```bash
pnpm run build

# 测试 read_file — 读取一个已知文件
node -e "
  import('./dist/tools/file-ops.js').then(m => {
    console.log(m.readFileContent('package.json'));
  });
"
# 预期：显示 package.json 内容，每行带行号

# 测试 read_file — 文件不存在
node -e "
  import('./dist/tools/file-ops.js').then(m => {
    console.log(m.readFileContent('nonexistent.txt'));
  });
"
# 预期：Error: File not found: nonexistent.txt

# 测试 write_file — 创建文件
node -e "
  import('./dist/tools/editor.js').then(m => {
    console.log(m.writeFile('/tmp/test-mini-claude.txt', 'hello world'));
  });
"
# 预期：File written: /tmp/test-mini-claude.txt (1 lines)

# 测试 run_shell — 执行命令
node -e "
  import('./dist/tools/shell.js').then(m => {
    console.log(m.executeShellCommand('echo hello'));
  });
"
# 预期：hello

# 测试 run_shell — 命令失败
node -e "
  import('./dist/tools/shell.js').then(m => {
    console.log(m.executeShellCommand('ls /nonexistent'));
  });
"
# 预期：Exit code: 2 + STDERR 信息

# 测试 truncateResult — 截断
node -e "
  import('./dist/tools/index.js').then(m => {
    const long = 'x'.repeat(60000);
    const result = m.truncateResult(long);
    console.log('原始长度:', long.length, '截断后:', result.length);
    console.log('包含截断指示器:', result.includes('[truncated'));
  });
"
# 预期：原始 60000，截断后 ≤50000，包含截断指示器 true
```
