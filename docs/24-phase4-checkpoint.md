# Task 24: Phase 4 检查点 — 架构升级完成

> 分支: `phase-4/architecture-upgrade` → 合并到 `master`
> 标签: `v0.4.0`

## Phase 4 总结

Phase 4 是整个项目最大的架构变更——从 v1 的单层循环升级为接近 Claude Code 的双层 Generator 架构。

### 完成了什么

| Task | 组件 | 新增测试 |
|------|------|----------|
| 20 | 双层架构 (QueryEngine + query()) | 0（复用现有） |
| 21 | 三级压缩 (Snip → Micro → Auto) | 16 |
| 22 | 4 个 Continue Site + 错误隐瞒 | 20 |
| 23 | 消息规范化 | 16 |
| **合计** | | **+52 → 226 总计** |

### v1 → v2 架构对比

| 维度 | v1 (Phase 1-3) | v2 (Phase 4) |
|------|----------------|--------------|
| 循环架构 | 单层 while(true) | 双层 Generator |
| 压缩 | 1 级 (Auto) | 3 级 (Snip→Micro→Auto) |
| 错误恢复 | 基本重试 | 4 Continue Site |
| 错误暴露 | 直接报告 | 可恢复错误隐瞒 |
| 消息处理 | 无规范化 | 每轮 API 调用前规范化 |

### 关键设计决策

1. **向后兼容**：`agent.ts` 保留为包装器，174 个旧测试零修改通过
2. **消息共享引用**：QueryEngine 和 query() 共享同一个 messages 数组引用
3. **断路器**：autocompact 连续 3 次失败后停止，防止无限重试浪费 API 调用
4. **错误隐瞒**：PTL/MOT 恢复成功时，CLI 层完全不知道发生过错误
