# Phase 13: Bash AST 增强安全分析 (v2.3.0)

> Task 59-60 | 分支: `phase-13/tree-sitter-ast`

## 概述

增强 Bash 命令安全分析：从 15 个检查扩展到 23 个，
新增 AST 解析器支持 heredoc、进程替换、算术展开、花括号展开。

## 新增模块

```
src/bash-ast/
├── parser.ts    # 增强 AST 解析器（tree-sitter 接口兼容）
├── walker.ts    # AST 遍历器 + 命令提取
├── checks.ts    # 23 个静态安全检查
└── index.ts     # 公共 API
```

## 核心实现

### 1. BashAstParser (`src/bash-ast/parser.ts`)

增强的 Bash 命令解析器：

- 懒加载（不影响启动时间）
- 检测 heredoc (`<<EOF`)
- 检测进程替换 (`<()` / `>()`)
- 检测算术展开 (`$(())`)
- 检测花括号展开 (`{a,b,c}`)
- 降级机制（P32）：解析失败回退到 bash-parser.ts

### 2. AstWalker (`src/bash-ast/walker.ts`)

AST 遍历器：

- `extractCommands()` — 提取所有命令信息
- `extractCommandNames()` — 提取命令名称（去重）
- `hasCommand()` — 检查特定命令
- `getSubshellCommands()` — 获取子 shell 中的命令
- 追踪上下文：子 shell、管道、嵌套深度

### 3. 23 个安全检查 (`src/bash-ast/checks.ts`)

原有 15 个 + 新增 8 个：

| # | 检查 | 说明 |
|---|------|------|
| 1-15 | 原有检查 | 系统路径、SSH、递归删除、提权等 |
| 16 | heredoc_injection | Heredoc 内容管道到 shell |
| 17 | process_substitution | 进程替换检测 |
| 18 | arithmetic_injection | 算术展开中的命令替换 |
| 19 | alias_override | 覆盖常用命令别名 |
| 20 | history_manipulation | Shell 历史操作 |
| 21 | crontab_modification | Crontab 修改 |
| 22 | docker_escape | Docker 逃逸（--privileged, -v /） |
| 23 | network_listen | 网络监听（nc, socat, http.server） |

## 正确性属性

**P32**: tree-sitter 解析失败时回退到 regex 解析器

## 测试

38 个新增测试 (`tests/unit/bash-ast.test.ts`)：

| 测试组 | 数量 | 覆盖 |
|--------|------|------|
| BashAstParser 基础解析 | 8 | 空命令、简单命令、管道、链式 |
| 增强语法检测 | 4 | heredoc、进程替换、算术、花括号 |
| P32 降级机制 | 2 | 正常解析、复杂命令 |
| AstWalker | 5 | 命令提取、管道、链式、hasCommand |
| 原有检查 (1-15) | 6 | 系统路径、SSH、递归删除、提权、管道到 shell |
| 新增检查 (16-23) | 10 | 进程替换、别名、历史、crontab、Docker、网络 |
| 综合测试 | 3 | 安全命令、多重违规、降级标志 |

## 统计

| 指标 | 数值 |
|------|------|
| 新增源文件 | 4 |
| 新增测试 | 38 |
| 总测试数 | 661 |
| 安全检查 | 15 → 23 |
| check-all | ✅ 通过 |
