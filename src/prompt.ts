/**
 * Prompt 编排 (Prompt Orchestration)
 *
 * 在运行时动态组装系统提示词，为模型提供角色定义、
 * 环境感知（工作目录、平台、日期）、git 上下文和行为指导。
 *
 * 学习点：Claude Code 使用缓存感知的分层组装（prefix caching），
 * 将静态内容（角色定义）和动态内容（git 状态）分离，以最大化 API 缓存命中率。
 * Mini 版用简单的模板替换——当你发现每次 API 调用都重新发送完整 prompt 很浪费时，
 * 就理解了为什么生产版需要更复杂的缓存策略。
 *
 * 参考 Claude Code: src/context.ts (190 行) + src/services/api/claude.ts (3,419 行)
 * 简化：模板字符串替换代替缓存感知分层组装
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 工具定义描述（用于提示词组装） */
export interface ToolDescription {
  name: string;
  description: string;
}

/** Git 命令超时时间（毫秒） */
const GIT_TIMEOUT_MS = 3000;

/**
 * 加载系统提示词模板文件。
 * 模板位于 src/system-prompt.md，使用 {{placeholder}} 占位符。
 * @returns 模板内容字符串
 */
function loadTemplate(): string {
  // Resolve relative to this file's location
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = resolve(currentDir, 'system-prompt.md');

  // Fallback: try from dist/ pointing to src/
  if (!existsSync(templatePath)) {
    const srcPath = resolve(currentDir, '..', 'src', 'system-prompt.md');
    if (existsSync(srcPath)) {
      return readFileSync(srcPath, 'utf-8');
    }
    // Return a minimal fallback template
    return 'You are a programming assistant agent.\n\n{{tool_descriptions}}';
  }

  return readFileSync(templatePath, 'utf-8');
}

/**
 * 构建完整的系统提示词。
 *
 * 组装流程：加载模板 → 替换环境占位符 → 注入工具描述 → 注入 git 上下文 → 注入 CLAUDE.md
 *
 * @param tools - 可用工具定义列表（name + description）
 * @returns 组装后的系统提示词
 */
export function buildSystemPrompt(tools: ToolDescription[]): string {
  let template = loadTemplate();

  // 1. 替换环境信息
  template = template.replace('{{cwd}}', process.cwd());
  template = template.replace('{{platform}}', process.platform);
  template = template.replace('{{date}}', new Date().toISOString().split('T')[0]);
  template = template.replace('{{shell}}', process.env['SHELL'] ?? 'unknown');

  // 2. 注入工具描述
  const toolDescriptions = tools.length > 0
    ? tools.map((t) => `- **${t.name}**: ${t.description}`).join('\n')
    : 'No tools available.';
  template = template.replace('{{tool_descriptions}}', toolDescriptions);

  // 3. 注入 git 上下文（Phase 1 先实现，失败时优雅降级）
  const gitContext = getGitContext();
  template = template.replace('{{git_context}}', gitContext || 'Not a git repository or git not available.');

  // 4. 注入 CLAUDE.md（Phase 3 完整实现，Phase 1 返回空）
  const claudeMd = loadClaudeMd();
  template = template.replace('{{claude_md}}', claudeMd || 'No project-specific instructions.');

  return template;
}

/**
 * 获取 git 仓库上下文：当前分支、最近 5 条提交、工作区状态。
 *
 * 设计决策：3 秒超时 + 优雅降级。git 命令可能因为不在仓库中、
 * git 未安装、或仓库损坏而失败。任何失败都返回空字符串，
 * 不影响 Agent 的正常运行。
 *
 * @returns git 上下文字符串，失败时返回空字符串
 */
export function getGitContext(): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const log = execSync('git log --oneline -5', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const status = execSync('git status --short', {
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const parts: string[] = [];
    parts.push(`Branch: ${branch}`);

    if (log) {
      parts.push(`\nRecent commits:\n${log}`);
    }

    if (status) {
      parts.push(`\nWorking tree status:\n${status}`);
    } else {
      parts.push('\nWorking tree: clean');
    }

    return parts.join('\n');
  } catch {
    // Graceful degradation: git not available, not a repo, or timeout
    return '';
  }
}

/**
 * 从当前目录向上遍历加载所有 CLAUDE.md 文件。
 * 祖先目录的内容排在子目录之前（unshift 策略）。
 * 读取失败的文件会被跳过。
 *
 * @returns 所有 CLAUDE.md 内容拼接，不存在时返回空字符串
 */
export function loadClaudeMd(): string {
  const parts: string[] = [];
  let dir = process.cwd();

  while (true) {
    try {
      const claudePath = resolve(dir, 'CLAUDE.md');
      if (existsSync(claudePath)) {
        parts.unshift(readFileSync(claudePath, 'utf-8'));
      }
    } catch {
      // Skip unreadable files
    }

    const parent = dirname(dir);
    if (parent === dir) break; // Reached filesystem root
    dir = parent;
  }

  return parts.join('\n\n---\n\n');
}
