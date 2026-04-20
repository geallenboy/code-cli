# 测试 08: 计划模式

## A. 不需要 API Key 的直接测试

### 8.1 只读 Shell 命令判断

```bash
node -e "
import('./dist/plan-mode.js').then(m => {
  const cmds = ['git log', 'git diff HEAD', 'cat file.ts', 'ls -la', 'rm file', 'npm install', 'git push', 'git commit'];
  cmds.forEach(c => console.log(c.padEnd(20), m.isReadOnlyShellCommand(c) ? '✅ READ-ONLY' : '❌ WRITE'));
});
"
```

**预期**：
```
git log              ✅ READ-ONLY
git diff HEAD        ✅ READ-ONLY
cat file.ts          ✅ READ-ONLY
ls -la               ✅ READ-ONLY
rm file              ❌ WRITE
npm install          ❌ WRITE
git push             ❌ WRITE
git commit           ❌ WRITE
```

### 8.2 计划模式工具列表

```bash
node -e "import('./dist/plan-mode.js').then(m => console.log('Plan tools:', m.getPlanModeTools()))"
```

**预期**：`['read_file', 'grep_search', 'list_files', 'run_shell']`（不含 write_file/edit_file）

### 8.3 状态转换

```bash
node -e "
import('./dist/plan-mode.js').then(m => {
  let s = m.createPlanModeState();
  console.log('初始:', s.active);
  s = m.enterPlanMode(s, true);
  console.log('进入:', s.active, 'saved yolo:', s.prePlanPermissionMode.yolo);
  s = m.exitPlanMode(s, 'My plan');
  console.log('退出:', s.active, 'plan:', s.planText);
});
"
```

**预期**：`初始: false` → `进入: true saved yolo: true` → `退出: false plan: My plan`

## B. 需要 API Key 的端到端测试

### 8.4 进入计划模式

```bash
node dist/index.js --provider deepseek
> /plan
```

**预期**：
- `[PLAN MODE] Entering plan mode — read-only tools only`
- 提示符变为 `[PLAN]>`

### 8.5 计划模式下的交互

```bash
[PLAN]> 分析 src 目录的结构
```

**预期**：Agent 使用 read_file/list_files/grep_search 探索代码，不使用 write/edit 工具

### 8.6 /status 查看模式

```bash
[PLAN]> /status
```

**预期**：显示 `Plan mode: active`
