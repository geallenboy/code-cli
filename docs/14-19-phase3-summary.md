# Task 14-19: Phase 3 — 高级特性与质量保障

> 对应需求: 2.5, 8.9, 13.1-13.3, 15.1-15.8
> 分支: `phase-3/advanced-features`
> 标签: `v0.3.0`

## 做了什么

Phase 3 完成了 6 个任务，将 Agent 从"能用"打磨到"好用"。

### Task 14: CLAUDE.md 层级加载

```typescript
export function loadClaudeMd(): string {
  const parts: string[] = [];
  let dir = process.cwd();
  while (true) {
    const claudePath = resolve(dir, 'CLAUDE.md');
    if (existsSync(claudePath)) {
      parts.unshift(readFileSync(claudePath, 'utf-8')); // 祖先优先
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return parts.join('\n\n---\n\n');
}
```

从当前目录向上遍历到根目录，收集所有 CLAUDE.md。`unshift` 确保祖先内容在前。这让团队可以在仓库根目录放通用规则，子目录放特定规则。

### Task 15: Yolo 模式 + `/clear` `/cost`

- **Yolo 模式**：`--yolo` 跳过所有确认，通过 `ToolContext.yolo` 传递到工具层
- **`/cost`**：显示 token 用量 + 基于 Anthropic Sonnet 定价的成本估算
- **`/clear`**：重置对话历史

### Task 16: 流式输出与显示截断

- `printToolResult` 截断到 500 字符显示，完整结果保留在模型上下文
- `printCost` 格式化显示 input/output/total tokens + 美元成本

### Task 17: ESLint + Prettier 代码质量

```bash
pnpm run lint        # ESLint TypeScript strict 规则
pnpm run format      # Prettier 格式化
pnpm run typecheck   # tsc --noEmit 类型检查
pnpm run check-all   # typecheck + lint + test 一键质量门
```

ESLint 配置要点：
- `@typescript-eslint/no-explicit-any: 'error'` — 禁止 any
- `@typescript-eslint/no-unused-vars` — 允许 `_` 前缀的未使用参数
- 测试文件允许 `!` 非空断言（测试中常用）

### Task 18: 完整测试覆盖

新增 `tests/unit/ui.test.ts`（7 个测试），现在每个源文件都有对应的测试文件。

## 最终项目状态

| 指标 | 数值 |
|------|------|
| 测试数 | 174 |
| 工具数 | 6 |
| 提供商 | 5 (Anthropic/OpenAI/Google/DeepSeek/智谱) |
| 源文件 | 15 |
| 测试文件 | 13 |
| 文档 | 15 篇 |

## 本地手动测试

```bash
pnpm run build

# CLAUDE.md 层级加载
echo "Always use TypeScript" > CLAUDE.md
node dist/index.js --provider deepseek "你知道这个项目的规则吗？"
# 预期：模型会提到 CLAUDE.md 中的规则

# /cost 命令
node dist/index.js --provider deepseek
> 你好
> /cost
# 预期：Token usage: X input + Y output = Z total
#        Estimated cost: $0.XXXX

# Yolo 模式
node dist/index.js --provider deepseek --yolo "执行 rm -rf /tmp/test"
# 预期：直接执行，不弹确认

# 质量门
pnpm run check-all
# 预期：typecheck ✅ → lint ✅ → test ✅
```
