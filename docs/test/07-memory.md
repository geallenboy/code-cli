# 测试 07: 记忆系统

> 不需要 API Key（记忆存储是本地操作）

## 测试场景

### 7.1 创建记忆

```bash
node dist/index.js --provider deepseek
> /remember 我喜欢用 Vitest 而不是 Jest
```

**预期**：`Memory saved: feedback-我喜欢用-vitest-而不是-jest.md [feedback]`

### 7.2 列出记忆

```bash
> /memory
```

**预期**：
```
Memories (1):
  [feedback] feedback-我喜欢用-vitest... (today): 我喜欢用 Vitest 而不是 Jest
```

### 7.3 多种类型

```bash
> /remember 我总是使用暗色主题
> /remember 下周四代码冻结
> /remember API 文档在 https://docs.example.com
> /memory
```

**预期**：4 条记忆，类型分别为 user/feedback/project/reference

### 7.4 记忆文件检查

```bash
ls ~/.gearcode/memory/
cat ~/.gearcode/memory/feedback-*.md
```

**预期**：Markdown 文件，包含 YAML frontmatter（type/description/created）

### 7.5 直接测试存储层

```bash
node -e "
import('./dist/memory/store.js').then(m => {
  const f = m.createMemory('user', 'Test memory', 'This is a test');
  console.log('Created:', f);
  console.log('List:', m.listMemories().length, 'memories');
  console.log('Load:', m.loadMemory(f)?.description);
  console.log('Index:', m.buildMemoryIndex().slice(0, 200));
});
"
```

### 7.6 清理

```bash
rm -rf ~/.gearcode/memory/
```
