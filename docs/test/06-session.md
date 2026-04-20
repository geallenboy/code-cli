# 测试 06: 会话持久化

## 测试场景

### 6.1 自动保存

```bash
node dist/index.js --provider deepseek
> 你好，我在做一个测试项目
> Ctrl+C Ctrl+C  # 退出

# 检查会话文件
ls ~/.mini-claude/sessions/
```

**预期**：看到 `session-*.json` 文件

### 6.2 查看会话内容

```bash
cat ~/.mini-claude/sessions/$(ls -t ~/.mini-claude/sessions/ | head -1)
```

**预期**：JSON 格式，包含 `id`、`startTime`、`cwd`、`messages` 数组

### 6.3 恢复会话

```bash
# 1. 创建会话
node dist/index.js --provider deepseek
> 记住这个数字：42
> Ctrl+C Ctrl+C

# 2. 恢复会话
node dist/index.js --provider deepseek --resume
> 我之前让你记住的数字是什么？
```

**预期**：
- 显示 `Resumed session: session-xxx`
- 模型能回忆起数字 42

### 6.4 无会话时恢复

```bash
# 清空会话目录
rm -rf ~/.mini-claude/sessions/
node dist/index.js --provider deepseek --resume
```

**预期**：显示 `No previous session found.`，正常进入 REPL
