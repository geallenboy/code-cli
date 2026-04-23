/**
 * 欢迎屏幕组件
 *
 * 需求 13：欢迎屏幕组件
 *
 * - 13.1 渲染项目目录、Git 分支信息、提供商和模型名称
 * - 13.2 显示常用快捷键列表（Enter 提交、Alt+Enter 换行、Ctrl+C 中止、Ctrl+R 搜索历史、Tab 补全路径）
 * - 13.3 使用 Ink Box 组件渲染带边框的欢迎面板
 * - 13.4 Git 信息获取失败时优雅降级，仅显示项目目录
 */

import React from 'react';
import { Box, Text } from 'ink';
import { collectProjectContext, type ProjectContext } from '../welcome.js';

export interface WelcomeScreenProps {
  provider: string;
  model: string;
  /** Override cwd for testing */
  cwd?: string;
  /** Pre-built context for testing (skips collectProjectContext) */
  context?: ProjectContext;
}

/** Shortcut hints displayed in the welcome screen (需求 13.2) */
export const SHORTCUT_HINTS: ReadonlyArray<{ key: string; description: string }> = [
  { key: 'Enter', description: '提交' },
  { key: 'Alt+Enter', description: '换行' },
  { key: 'Ctrl+C', description: '中止' },
  { key: 'Ctrl+R', description: '搜索历史' },
  { key: 'Tab', description: '补全路径' },
];

/**
 * Build the project info line: project name + optional git branch.
 *
 * 需求 13.1: 渲染项目目录、Git 分支信息
 * 需求 13.4: Git 信息获取失败时优雅降级
 */
export function buildProjectLine(ctx: ProjectContext): { name: string; branch: string | null } {
  return { name: ctx.name, branch: ctx.gitBranch };
}

/**
 * Format shortcut hints into display strings.
 *
 * 需求 13.2: 显示常用快捷键列表
 */
export function formatShortcutHints(hints: ReadonlyArray<{ key: string; description: string }>): string[] {
  return hints.map(h => `${h.key} ${h.description}`);
}

/**
 * 欢迎屏幕组件。
 *
 * 需求 13.3: 使用 Ink Box 组件渲染带边框的欢迎面板
 */
export function WelcomeScreen({ provider, model, cwd, context }: WelcomeScreenProps) {
  const ctx = context ?? collectProjectContext(cwd ?? process.cwd(), provider, model);
  const { name, branch } = buildProjectLine(ctx);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={0}>
      <Text bold>Code CLI</Text>
      <Box>
        <Text>📁 {name}</Text>
        {branch && <Text>  🔀 {branch}</Text>}
      </Box>
      <Text>🤖 {ctx.provider} / {ctx.model}</Text>
      <Text> </Text>
      <Text dimColor>Enter 提交 · Alt+Enter 换行 · Ctrl+C 中止</Text>
      <Text dimColor>Ctrl+R 搜索历史 · Tab 补全路径</Text>
    </Box>
  );
}
