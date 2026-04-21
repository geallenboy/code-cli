/**
 * Git Worktree 隔离管理器
 *
 * 为每个子 Agent 创建独立的 Git Worktree，
 * 确保并行执行时不会互相干扰文件系统。
 *
 * 参考 Claude Code: src/utils/worktree.ts
 * - Slug 验证（安全边界）
 * - 符号链接大目录（node_modules）
 * - 任务完成后自动清理
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Worktree 信息 */
export interface WorktreeInfo {
  /** Worktree 路径 */
  path: string;
  /** 分支名 */
  branch: string;
  /** 是否有未提交的更改 */
  hasChanges: boolean;
}

/** Slug 最大长度 */
const MAX_SLUG_LENGTH = 64;

/** 允许的 slug 字符 */
const SLUG_PATTERN = /^[a-zA-Z0-9._/-]+$/;

/**
 * Git Worktree 管理器
 *
 * 管理 worktree 的创建、查询和清理。
 * 所有 worktree 创建在 .code-cli/worktrees/ 目录下。
 */
export class WorktreeManager {
  private readonly repoRoot: string;
  private readonly worktreeBase: string;
  private activeWorktrees: Map<string, WorktreeInfo> = new Map();

  constructor(repoRoot?: string) {
    this.repoRoot = repoRoot ?? process.cwd();
    this.worktreeBase = join(this.repoRoot, '.code-cli', 'worktrees');
  }

  /**
   * 验证 slug 安全性
   *
   * 防止路径遍历攻击和非法字符注入。
   *
   * @param slug - worktree 标识符
   * @throws 如果 slug 不合法
   */
  validateSlug(slug: string): void {
    if (!slug || slug.length > MAX_SLUG_LENGTH) {
      throw new Error(`Worktree slug must be 1-${MAX_SLUG_LENGTH} characters`);
    }
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error('Worktree slug contains invalid characters (only alphanumeric, ., /, -, _ allowed)');
    }
    if (slug.includes('..') || slug.startsWith('/')) {
      throw new Error('Worktree slug must not contain path traversal (..) or absolute paths');
    }
  }

  /**
   * 检查当前目录是否是 Git 仓库
   */
  isGitRepo(): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建 worktree
   *
   * @param slug - worktree 标识符
   * @param baseBranch - 基于哪个分支创建（默认 HEAD）
   * @returns worktree 信息
   */
  create(slug: string, baseBranch?: string): WorktreeInfo {
    this.validateSlug(slug);

    if (!this.isGitRepo()) {
      throw new Error('Not a git repository — worktree isolation unavailable');
    }

    const worktreePath = resolve(this.worktreeBase, slug);
    const branch = `worktree/${slug}`;

    // 确保基础目录存在
    if (!existsSync(this.worktreeBase)) {
      mkdirSync(this.worktreeBase, { recursive: true });
    }

    // 如果已存在，先清理
    if (existsSync(worktreePath)) {
      this.remove(slug);
    }

    try {
      // 创建 worktree + 新分支
      const base = baseBranch ?? 'HEAD';
      execSync(`git worktree add -b "${branch}" "${worktreePath}" ${base}`, {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });

      const info: WorktreeInfo = {
        path: worktreePath,
        branch,
        hasChanges: false,
      };

      this.activeWorktrees.set(slug, info);
      return info;
    } catch (cause) {
      throw new Error(
        `Failed to create worktree: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }

  /**
   * 检查 worktree 是否有未提交的更改
   *
   * @param slug - worktree 标识符
   * @returns 是否有更改
   */
  hasChanges(slug: string): boolean {
    const info = this.activeWorktrees.get(slug);
    if (!info) return false;

    try {
      const output = execSync('git diff --stat', {
        cwd: info.path,
        stdio: 'pipe',
      }).toString().trim();
      return output.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 移除 worktree
   *
   * @param slug - worktree 标识符
   * @param force - 是否强制移除（即使有未提交更改）
   */
  remove(slug: string, force = false): void {
    const info = this.activeWorktrees.get(slug);
    const worktreePath = info?.path ?? resolve(this.worktreeBase, slug);

    try {
      const forceFlag = force ? '--force' : '';
      execSync(`git worktree remove ${forceFlag} "${worktreePath}"`, {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });
    } catch {
      // 如果 git worktree remove 失败，尝试手动清理
      if (existsSync(worktreePath)) {
        rmSync(worktreePath, { recursive: true, force: true });
      }
      try {
        execSync('git worktree prune', { cwd: this.repoRoot, stdio: 'pipe' });
      } catch {
        // ignore prune errors
      }
    }

    // 清理分支
    const branch = info?.branch ?? `worktree/${slug}`;
    try {
      execSync(`git branch -D "${branch}"`, { cwd: this.repoRoot, stdio: 'pipe' });
    } catch {
      // branch may not exist
    }

    this.activeWorktrees.delete(slug);
  }

  /**
   * 清理所有 worktree
   *
   * 检查每个 worktree 是否有更改：
   * - 无更改 → 自动删除
   * - 有更改 → 保留并返回信息
   *
   * @returns 有更改的 worktree 列表
   */
  cleanupAll(): WorktreeInfo[] {
    const withChanges: WorktreeInfo[] = [];

    for (const [slug, info] of this.activeWorktrees) {
      if (this.hasChanges(slug)) {
        info.hasChanges = true;
        withChanges.push(info);
      } else {
        this.remove(slug, true);
      }
    }

    return withChanges;
  }

  /** 获取活跃的 worktree 数量 */
  get size(): number {
    return this.activeWorktrees.size;
  }

  /** 获取所有活跃的 worktree */
  getAll(): WorktreeInfo[] {
    return Array.from(this.activeWorktrees.values());
  }
}
