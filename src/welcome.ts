/**
 * 欢迎屏幕与项目上下文
 *
 * 启动时显示项目名称、git 信息、提供商/模型。
 * 200ms 渲染时间限制：所有信息收集必须在 200ms 内完成。
 *
 * 纯逻辑部分与 I/O 部分分离，便于测试。
 *
 * 参考设计文档：P2 欢迎屏幕
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

/** 项目上下文信息 */
export interface ProjectContext {
  /** 项目名称 */
  name: string;
  /** 项目名称来源 */
  nameSource: 'package.json' | 'Cargo.toml' | 'pyproject.toml' | 'dirname';
  /** git 分支名（null 表示非 git 仓库） */
  gitBranch: string | null;
  /** 未提交变更数量（null 表示非 git 仓库） */
  uncommittedChanges: number | null;
  /** 提供商名称 */
  provider: string;
  /** 模型名称 */
  model: string;
}

/**
 * 从 package.json 检测项目名称。
 */
export function detectFromPackageJson(cwd: string): string | null {
  try {
    const filePath = join(cwd, 'package.json');
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    const pkg = JSON.parse(content) as { name?: string };
    return pkg.name || null;
  } catch {
    return null;
  }
}

/**
 * 从 Cargo.toml 检测项目名称。
 */
export function detectFromCargoToml(cwd: string): string | null {
  try {
    const filePath = join(cwd, 'Cargo.toml');
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    // Simple TOML name extraction: name = "value"
    const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 从 pyproject.toml 检测项目名称。
 */
export function detectFromPyprojectToml(cwd: string): string | null {
  try {
    const filePath = join(cwd, 'pyproject.toml');
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    // Simple TOML name extraction: name = "value"
    const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 检测项目名称，按优先级尝试多种来源。
 *
 * 优先级：package.json > Cargo.toml > pyproject.toml > 目录名
 */
export function detectProjectName(cwd: string): { name: string; source: ProjectContext['nameSource'] } {
  const fromPkg = detectFromPackageJson(cwd);
  if (fromPkg) return { name: fromPkg, source: 'package.json' };

  const fromCargo = detectFromCargoToml(cwd);
  if (fromCargo) return { name: fromCargo, source: 'Cargo.toml' };

  const fromPy = detectFromPyprojectToml(cwd);
  if (fromPy) return { name: fromPy, source: 'pyproject.toml' };

  return { name: basename(cwd) || 'project', source: 'dirname' };
}

/**
 * 获取 git 分支名。
 */
export function getGitBranch(cwd: string): string | null {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 150,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 获取未提交变更数量。
 */
export function getUncommittedChanges(cwd: string): number | null {
  try {
    const result = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      timeout: 150,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = result.trim().split('\n').filter((l) => l.length > 0);
    return lines.length;
  } catch {
    return null;
  }
}

/**
 * 收集项目上下文信息。
 *
 * @param cwd - 当前工作目录
 * @param provider - 提供商名称
 * @param model - 模型名称
 * @returns 项目上下文
 */
export function collectProjectContext(
  cwd: string,
  provider: string,
  model: string,
): ProjectContext {
  const { name, source } = detectProjectName(cwd);
  const gitBranch = getGitBranch(cwd);
  const uncommittedChanges = gitBranch !== null ? getUncommittedChanges(cwd) : null;

  return {
    name,
    nameSource: source,
    gitBranch,
    uncommittedChanges,
    provider,
    model,
  };
}

/**
 * 格式化欢迎屏幕文本（纯文本，无 ANSI）。
 *
 * @param ctx - 项目上下文
 * @returns 欢迎屏幕文本行数组
 */
export function formatWelcomeScreen(ctx: ProjectContext): string[] {
  const lines: string[] = [];

  // Project name
  lines.push(`📁 ${ctx.name}`);

  // Git info
  if (ctx.gitBranch) {
    let gitLine = `🔀 ${ctx.gitBranch}`;
    if (ctx.uncommittedChanges !== null && ctx.uncommittedChanges > 0) {
      gitLine += ` (${ctx.uncommittedChanges} uncommitted change${ctx.uncommittedChanges === 1 ? '' : 's'})`;
    }
    lines.push(gitLine);
  }

  // Provider + model
  lines.push(`🤖 ${ctx.provider} / ${ctx.model}`);

  return lines;
}

/**
 * 收集并格式化欢迎屏幕，带 200ms 超时保护。
 *
 * 如果信息收集超过 200ms，返回已收集到的部分信息。
 *
 * @param cwd - 当前工作目录
 * @param provider - 提供商名称
 * @param model - 模型名称
 * @returns 欢迎屏幕文本行数组
 */
export function renderWelcomeScreen(
  cwd: string,
  provider: string,
  model: string,
): string[] {
  const start = performance.now();

  const { name, source } = detectProjectName(cwd);
  const elapsed1 = performance.now() - start;

  let gitBranch: string | null = null;
  let uncommittedChanges: number | null = null;

  // Only attempt git info if we have time budget remaining
  if (elapsed1 < 180) {
    gitBranch = getGitBranch(cwd);
    const elapsed2 = performance.now() - start;
    if (elapsed2 < 180 && gitBranch !== null) {
      uncommittedChanges = getUncommittedChanges(cwd);
    }
  }

  const ctx: ProjectContext = {
    name,
    nameSource: source,
    gitBranch,
    uncommittedChanges,
    provider,
    model,
  };

  return formatWelcomeScreen(ctx);
}
