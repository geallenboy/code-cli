# Task 10: 危险命令检测与用户确认

> 对应需求: 4.8, 6.5, 6.6, 6.7, 7.6
> 分支: `phase-2/core-enhancement`
> 提交: `b1b0832`

## 做了什么

实现了 2 层安全防御：正则检测 + 用户确认。

### 架构设计：ToolContext 注入

```
Agent 创建 ToolContext { yolo, confirm, confirmedCommands }
    ↓
传给 getToolDefinitions(ctx)
    ↓
run_shell 的 execute 函数内部：
    needsConfirmation('run_shell', { command }) → 危险？
        ↓ 是
    ctx.yolo? → 跳过确认
    ctx.confirmedCommands.has(command)? → 跳过确认
    ctx.confirm(message) → 终端提示 [y/N]
        ↓ 用户拒绝
    返回 "User denied this action" 给模型
```

**关键设计**：确认逻辑不在工具函数内硬编码，而是通过 `ToolContext` 注入。这让测试可以 mock confirm 回调，也让 yolo 模式可以绕过确认。

### 危险命令模式

```typescript
const DANGEROUS_PATTERNS = [
  /\brm\s/,                                    // rm 命令
  /\bgit\s+(push|reset|clean|checkout\s+\.)/,  // 破坏性 git
  /\bsudo\b/,                                  // 权限提升
  /\bmkfs\b/, /\bdd\s/, />\s*\/dev\//,         // 磁盘操作
  /\bkill\b/, /\bpkill\b/,                     // 终止进程
  /\breboot\b/, /\bshutdown\b/,                // 系统操作
];
```

### 会话级白名单

用户确认一次后，相同命令加入 `confirmedCommands` Set，后续不再重复询问。这是 Claude Code 的设计——避免同一个 `npm test` 每次都弹确认。

## 对应 Claude Code 的概念

| 层级 | Claude Code | Code CLI |
|------|-------------|------------------|
| 1 | 权限规则匹配（allowedTools） | — |
| 2 | Bash AST 分析（tree-sitter） | 正则模式匹配 |
| 3 | 23 个静态安全检查 | — |
| 4 | ML 分类器（yoloClassifier） | — |
| 5 | 用户确认对话框 | readline [y/N] 提示 |

Claude Code 用 tree-sitter 解析 Bash AST 是因为正则无法处理 `$(echo rm) -rf /` 这种命令注入。Mini 版的正则检测足够应对常见场景，但无法防御刻意绕过。

## 测试覆盖

6 个新增测试：危险命令检测、安全命令放行、非 shell 工具、sudo/git push、缺失参数

```bash
pnpm test  # ✅ 141 tests passed
```

## 本地手动测试

```bash
pnpm run build

# 测试危险命令确认（需要 API Key）
node dist/index.js --provider deepseek "执行 rm -rf /tmp/test-dir 命令"
# 预期：
#   🔧 run_shell {"command":"rm -rf /tmp/test-dir"}
#   ⚠️  Dangerous command detected: rm -rf /tmp/test-dir
#   Allow? [y/N]
#   输入 N → Agent 收到 "User denied" 并尝试其他方式

# 测试 yolo 模式（跳过确认）
node dist/index.js --provider deepseek --yolo "执行 rm -rf /tmp/test-dir 命令"
# 预期：直接执行，不弹确认

# 测试安全命令（不弹确认）
node dist/index.js --provider deepseek "执行 echo hello 命令"
# 预期：直接执行，不弹确认

# 直接测试 needsConfirmation 函数（不需要 API Key）
node -e "
  import('./dist/tools/shell.js').then(m => {
    console.log('rm:', m.needsConfirmation('run_shell', { command: 'rm -rf /' }));
    console.log('echo:', m.needsConfirmation('run_shell', { command: 'echo hi' }));
    console.log('sudo:', m.needsConfirmation('run_shell', { command: 'sudo apt install' }));
    console.log('git push:', m.needsConfirmation('run_shell', { command: 'git push' }));
    console.log('git status:', m.needsConfirmation('run_shell', { command: 'git status' }));
  });
"
# 预期：rm/sudo/git push 返回警告消息，echo/git status 返回 null
```
