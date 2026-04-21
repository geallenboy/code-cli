# Xiaomi Code — 测试指南

> 本目录包含所有功能的手动测试流程，帮助你验证每个模块是否正常工作。

## 前置条件

```bash
# 1. 安装依赖
pnpm install

# 2. 构建项目
pnpm run build

# 3. 配置 API Key（至少填一个）
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

## 自动化测试

```bash
pnpm test              # 运行全部 384 个测试
pnpm test:watch        # 监听模式（开发时用）
pnpm test:coverage     # 覆盖率报告
pnpm run check-all     # typecheck + lint + test 一键质量门
```

## 手动测试文档

| 文档 | 覆盖功能 | 需要 API Key |
|------|----------|-------------|
| [01-basic-chat.md](./01-basic-chat.md) | 基础对话、一次性模式、REPL 模式 | ✅ |
| [02-tools.md](./02-tools.md) | 6 个工具（读/写/编辑/搜索/列表/Shell） | 部分 |
| [03-providers.md](./03-providers.md) | 5 个提供商切换 | ✅ |
| [04-safety.md](./04-safety.md) | 危险命令检测、权限确认、Yolo 模式 | 部分 |
| [05-compression.md](./05-compression.md) | 三级压缩、/compact 命令 | ✅ |
| [06-session.md](./06-session.md) | 会话保存、--resume 恢复 | ✅ |
| [07-memory.md](./07-memory.md) | /remember、/memory、记忆系统 | ❌ |
| [08-plan-mode.md](./08-plan-mode.md) | /plan、只读模式、计划审批 | ✅ |
| [09-commands.md](./09-commands.md) | 所有斜杠命令汇总 | 部分 |
