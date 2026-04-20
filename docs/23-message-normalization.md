# Task 23: 消息规范化

> 对应需求: v2-4
> 分支: `phase-4/architecture-upgrade`
> 提交: `711e80f`（与 Task 22 同一提交）

## 做了什么

实现了 `src/normalizer.ts` — 每次 API 调用前对消息列表进行规范化，防止格式错误导致 API 拒绝请求。

### 为什么需要规范化？

压缩操作可能删除 tool_result 但保留对应的 tool_use，导致配对不完整。会话恢复可能加载损坏的消息历史。这些情况下直接发送给 API 会返回格式错误。

### 4 步规范化

```
1. 孤立 tool_use（无对应 tool_result）
   → 生成合成错误结果: "Tool execution was interrupted"

2. 孤立 tool_result（引用不存在的 tool_call_id）
   → 移除

3. 连续同角色 user 消息
   → 合并为一条

4. 空消息列表
   → 跳过 API 调用
```

### 幂等性

规范化是幂等的——对已规范化的消息再次规范化，结果不变。这通过属性测试 P6 验证。

## 测试覆盖

8 个单元测试 + P6(幂等性) + P7(孤立移除) 属性测试

```bash
pnpm test  # ✅ 226 tests passed
```
