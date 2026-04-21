/**
 * 计划模式 (Plan Mode)
 *
 * 提供只读探索模式，让 Agent 在执行复杂任务前先探索代码、
 * 生成计划，等用户审批后再执行。
 *
 * 核心机制：权限降级 — 进入计划模式后只保留只读工具和只读 shell 命令。
 *
 * 参考 Claude Code: src/tools/EnterPlanModeTool/ + src/tools/ExitPlanModeTool/
 * 简化：状态标志 + 工具过滤 + 计划文件持久化
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** 计划文件存储目录 */
const PLANS_DIR = join(homedir(), '.code-cli', 'plans');

/** 计划模式状态 */
export interface PlanModeState {
  /** 是否处于计划模式 */
  active: boolean;
  /** 进入计划模式前的权限模式（退出时恢复） */
  prePlanPermissionMode: { yolo: boolean };
  /** 生成的计划文本 */
  planText?: string;
}

/** 计划模式下允许的只读 shell 命令前缀 */
const READ_ONLY_COMMANDS = [
  'git log',
  'git diff',
  'git status',
  'git show',
  'cat ',
  'ls ',
  'head ',
  'tail ',
  'wc ',
  'find ',
  'tree ',
];

/**
 * 创建初始计划模式状态
 * @returns 默认的非活跃计划模式状态
 */
export function createPlanModeState(): PlanModeState {
  return { active: false, prePlanPermissionMode: { yolo: false } };
}

/**
 * 进入计划模式
 *
 * 保存当前权限模式，以便退出时恢复。
 *
 * @param state - 当前计划模式状态
 * @param currentYolo - 当前是否为 yolo 模式
 * @returns 更新后的计划模式状态（active: true）
 */
export function enterPlanMode(state: PlanModeState, currentYolo: boolean): PlanModeState {
  return { active: true, prePlanPermissionMode: { yolo: currentYolo } };
}

/**
 * 退出计划模式
 *
 * 保存计划文本，标记为非活跃。调用方负责恢复权限模式。
 *
 * @param state - 当前计划模式状态
 * @param plan - 生成的计划文本
 * @returns 更新后的计划模式状态（active: false, planText 已设置）
 */
export function exitPlanMode(state: PlanModeState, plan: string): PlanModeState {
  return { ...state, active: false, planText: plan };
}

/**
 * 获取计划模式下允许的工具列表
 *
 * 只保留只读工具：read_file, grep_search, list_files, run_shell（受限）
 *
 * @returns 允许的工具名称数组
 */
export function getPlanModeTools(): string[] {
  return ['read_file', 'grep_search', 'list_files', 'run_shell'];
}

/**
 * 判断 shell 命令是否为只读命令
 *
 * 在计划模式下，只有只读 shell 命令被允许执行。
 * 匹配逻辑：命令（去除前导空格后）以已知只读前缀开头。
 *
 * @param cmd - shell 命令字符串
 * @returns 是否为只读命令
 */
export function isReadOnlyShellCommand(cmd: string): boolean {
  return READ_ONLY_COMMANDS.some(prefix => cmd.trimStart().startsWith(prefix));
}

/**
 * 保存计划到文件
 *
 * 将计划文本保存到 ~/.code-cli/plans/ 目录，
 * 文件名包含时间戳和计划摘要 slug。
 *
 * @param plan - 计划文本
 * @returns 保存的文件名
 */
export function savePlan(plan: string): string {
  mkdirSync(PLANS_DIR, { recursive: true });
  const slug = plan
    .slice(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const filename = `plan-${Date.now()}-${slug}.md`;
  writeFileSync(join(PLANS_DIR, filename), plan, 'utf-8');
  return filename;
}
