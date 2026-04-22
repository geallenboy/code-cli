# CLI 用户体验深度差距分析 v2：Code CLI vs Claude Code

> 基于 v3.1.0 实际代码和 Claude Code 12 章 UX 设计的逐层对比

---

## 核心问题诊断

v3.1.0 做了很多"功能点"（Markdown 渲染、Diff、多行输入等），但用户体验差距依然明显。根本原因不是缺功能，而是**交互范式的差异**：

| 维度 | Claude Code | Code CLI v3.1.0 |
|------|------------|-----------------|
| 渲染模型 | React 声明式 + 差分更新 | console.log 命令式追加 |
| 输出方式 | 原地更新（覆盖上一帧） | 只能追加，无法回退修改 |
| 布局引擎 | Yoga Flexbox（自动换行、嵌套） | 无布局，手动拼字符串 |
| 状态管理 | React state + context | 散落在各函数中 |

这意味着：即使我们实现了所有功能点，**视觉呈现方式**本身就不同。Claude Code 的 UI 是"一个不断刷新的画面"，Code CLI 的 UI 是"一行行追加的日志"。

---

## 逐项差距分析（按用户感知影响排序）

### 1. 工具调用的视觉呈现 — 差距最大

**Claude Code 的体验：**
- 工具调用时显示一个**状态指示点** `●`，执行中闪烁，完成变绿，失败变红
- 多个工具并行时，所有 `●` **同步闪烁**（数学同步，不是协调器）
- 工具参数**流式显示**（模型还在输出参数时就能看到）
- 工具结果**内联渲染**（不是追加到下面，而是在工具调用区域内展开）
- Bash 工具的 stdout **实时流式输出**（npm install 的每一行都实时可见）

**Code CLI v3.1.0 的体验：**
```
🔧 edit_file                    ← 黄色图标 + 工具名
  file_path: src/index.ts       ← dim 参数摘要
  ↳ File edited: src/index.ts   ← dim 结果（截断到 500 字符）
```

**差距：**
- 没有执行状态指示（用户不知道工具正在执行还是已完成）
- 没有流式参数显示（等工具执行完才一次性显示）
- Bash 工具没有实时 stdout 流（等命令跑完才显示全部输出）
- 结果显示太简陋（一行 dim 文本，没有结构化渲染）

### 2. 流式输出的视觉质量 — 差距大

**Claude Code 的体验：**
- Markdown 增量解析：稳定前缀 memoize，只重新解析尾部增长的块
- 代码块在流式过程中就有**边框和背景色**
- 流式输出时 Spinner 自动隐藏，输出结束后 Spinner 恢复
- 输出区域和输入区域**视觉分离**（不同背景/边框）

**Code CLI v3.1.0 的体验：**
- Markdown 渲染是行级的（完整行才渲染，不完整行暂存）
- 代码块没有边框/背景色，只有语法高亮
- Spinner 和文本输出在同一行混合（Spinner 写 stderr，文本写 stdout）
- 没有视觉分区，所有内容混在一起

**差距：**
- 代码块缺少视觉边界（没有 `┌──` 边框或背景色）
- 输出和输入没有视觉分离
- 流式过程中的视觉反馈不够丰富

### 3. 权限确认的交互质量 — 差距中等

**Claude Code 的体验：**
- 权限对话框是一个**独立的 UI 组件**，有边框、按钮、焦点管理
- 显示完整的命令内容 + 风险分析 + 建议规则
- 200ms 防误触 + 视觉倒计时
- 分类器运行时有 shimmer 动画（"正在判断是否需要确认"）

**Code CLI v3.1.0 的体验：**
```
⚠ Permission Required
  Tool: shell
  Risk: Dangerous command detected: rm -rf
  [y]es  [n]o  [a]lways
Allow? [y/N]
```

**差距：**
- 没有边框/面板感，就是几行文本
- 没有分类器 shimmer 动画
- 防误触延迟期间的视觉反馈不够明显

### 4. 欢迎屏幕和启动体验 — 差距中等

**Claude Code 的体验：**
- 启动时显示 ASCII art logo
- 显示版本号、模型、工作目录
- 显示 CLAUDE.md 中的项目规则摘要
- 显示可用的快捷键提示

**Code CLI v3.1.0 的体验：**
```
📁 code-cli
🔀 master (3 uncommitted changes)
🤖 deepseek / deepseek-chat

Code CLI — type your message, /clear, /cost, or Ctrl+C to exit
  Alt+Enter for newline, Enter to submit
```

**差距：**
- 没有 logo/品牌感
- 没有显示快捷键列表
- 没有显示项目规则摘要

### 5. 成本显示 — 差距小

**Claude Code 的体验：**
- 分模型统计 + cache read/write
- 精度分级（>$0.50 保留 2 位，否则 4 位）
- 显示 API 耗时和 wall-clock 耗时

**Code CLI v3.1.0 的体验：**
- 基础 token + 成本估算
- 有缓存命中率显示

**差距：** 基本够用，缺少耗时统计和精度分级

---

## 可行的改进方案（不引入 React/Ink）

核心约束：我们不打算引入 React + Ink（那是 251KB 的自定义渲染器），而是在现有 chalk + console.log 基础上最大化视觉质量。

### 方案 1：Box Drawing — 用 Unicode 边框提升结构感

```
╭─ 🔧 edit_file ──────────────────────────────╮
│  file_path: src/index.ts                     │
│  old_string: const x = 1;                    │
│  new_string: const x = 2;                    │
╰──────────────────────────────────────────────╯
  ✅ File edited: src/index.ts (+1 -1)

╭─ 💻 run_shell ──────────────────────────────╮
│  command: npm test                           │
│                                              │
│  > vitest run                                │  ← 实时 stdout
│  ✓ 42 tests passed                           │
╰──────────────────────────────────────────────╯
  ✅ Exit code: 0 (2.3s)
```

### 方案 2：代码块边框 + 背景

```
  ╭─ typescript ───────────────────────────────╮
  │ const greeting = "hello";                  │
  │ console.log(greeting);                     │
  ╰────────────────────────────────────────────╯
```

### 方案 3：工具执行状态行

```
  ⠋ edit_file src/index.ts...          ← 执行中（spinner）
  ✅ edit_file src/index.ts (0.1s)      ← 完成（绿色勾）
  ❌ run_shell npm test (1.2s)          ← 失败（红色叉）
```

### 方案 4：Bash 实时 stdout 流

当前 `run_shell` 等命令执行完才返回全部输出。改为流式输出：
- 使用 `child_process.spawn` 替代 `execSync`
- 实时将 stdout/stderr 写到终端
- 用缩进区分命令输出和 Agent 输出

### 方案 5：启动 Banner

```
  ╭──────────────────────────────────────╮
  │  Code CLI v3.1.0                     │
  │  📁 code-cli  🔀 master             │
  │  🤖 deepseek / deepseek-chat        │
  │                                      │
  │  快捷键:                             │
  │  Enter 提交 · Alt+Enter 换行         │
  │  Ctrl+C 中止 · Ctrl+R 搜索历史       │
  │  Tab 补全路径 · /help 查看命令        │
  ╰──────────────────────────────────────╯
```

### 方案 6：每轮结束后的状态栏

```
  ─── 1.2K tokens · $0.0012 · 3.2s ───
```

---

## 优先级排序

### P0 — 视觉质量飞跃（做了立刻感觉不同）

1. **工具调用 Box Drawing** — 用 Unicode 边框包裹工具调用和结果，最大的视觉提升
2. **代码块边框** — 代码块加 `╭╮╰╯` 边框 + 语言标签
3. **工具执行状态行** — spinner → ✅/❌ 状态转换，显示耗时
4. **启动 Banner** — 边框 + 快捷键提示

### P1 — 交互质量提升

5. **Bash 实时 stdout** — spawn 替代 execSync，实时流式输出
6. **每轮状态栏** — token 用量 + 成本 + 耗时
7. **权限对话框 Box Drawing** — 边框 + 更清晰的布局
8. **/help 命令** — 显示所有可用命令和快捷键

### P2 — 细节打磨

9. **输出/输入视觉分隔线**
10. **成本精度分级**
11. **API 耗时统计**
