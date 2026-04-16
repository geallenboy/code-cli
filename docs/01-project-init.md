# Task 1: 项目初始化与工程基础搭建

> 对应需求: 1, 14.1, 14.10, 15.9
> 分支: `phase-1/minimal-skeleton`
> 提交: `9d087d1`

## 做了什么

从零搭建项目的工程基础，包括三个子任务：

### 1.1 项目结构与构建配置

**创建了 `package.json`**：
- 使用 pnpm 作为包管理器
- 设置 `"type": "module"` 启用 ES Module
- 配置 `bin` 字段让项目可以作为 CLI 工具安装
- 所有依赖使用最新版本（2025 年 9 月）

**创建了 `tsconfig.json`**：
```json
{
  "compilerOptions": {
    "strict": true,        // 严格类型检查
    "target": "ES2022",    // 现代 JS 特性
    "module": "Node16",    // Node.js ESM 模块系统
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]      // Node.js 类型定义
  }
}
```

**创建了 15 个源文件骨架**：每个文件包含模块级 JSDoc 注释和 placeholder 导出，确保 TypeScript 编译通过。

### 1.2 测试框架配置

选择 **Vitest** 而非 Jest，原因：
- 原生 TypeScript 支持，无需 `ts-jest` 转换
- 原生 ESM 支持，与项目的 `"type": "module"` 一致
- 速度快（基于 Vite 的转换管线）
- API 与 Jest 兼容，学习成本低

配置了三个测试脚本：
```bash
pnpm test           # 单次运行
pnpm test:watch     # 监听模式（开发时用）
pnpm test:coverage  # 覆盖率报告
```

### 1.3 自定义错误类

实现了三个错误类，对应 Claude Code 的"错误是数据，不是异常"理念：

| 错误类 | 用途 | 关键属性 |
|--------|------|----------|
| `ToolExecutionError` | 工具执行失败 | `toolName`, `cause` |
| `ApiCommunicationError` | API 通信失败 | `statusCode`, `isRetryable` |
| `ConfigurationError` | 配置错误（如缺少 API Key） | — |

**设计决策**：为什么不用 generic `Error`？

类型化的错误类让你可以在 `catch` 块中精确判断错误类型并采取不同策略：
- `ToolExecutionError` → 转为工具结果反馈给模型，让模型自行修正
- `ApiCommunicationError` + `isRetryable: true` → 指数退避重试
- `ConfigurationError` → 直接退出程序，给出清晰提示

## 对应 Claude Code 的概念

Claude Code 的 512K+ 行代码中，错误处理是一个核心设计主题。它的"错误隐藏"（Error Withholding）策略意味着可恢复的错误不会暴露给用户——Agent 自己消化。我们的三个错误类是这个理念的最小实现。

## 验证

```bash
pnpm run build  # ✅ TypeScript 编译 0 错误
pnpm test       # ✅ 1 个 smoke test 通过
```
