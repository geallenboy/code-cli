/**
 * 三级渐进压缩管线入口
 *
 * 按顺序导出三级压缩器：Snip → Micro → Auto
 * 同时保留旧名称的向后兼容导出。
 *
 * 参考 Claude Code: src/services/compact/index.ts
 */

export { snipCompact } from './snip.js';
export { microCompact } from './micro.js';
export { shouldAutoCompact, autoCompact } from './auto.js';

// Re-export old names for backward compatibility
export { shouldAutoCompact as shouldCompact } from './auto.js';
export { autoCompact as compactConversation } from './auto.js';
