/**
 * Prompt 编排（Prompt Orchestration）
 *
 * 在运行时动态组装系统提示词，为模型提供角色定义、
 * 环境感知（工作目录、平台、日期）、git 上下文和行为指导。
 *
 * 参考 Claude Code: src/context.ts + src/utils/api.ts
 * 简化：模板替换代替缓存感知分层组装
 */

/** 工具定义描述（用于提示词组装） */
export interface ToolDescription {
  name: string;
  description: string;
}

/**
 * 构建完整的系统提示词
 * @param _tools - 可用工具定义列表
 * @returns 组装后的系统提示词
 */
export function buildSystemPrompt(_tools: ToolDescription[]): string {
  // TODO: Phase 1 — 实现系统提示词组装
  throw new Error('Not implemented');
}

/**
 * 获取 git 仓库上下文（分支、状态、最近提交）
 * @returns git 上下文字符串，失败时返回空字符串
 */
export function getGitContext(): string {
  // TODO: Phase 3 — 实现 git 上下文获取
  throw new Error('Not implemented');
}

/**
 * 从当前目录向上遍历加载 CLAUDE.md 文件
 * @returns CLAUDE.md 内容，不存在时返回空字符串
 */
export function loadClaudeMd(): string {
  // TODO: Phase 3 — 实现 CLAUDE.md 加载
  throw new Error('Not implemented');
}
