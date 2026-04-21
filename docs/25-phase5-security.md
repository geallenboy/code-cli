# Task 25-28: Phase 5 — 安全与工具

> 分支: `phase-5/security-and-tools`
> 标签: `v0.5.0`

## 做了什么

4 个安全和工具系统升级，将防御从 2 层提升到 4 层。

### Task 25: 权限规则系统 (`src/permissions.ts`)

```
规则来源（优先级从高到低）：
  1. 用户设置: ~/.xiaomi-code/settings.json
  2. 项目设置: .xiaomi-code/settings.json
  3. 会话规则: "always allow" 生成

匹配模式：
  精确: Bash(npm test)        — 完全匹配
  前缀: Bash(git:*)           — 前缀匹配
  通配: Bash(git *)           — 通配符匹配

评估顺序（deny-first）：
  deny 匹配 → 立即拒绝（不受 allow 影响）
  allow 匹配 → 自动放行
  ask 匹配 → 强制确认
  无匹配 → 回退到默认行为
```

### Task 26: 工具安全语义 (`ToolSafetyMetadata`)

| 工具 | isReadOnly | isConcurrencySafe | isDestructive |
|------|-----------|-------------------|---------------|
| read_file | ✅ | ✅ | ❌ |
| grep_search | ✅ | ✅ | ❌ |
| list_files | ✅ | ✅ | ❌ |
| write_file | ❌ | ❌ | ❌ |
| edit_file | ❌ | ❌ | ❌ |
| run_shell | ❌ | ❌ | 动态 |
| **未知工具** | ❌ | ❌ | ❌ | ← fail-closed

### Task 27: StreamingToolExecutor

```
工具状态: queued → executing → completed → yielded

并发规则:
  isConcurrencySafe=true 的工具 → 可并行
  isConcurrencySafe=false 的工具 → 独占执行
```

### Task 28: 增强 Bash 安全

新增结构化命令解析：
- `parseCompoundCommand()`: 拆分管道/链/序列
- `hasCommandSubstitution()`: 检测 `$()` 和反引号
- `hasSystemPathRedirection()`: 检测 `> /etc/` 等
- `hasObfuscation()`: 检测 `base64 -d | sh` 等

新增危险模式：chmod, chown, curl|sh, npm publish, export PATH

## 测试覆盖

68 个新增测试（权限 17 + 安全语义 8 + 执行器 8 + Shell 30 + 增强 5）

```bash
pnpm test  # ✅ 294 tests passed
```
