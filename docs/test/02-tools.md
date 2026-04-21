# 测试 02: 工具系统

## A. 不需要 API Key 的直接测试

### 2.1 read_file

```bash
node -e "import('./dist/tools/file-ops.js').then(m => console.log(m.readFileContent('package.json')))"
```

**预期**：显示 package.json 内容，每行带行号 `1 | {`

```bash
node -e "import('./dist/tools/file-ops.js').then(m => console.log(m.readFileContent('nonexistent.txt')))"
```

**预期**：`Error: File not found: nonexistent.txt`

### 2.2 write_file

```bash
node -e "import('./dist/tools/editor.js').then(m => console.log(m.writeFile('/tmp/code-cli-test.txt', 'hello world')))"
cat /tmp/code-cli-test.txt
```

**预期**：`File written: /tmp/code-cli-test.txt (1 lines)`，文件内容为 `hello world`

### 2.3 edit_file

```bash
echo 'const x = 1;
const y = 2;
const z = 3;' > /tmp/test-edit.ts

node -e "import('./dist/tools/editor.js').then(m => console.log(m.editFile('/tmp/test-edit.ts', 'const y = 2;', 'const y = 42;')))"
cat /tmp/test-edit.ts
```

**预期**：`File edited: ...`，文件中 `const y = 42;`

```bash
# 测试未找到
node -e "import('./dist/tools/editor.js').then(m => console.log(m.editFile('/tmp/test-edit.ts', 'not exist', 'new')))"
```

**预期**：`Error: old_string not found...`

```bash
# 测试多次匹配
echo 'foo
bar
foo' > /tmp/test-dup.ts
node -e "import('./dist/tools/editor.js').then(m => console.log(m.editFile('/tmp/test-dup.ts', 'foo', 'baz')))"
```

**预期**：`Error: old_string found 2 times...`

### 2.4 grep_search

```bash
node -e "import('./dist/tools/file-ops.js').then(m => console.log(m.grepSearch('export function', 'src', '*.ts')))"
```

**预期**：列出所有 `src/*.ts` 中的 `export function` 行，含文件路径和行号

### 2.5 list_files

```bash
node -e "import('./dist/tools/file-ops.js').then(m => console.log(m.listFiles('*.ts', 'src')))"
```

**预期**：列出 `src/` 下所有 `.ts` 文件的相对路径

### 2.6 run_shell

```bash
node -e "import('./dist/tools/shell.js').then(m => console.log(m.executeShellCommand('echo hello')))"
```

**预期**：`hello`

```bash
node -e "import('./dist/tools/shell.js').then(m => console.log(m.executeShellCommand('ls /nonexistent')))"
```

**预期**：`Exit code: 2` + STDERR

### 2.7 truncateResult

```bash
node -e "import('./dist/tools/index.js').then(m => { const r = m.truncateResult('x'.repeat(60000)); console.log('长度:', r.length, '截断:', r.includes('[truncated')); })"
```

**预期**：`长度: ≤50000 截断: true`

## B. 需要 API Key 的端到端测试

### 2.8 Agent 调用工具

```bash
node dist/index.js --provider deepseek "读取 package.json 文件的内容"
```

**预期**：
- `📖 read_file` + 参数
- `↳ 1 | { "name": "code-cli"...`
- 模型总结文件内容

### 2.9 Agent 多工具调用

```bash
node dist/index.js --provider deepseek "读取 package.json，然后告诉我有哪些依赖"
```

**预期**：Agent 先调用 read_file，然后分析并回答

### 2.10 Agent 编辑文件

```bash
echo 'function greet() { return "hello"; }' > /tmp/test-agent-edit.ts
node dist/index.js --provider deepseek "读取 /tmp/test-agent-edit.ts，然后把 hello 改成 hello world"
cat /tmp/test-agent-edit.ts
```

**预期**：文件中 `return "hello world"`

## 清理

```bash
rm -f /tmp/code-cli-test.txt /tmp/test-edit.ts /tmp/test-dup.ts /tmp/test-agent-edit.ts
```
