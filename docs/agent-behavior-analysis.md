# Agent 行为问题分析：为什么写个冒泡排序要调 12 次工具

## 问题现象

用户输入"写一段冒泡排序"，Agent 的行为：

1. `list_files .` — 查看项目结构
2. `read_file package.json` — 查看项目语言
3. `write_file bubble-sort.ts` — 写 TypeScript 版本
4. `write_file test-bubble-sort.js` — 写 JavaScript 测试
5. `list_files .` — 再次查看目录（重复）
6. `read_file bubble-sort.ts` — 读刚写的文件（重复）
7. `run_shell npx tsx bubble-sort.ts` — 运行代码
8. `list_files .` — 第三次查看目录（重复）
9. `read_file bubble-sort.ts` — 第三次读同一文件（重复）
10. `run_shell npx tsx bubble-sort.ts` — 第二次运行（重复）
11. `list_files .` — 第四次查看目录（重复）
12. `read_file bubble-sort.ts` — 第四次读同一文件（重复）
13. 用户 Ctrl+C 中止

**核心问题：Agent 陷入了"写 → 读 → 运行 → 再读 → 再运行"的无限循环。**

## 根因分析

### 1. System Prompt 缺少"完成即停"指令

当前 system prompt 的 Behavioral Guidelines 说：

> "Verify your work: After making changes, read the modified file to confirm the edit was applied correctly. Run tests if available."

这条规则让 Agent 在写完文件后**必须**读回来验证，然后**必须**运行测试。但 DeepSeek 等模型对"验证完成后应该停止"的理解不够强，导致验证后又触发新一轮的"查看 → 读取 → 运行"。

**Claude Code 的做法**：system prompt 中有明确的"任务完成后立即停止"指令，并且有 `stepCountIs(1)` 限制每次 API 调用只执行一步。

### 2. 缺少 maxTurns 的合理默认值

当前 `maxTurns` 默认 50，对于"写个冒泡排序"这种简单任务来说太大了。Agent 有 50 轮的预算，所以它不着急停下来。

**Claude Code 的做法**：有 `maxTurns` 限制，但更重要的是模型本身被训练为在任务完成后停止调用工具。

### 3. 缺少重复工具调用检测

Agent 连续 4 次调用 `list_files .` 和 `read_file bubble-sort.ts`，这是明显的重复。系统应该检测到这种模式并提前终止。

**Claude Code 的做法**：虽然没有显式的重复检测，但 Claude 模型本身很少陷入这种循环。对于其他模型（如 DeepSeek），需要在系统层面添加保护。

### 4. System Prompt 对简单任务过度指导

"Read before edit"、"Verify your work"、"Run tests if available" 这些规则对复杂编程任务有用，但对"写个冒泡排序"这种简单任务来说是过度的。Agent 不需要先 `list_files` 再 `read_file package.json` 来决定用什么语言——用户没指定语言时直接用项目的主语言就行。

## 解决方案

### 方案 1：优化 System Prompt（最重要）

```markdown
## Behavioral Guidelines

1. **Be concise**: Complete the task with the minimum number of tool calls. 
   Don't explore the project structure unless the task requires it.
2. **Stop when done**: Once the task is complete, provide a summary and STOP. 
   Do NOT read back files you just wrote. Do NOT run code unless the user asked.
3. **Read before edit**: When EDITING existing files, read them first. 
   When CREATING new files, just write them directly.
4. **No redundant calls**: Never call the same tool with the same arguments twice 
   in the same conversation.
5. **Simple tasks, simple responses**: For simple requests like "write a function", 
   just write the code and explain it. Don't create test files, don't run the code, 
   don't verify the output unless asked.
```

### 方案 2：添加重复工具调用检测

在 `query.ts` 的循环中，检测连续相同的工具调用并提前终止：

```typescript
// 检测重复工具调用
const recentCalls: string[] = [];
// ... 在工具调用后：
const callKey = `${toolName}:${JSON.stringify(args)}`;
if (recentCalls.includes(callKey)) {
  // 注入提示："你已经调用过这个工具了，请完成任务。"
}
recentCalls.push(callKey);
```

### 方案 3：降低 maxTurns 默认值

从 50 降到 20 或 10。大多数任务不需要 50 轮工具调用。

### 方案 4：添加"任务完成"检测

在每轮工具调用后，检查模型的文本输出是否包含"完成"、"done"等关键词，如果是则不再继续循环。

## 优先级

1. **P0：优化 System Prompt** — 最直接有效，改一个文件就能大幅改善
2. **P1：重复工具调用检测** — 防止无限循环的安全网
3. **P2：降低 maxTurns** — 简单但有效的兜底
4. **P3：任务完成检测** — 更智能但实现复杂
