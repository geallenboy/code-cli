# Task 8: Search-and-Replace 编辑策略

> 对应需求: 7.1, 7.2, 7.3, 7.4
> 分支: `phase-2/core-enhancement`
> 提交: `98caf77`

## 做了什么

实现了 `editFile()` — Claude Code 最核心的编辑策略。

### 为什么是 search-and-replace？

代码编辑有三种常见策略：

| 策略 | 优点 | 缺点 |
|------|------|------|
| **全文重写** | 简单 | 500 行文件改 3 行要重写 497 行，容易遗漏 |
| **行号编辑** | 精确 | 多轮编辑后行号漂移，第二次编辑可能改错位置 |
| **search-and-replace** | 位置无关 + 抗幻觉 | 需要唯一性约束 |

Claude Code 选择了第三种，因为它同时满足三个原则：
1. **位置无关**：不依赖行号，多轮编辑不会错位
2. **抗幻觉**：`old_string` 必须真实存在于文件中，模型不能"编造"不存在的代码
3. **最小破坏**：只改需要改的部分，其余内容完全不动

### 核心逻辑

```typescript
export function editFile(filePath: string, oldString: string, newString: string): string {
  const content = readFileSync(filePath, 'utf-8');

  // 计算 old_string 出现次数
  let count = 0;
  let searchFrom = 0;
  while (true) {
    const index = content.indexOf(oldString, searchFrom);
    if (index === -1) break;
    count++;
    searchFrom = index + 1;
  }

  if (count === 0) return 'Error: old_string not found...';
  if (count > 1) return `Error: old_string found ${count} times...`;

  // 唯一匹配 → 替换
  const newContent = content.replace(oldString, newString);
  writeFileSync(filePath, newContent, 'utf-8');
  return 'File edited: ...';
}
```

**为什么手动计数而不是用正则？** 因为 `old_string` 可能包含正则特殊字符（`(`, `)`, `[`, `*` 等），用 `indexOf` 做精确字符串匹配更安全。

### 与 Claude Code 的对比

Claude Code 的 `FileEditTool` 有 **14 步验证管线**：
1. 文件存在性检查
2. 编码检测
3. 权限检查
4. 配置文件安全检查
5. **引号规范化**（自动将弯引号 `""` 转为直引号 `""`）
6. **API 反消毒**（处理 API 返回中被转义的字符）
7. 唯一性约束
8. ...等等

Mini 版只实现了核心的唯一性约束 + 精确匹配。当你发现模型传来的 `old_string` 因为引号格式不同而匹配失败时，就理解了为什么 Claude Code 需要引号规范化。

## 测试覆盖

8 个新增测试：
- ✅ 唯一匹配替换
- ✅ old_string 未找到
- ✅ old_string 多次匹配
- ✅ 文件不存在
- ✅ 多行 old_string
- ✅ 删除（替换为空字符串）
- ✅ 保留匹配外的内容
- ✅ 成功消息行数统计

```bash
pnpm test  # ✅ 124 tests passed
```

## 本地手动测试

### 不需要 API Key 的测试（直接调用函数）

```bash
pnpm run build

# 准备测试文件
echo 'const x = 1;
const y = 2;
const z = 3;' > /tmp/test-edit.ts

# 测试 1：唯一匹配替换
node -e "
  import('./dist/tools/editor.js').then(m => {
    console.log(m.editFile('/tmp/test-edit.ts', 'const y = 2;', 'const y = 42;'));
  });
"
# 预期：File edited: /tmp/test-edit.ts (replaced 1 line with 1 line)

# 验证文件内容
cat /tmp/test-edit.ts
# 预期：const y = 42;

# 测试 2：old_string 未找到
node -e "
  import('./dist/tools/editor.js').then(m => {
    console.log(m.editFile('/tmp/test-edit.ts', 'const w = 99;', 'replaced'));
  });
"
# 预期：Error: old_string not found...

# 测试 3：多次匹配
echo 'foo
bar
foo' > /tmp/test-dup.ts
node -e "
  import('./dist/tools/editor.js').then(m => {
    console.log(m.editFile('/tmp/test-dup.ts', 'foo', 'baz'));
  });
"
# 预期：Error: old_string found 2 times...
```

### 需要 API Key 的端到端测试

```bash
# 让 Agent 使用 edit_file 修改文件
echo 'function greet() {
  return "hello";
}' > /tmp/test-agent-edit.ts

node dist/index.js --provider deepseek "读取 /tmp/test-agent-edit.ts，然后把 hello 改成 hello world"
# 预期：
#   🔧 read_file {"file_path":"/tmp/test-agent-edit.ts"}
#   ✓ read_file: ...
#   🔧 edit_file {"file_path":"/tmp/test-agent-edit.ts","old_string":"\"hello\"","new_string":"\"hello world\""}
#   ✓ edit_file: File edited...
#   模型确认修改完成

# 验证
cat /tmp/test-agent-edit.ts
# 预期：return "hello world";
```

### 清理

```bash
rm -f /tmp/test-edit.ts /tmp/test-dup.ts /tmp/test-agent-edit.ts
```
