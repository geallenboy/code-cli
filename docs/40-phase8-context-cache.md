# Task 40-42: Phase 8 — 上下文工程深化

> 分支: `phase-8/context-and-cache`
> 标签: `v1.1.0`

## 做了什么

3 个上下文工程升级，将压缩从 3 级提升到 4 级，新增压缩后恢复和缓存追踪。

### Task 40: Context Collapse（投影式折叠）

```
原始历史（N 条消息）
    ↓ applyCollapse()
保留第一条 user + [Collapsed M messages: Called read_file, edit_file] + 最近 5 轮
    = 投影视图（发给 API）
    原始历史保留在内存（不丢失）
```

**核心设计**：这是 READ-ONLY 投影——原始消息不被修改，只是发给 API 的视图被折叠。如果后续工具引用了折叠段的内容，可以展开恢复。

**4 级压缩管线**：Snip → Micro → **Collapse** → Auto

### Task 41: 压缩后自动恢复

```
Auto 压缩完成
    ↓
extractRecentlyEditedFiles() — 从 pre-compression 历史提取最近 5 个编辑文件
    ↓
buildRecoveryMessages() — 重新读取文件（每个 ≤5K，总计 ≤25K）
    ↓
注入为 system-reminder 消息
```

**为什么需要恢复？** 压缩后模型会忘记刚才编辑的文件内容。自动重读最近编辑的文件，让模型能继续工作。

### Task 42: Cache Tracker

```typescript
const tracker = new CacheTracker();
tracker.trackUsage({ cache_read_input_tokens: 800, cache_creation_input_tokens: 200 });
tracker.getCacheHitRate();  // 80%
tracker.isBreaking();       // 连续 3 次 <50% 时返回 true
```

被动追踪，不修改行为。`/cost` 命令显示缓存命中率。

## 对应 Claude Code 的概念

| 特性 | Claude Code | Mini v1.1.0 |
|------|-------------|-------------|
| Context Collapse | 投影式折叠 + 展开恢复 | ✅ 投影式折叠 |
| 压缩后恢复 | 5 个文件 + skill 上下文 | ✅ 5 个文件 |
| 缓存追踪 | cache break detection + attribution | ✅ 命中率 + 断裂警告 |

## 测试覆盖

29 个新增测试（collapse 6 + recovery 11 + cache 10 + types 2）

```bash
pnpm test  # ✅ 413 tests passed
```

## 本地手动测试

```bash
pnpm run build

# Context Collapse（不需要 API）
node -e "
import('./dist/compactor/collapse.js').then(m => {
  const msgs = [];
  msgs.push({ role: 'user', content: 'Start' });
  for (let i = 0; i < 4; i++) {
    msgs.push({ role: 'assistant', content: 'x'.repeat(1000) });
    msgs.push({ role: 'user', content: 'q' + i });
  }
  for (let i = 0; i < 5; i++) {
    msgs.push({ role: 'assistant', content: 'recent' + i });
    msgs.push({ role: 'user', content: 'u' + i });
  }
  const r = m.applyCollapse(msgs);
  console.log('Freed:', r.tokensFreed, 'Projected:', r.projected.length, 'Original:', msgs.length);
});
"

# Cache Tracker
node -e "
import('./dist/cache-tracker.js').then(m => {
  const t = new m.CacheTracker();
  t.trackUsage({ cache_read_input_tokens: 800, cache_creation_input_tokens: 200 });
  console.log('Hit rate:', t.getCacheHitRate() + '%');
  console.log('Breaking:', t.isBreaking());
});
"
```
