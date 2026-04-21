/**
 * Coordinator 模块入口
 *
 * 导出 Coordinator 模式和 Git Worktree 隔离功能。
 */

export { Coordinator, type CoordinatorConfig, type CoordinatorTask, type CoordinatorResult } from './coordinator.js';
export { WorktreeManager, type WorktreeInfo } from './worktree.js';
