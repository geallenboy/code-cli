# Task 22+23: 错误恢复 + 消息规范化

> 对应需求: v2-3, v2-4
> 分支: `phase-4/architecture-upgrade`
> 提交: `711e80f`

## 错误恢复 — 4 个 Continue Site

```
API 调用失败
  ├── PTL (Prompt Too Long, status 400)
  │     → 强制 autocompact → 重试 (ptl_recovery)
  │     → 压缩失败 → yield error → 终止
  ├── MOT (Max Output Tokens)
  │     → maxOutputTokens < 16384 → 升级到 16384 → 重试 (mot_escalation)
  │     → 已升级 → 注入续写提示 → 重试最多 3 次 (mot_continuation)
  │     → 耗尽 → yield error → 终止
  └── 其他错误 → yield error → 终止
```

**错误隐瞒**：恢复过程中的 PTL/MOT 错误不 yield 给 QueryEngine。只有所有恢复尝试耗尽后才暴露。这确保 CLI 层只看到"干净"的事件流。

## 消息规范化

每次 API 调用前执行 4 步规范化：
1. 孤立 tool_use（无对应 tool_result）→ 生成合成错误结果
2. 孤立 tool_result（引用不存在的 tool_call_id）→ 移除
3. 连续同角色 user 消息 → 合并
4. 空消息列表 → 跳过 API 调用

**幂等性**：对已规范化的消息再次规范化，结果不变。

## 测试覆盖

36 个新增测试：
- isPTLError/isMOTError: 13 个
- query() 错误恢复: 7 个（PTL/MOT/隐瞒）
- 规范化: 8 个 + P6(幂等) + P7(孤立移除) 属性测试
- P4(错误隐瞒) + P5(MOT 上限) 属性测试

```bash
pnpm test  # ✅ 226 tests passed
```
