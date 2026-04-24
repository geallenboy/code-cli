/**
 * 帮助面板组件
 *
 * 需求 14：帮助面板组件
 *
 * - 14.1 渲染两个带边框的面板：命令列表和快捷键列表
 * - 14.2 显示所有斜杠命令及其简要说明
 * - 14.3 显示所有键盘快捷键及其功能说明
 * - 14.4 使用 Ink Box 组件实现 Flexbox 布局，自动适应终端宽度
 */

import React from 'react';
import { Box, Text } from 'ink';

/** A slash command entry with name and description */
export interface CommandEntry {
  /** Command name including the leading slash, e.g. "/clear" */
  command: string;
  /** Brief description of what the command does */
  description: string;
}

/** A keyboard shortcut entry with key combo and description */
export interface ShortcutEntry {
  /** Key combination, e.g. "Enter", "Alt+Enter" */
  key: string;
  /** Brief description of what the shortcut does */
  description: string;
}

/**
 * All slash commands available in the CLI (需求 14.2).
 *
 * Exported for testability.
 */
export const COMMANDS: ReadonlyArray<CommandEntry> = [
  { command: '/clear', description: 'Clear conversation history' },
  { command: '/cost', description: 'Show token usage and cost' },
  { command: '/compact', description: 'Compress context' },
  { command: '/config', description: 'Show current configuration' },
  { command: '/plan', description: 'Enter plan mode' },
  { command: '/status', description: 'Show session status' },
  { command: '/memory', description: 'View memory list' },
  { command: '/remember', description: 'Save a memory' },
  { command: '/commit', description: 'Generate commit message' },
  { command: '/review', description: 'Code review changes' },
  { command: '/debug', description: 'Analyze errors' },
  { command: '/rules', description: 'Show permission rules' },
  { command: '/mcp', description: 'List MCP servers' },
  { command: '/skill', description: 'View/run skills' },
  { command: '/task', description: 'Task management' },
  { command: '/help', description: 'Show this help' },
];

/**
 * All keyboard shortcuts available in the CLI (需求 14.3).
 *
 * Exported for testability.
 */
export const SHORTCUTS: ReadonlyArray<ShortcutEntry> = [
  { key: 'Enter', description: 'Submit input' },
  { key: 'Alt+Enter', description: 'Insert newline' },
  { key: 'Ctrl+C', description: 'Abort / double to exit' },
  { key: 'Ctrl+R', description: 'Search history' },
  { key: 'Ctrl+L', description: 'Clear screen' },
  { key: 'Tab', description: 'File path completion' },
];

/**
 * Format command entries into display strings.
 *
 * Pads command names to align descriptions.
 */
export function formatCommands(commands: ReadonlyArray<CommandEntry>): string[] {
  const maxLen = Math.max(...commands.map(c => c.command.length));
  return commands.map(c => `${c.command.padEnd(maxLen)}  ${c.description}`);
}

/**
 * Format shortcut entries into display strings.
 *
 * Pads key names to align descriptions.
 */
export function formatShortcuts(shortcuts: ReadonlyArray<ShortcutEntry>): string[] {
  const maxLen = Math.max(...shortcuts.map(s => s.key.length));
  return shortcuts.map(s => `${s.key.padEnd(maxLen)}  ${s.description}`);
}

export interface HelpPanelProps {
  /** Override commands for testing */
  commands?: ReadonlyArray<CommandEntry>;
  /** Override shortcuts for testing */
  shortcuts?: ReadonlyArray<ShortcutEntry>;
}

/**
 * 帮助面板组件。
 *
 * 需求 14.1：渲染两个带边框的面板：命令列表和快捷键列表
 * 需求 14.4：使用 Ink Box 组件实现 Flexbox 布局，自动适应终端宽度
 */
export function HelpPanel({ commands, shortcuts }: HelpPanelProps) {
  const cmds = commands ?? COMMANDS;
  const keys = shortcuts ?? SHORTCUTS;

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text bold>Commands</Text>
        {cmds.map((c) => (
          <Box key={c.command}>
            <Text color="cyan">{c.command}</Text>
            <Text>  {c.description}</Text>
          </Box>
        ))}
      </Box>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
      >
        <Text bold>Shortcuts</Text>
        {keys.map((s) => (
          <Box key={s.key}>
            <Text color="yellow">{s.key}</Text>
            <Text>  {s.description}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
