/**
 * Pure command parser for the Ink REPL.
 *
 * Converts raw input strings into structured command descriptors,
 * decoupling parsing from execution. Also provides memory type
 * classification and round-trip reconstruction.
 */

import type { MemoryType } from '../memory/store.js';

/** All recognized command types */
export type CommandType =
  | 'chat'
  | 'clear'
  | 'plan'
  | 'cost'
  | 'compact'
  | 'config'
  | 'status'
  | 'help'
  | 'memory'
  | 'remember'
  | 'rules'
  | 'mcp'
  | 'commit'
  | 'review'
  | 'debug'
  | 'skill'
  | 'skill_run'
  | 'task_list'
  | 'task_add'
  | 'task_run'
  | 'unknown';

/** Structured command descriptor returned by parseCommand */
export type CommandDescriptor =
  | { type: 'chat'; text: string }
  | { type: 'clear' }
  | { type: 'plan' }
  | { type: 'cost' }
  | { type: 'compact' }
  | { type: 'config' }
  | { type: 'status' }
  | { type: 'help' }
  | { type: 'memory' }
  | { type: 'remember'; text: string }
  | { type: 'rules' }
  | { type: 'mcp' }
  | { type: 'commit' }
  | { type: 'review' }
  | { type: 'debug' }
  | { type: 'skill' }
  | { type: 'skill_run'; name: string }
  | { type: 'task_list' }
  | { type: 'task_add'; title: string }
  | { type: 'task_run'; id: string }
  | { type: 'unknown'; raw: string };

/** Simple commands that are exact matches with no arguments */
const SIMPLE_COMMANDS = new Set([
  'clear', 'plan', 'cost', 'compact', 'config',
  'status', 'help', 'memory', 'rules', 'mcp',
  'commit', 'review', 'debug',
]);

/**
 * Parse a trimmed input string into a structured command descriptor.
 *
 * @param input - Trimmed user input
 * @returns A CommandDescriptor indicating the command type and parsed arguments
 */
export function parseCommand(input: string): CommandDescriptor {
  // Non-slash input is a regular chat message
  if (!input.startsWith('/')) {
    return { type: 'chat', text: input };
  }

  // Extract the command word and the rest of the input
  const spaceIdx = input.indexOf(' ');
  const command = spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx);
  const rest = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1).trim();

  // Simple exact-match commands (no arguments)
  if (SIMPLE_COMMANDS.has(command) && !rest) {
    return { type: command } as CommandDescriptor;
  }

  // /remember [text]
  if (command === 'remember') {
    return { type: 'remember', text: rest };
  }

  // /skill [name]
  if (command === 'skill') {
    if (!rest) {
      return { type: 'skill' };
    }
    return { type: 'skill_run', name: rest };
  }

  // /task [subcommand] [args]
  if (command === 'task') {
    if (!rest || rest === 'list') {
      return { type: 'task_list' };
    }
    if (rest.startsWith('add ')) {
      const title = rest.slice(4).trim();
      return { type: 'task_add', title };
    }
    if (rest === 'add') {
      return { type: 'task_add', title: '' };
    }
    if (rest.startsWith('run ')) {
      const id = rest.slice(4).trim();
      return { type: 'task_run', id };
    }
    if (rest === 'run') {
      return { type: 'task_run', id: '' };
    }
    return { type: 'unknown', raw: input };
  }

  // Any other /... is unknown
  return { type: 'unknown', raw: input };
}

/**
 * Classify memory type based on keyword heuristics.
 *
 * Priority order: user > feedback > project > reference.
 * Matches the chalk REPL classification logic.
 *
 * @param text - The memory text to classify
 * @returns The classified MemoryType
 */
export function classifyMemoryType(text: string): MemoryType {
  const lower = text.toLowerCase();

  // User preferences (highest priority)
  if (
    lower.includes('prefer') ||
    lower.includes('always') ||
    lower.includes('never') ||
    lower.includes('i like') ||
    lower.includes('i want')
  ) {
    return 'user';
  }

  // Feedback
  if (
    lower.includes('instead') ||
    lower.includes('not') ||
    lower.includes('use') ||
    lower.includes('should') ||
    lower.includes('correct')
  ) {
    return 'feedback';
  }

  // Project
  if (
    lower.includes('deadline') ||
    lower.includes('release') ||
    lower.includes('sprint') ||
    lower.includes('meeting') ||
    lower.includes('date')
  ) {
    return 'project';
  }

  // Default
  return 'reference';
}

/**
 * Convert a CommandDescriptor back into its canonical command string.
 *
 * Used for round-trip testing: parseCommand(reconstructCommand(d)) ≡ d
 *
 * @param descriptor - The command descriptor to reconstruct
 * @returns The canonical command string
 */
export function reconstructCommand(descriptor: CommandDescriptor): string {
  switch (descriptor.type) {
    case 'chat':
      return descriptor.text;
    case 'clear':
    case 'plan':
    case 'cost':
    case 'compact':
    case 'config':
    case 'status':
    case 'help':
    case 'memory':
    case 'rules':
    case 'mcp':
    case 'commit':
    case 'review':
    case 'debug':
      return `/${descriptor.type}`;
    case 'remember':
      return descriptor.text ? `/remember ${descriptor.text}` : '/remember';
    case 'skill':
      return '/skill';
    case 'skill_run':
      return `/skill ${descriptor.name}`;
    case 'task_list':
      return '/task';
    case 'task_add':
      return descriptor.title ? `/task add ${descriptor.title}` : '/task add';
    case 'task_run':
      return descriptor.id ? `/task run ${descriptor.id}` : '/task run';
    case 'unknown':
      return descriptor.raw;
  }
}
