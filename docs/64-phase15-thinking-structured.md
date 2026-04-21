# Phase 15: Extended Thinking + Structured Output (v3.0.0)

> Task 64-67 | 分支: `phase-15/extended-thinking`

## 概述

实现 Extended Thinking 支持和 Structured Output，
完成 v4 全部 5 个高级特性，达到 90%+ 特性覆盖。

## 新增模块

```
src/thinking.ts           # Extended Thinking 参数注入 + token 追踪
src/structured-output.ts  # JSON 输出验证 + Schema 验证
```

## 核心实现

### 1. Extended Thinking (`src/thinking.ts`)

- `supportsThinking()` — 检查提供商支持
- `modelSupportsThinking()` — 检查模型支持
- `createThinkingConfig()` — 创建配置（budget + disabled）
- `injectThinkingParams()` — 注入 API 参数
- `extractThinkingContent()` — 从响应提取 thinking
- `formatThinkingDisplay()` — 可折叠格式显示
- Thinking token 单独追踪和统计

P34: 非 Anthropic 提供商静默忽略 thinking 参数。

### 2. Structured Output (`src/structured-output.ts`)

- `validateJsonOutput()` — JSON 格式验证
- `validateWithSchema()` — Zod schema 验证
- `extractJson()` — 从文本中提取 JSON（支持 markdown 代码块）
- `createStructuredOutputConfig()` — 配置管理

### 3. CLI 集成

- `--thinking-budget <n>` — 配置 thinking token 预算（默认 10000）
- `--no-thinking` — 禁用 thinking
- `--json` — 请求 JSON 输出

## 正确性属性

**P34**: 非 Anthropic 提供商忽略 thinking 参数

## 测试

39 个新增测试 (`tests/unit/thinking.test.ts`)

## 统计

| 指标 | 数值 |
|------|------|
| 新增源文件 | 2 |
| 新增测试 | 39 |
| 总测试数 | 742 |
| check-all | ✅ 通过 |
