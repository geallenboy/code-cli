# Task 9: 文件搜索与浏览工具

> 对应需求: 5.3, 5.4, 5.5, 5.6
> 分支: `phase-2/core-enhancement`
> 提交: `9a854ab`

## 做了什么

实现了 `grepSearch()` 和 `listFiles()` — Agent 理解代码库的搜索能力。

### grep_search — 递归内容搜索

```typescript
grepSearch('useState', 'src/', '*.tsx')
// → src/components/App.tsx:3:import { useState } from 'react';
//   src/components/Form.tsx:7:  const [value, setValue] = useState('');
```

实现方式：调用系统 `grep -rn` 命令，自动排除 `node_modules`、`.git`、`dist` 等目录。

**为什么用系统 grep 而不是纯 JS 实现？** 系统 grep 经过几十年优化，处理大型代码库比 JS 逐行读取快得多。Claude Code 更进一步，使用 `ripgrep`（Rust 实现的 grep），速度比系统 grep 还快 2-5 倍。

**结果上限 100 行**：防止搜索 `import` 这种高频词时返回几千行结果撑爆上下文。超出时显示 `... (N more matches omitted, M total)`。

### list_files — 项目结构浏览

```typescript
listFiles('*.ts', 'src/')
// → agent.ts
//   cli.ts
//   prompt.ts
//   tools/index.ts
//   tools/file-ops.ts
```

递归遍历目录，支持后缀过滤（`*.ts`），排除常见构建目录，最多返回 200 个文件。

## 对应 Claude Code 的概念

| 特性 | Claude Code | GearCode |
|------|-------------|------------------|
| 搜索引擎 | ripgrep（Rust） | 系统 grep |
| 文件列表 | glob 库 | 手动递归 + 后缀匹配 |
| 结果上限 | 动态调整 | 固定 100/200 |

## 测试覆盖

11 个新增测试：grep 匹配/无匹配/行号/过滤 + list 列表/过滤/子目录/排除/空目录

```bash
pnpm test  # ✅ 135 tests passed
```

## 本地手动测试

```bash
pnpm run build

# grep_search — 搜索当前项目中的 "export function"
node -e "
  import('./dist/tools/file-ops.js').then(m => {
    console.log(m.grepSearch('export function', '.', '*.ts'));
  });
"
# 预期：列出所有 .ts 文件中的 export function 行

# grep_search — 过滤特定文件类型
node -e "
  import('./dist/tools/file-ops.js').then(m => {
    console.log(m.grepSearch('TODO', '.'));
  });
"

# list_files — 列出所有 TypeScript 文件
node -e "
  import('./dist/tools/file-ops.js').then(m => {
    console.log(m.listFiles('*.ts', 'src'));
  });
"
# 预期：src/ 下所有 .ts 文件的相对路径

# list_files — 列出所有文件
node -e "
  import('./dist/tools/file-ops.js').then(m => {
    console.log(m.listFiles('.', '.'));
  });
"

# 端到端测试（需要 API Key）
node dist/index.js --provider deepseek "列出 src 目录下所有 TypeScript 文件"
# 预期：Agent 调用 list_files，然后总结项目结构

node dist/index.js --provider deepseek "在项目中搜索所有包含 TODO 的地方"
# 预期：Agent 调用 grep_search，然后列出所有 TODO 位置
```
