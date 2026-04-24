/**
 * Ink App 根组件
 *
 * 管理 REPL 生命周期、对话状态和 StreamEvent 消费。
 *
 * 需求 16：键盘快捷键
 * - Ctrl+L 清屏并重新渲染
 * - 通过 useKeyboard hook 统一管理键盘事件分发
 * - PermissionDialog 活跃时优先路由键盘事件到对话框
 */

import React, { useReducer, useState, useCallback, useMemo, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { appReducer, initialState } from './reducer.js';
import { MessageList } from './MessageList.js';
import { PromptInput } from './PromptInput.js';
import { StatusBar } from './StatusBar.js';
import { WelcomeScreen } from './WelcomeScreen.js';
import { useKeyboard } from './useKeyboard.js';
import { useSearch } from './useSearch.js';
import { SearchBar } from './SearchBar.js';
import type { FocusState } from './useKeyboard.js';
import { SpinnerGlyph } from './SpinnerGlyph.js';
import type { SpinnerMode } from './SpinnerGlyph.js';
import type { AgentConfig } from '../types.js';
import type { Agent } from '../agent.js';
import type { AppAction } from './types.js';
import { parseCommand, classifyMemoryType } from './parseCommand.js';
import { formatConfigInfo } from '../config.js';
import { createMemory, listMemories } from '../memory/index.js';
import { getBuiltinSkills, getSkillPrompt, loadSkills } from '../skills/index.js';
import { createTask, listTasks, getProgressSummary } from '../tasks/index.js';
import { resetPromptCache } from '../prompt.js';
import type { McpManager } from '../mcp/index.js';

interface AppProps {
  agent: Agent;
  config: AgentConfig;
  /** Whether PermissionDialog is currently active (for focus routing) */
  permissionDialogActive?: boolean;
  /** Optional MCP manager for /mcp command */
  mcpManager?: McpManager;
}

/**
 * Consume an agent queryStream, dispatching events to the reducer.
 * Extracted as a reusable helper for agent-action commands.
 */
async function consumeStream(
  agent: Agent,
  prompt: string,
  dispatch: React.Dispatch<AppAction>,
  setSpinnerMode: (mode: SpinnerMode) => void,
  setStallStart: (t: number) => void,
  setTurnStartTime: (t: number) => void,
): Promise<void> {
  dispatch({ type: 'SET_PROCESSING', value: true });
  setSpinnerMode('requesting');
  setStallStart(Date.now());
  const startTime = performance.now();
  try {
    const gen = agent.queryStream(prompt);
    let result = await gen.next();
    while (!result.done) {
      const event = result.value;
      switch (event.type) {
        case 'text':
          dispatch({ type: 'ADD_ASSISTANT_TEXT', text: event.text });
          setSpinnerMode('responding');
          setStallStart(Date.now());
          break;
        case 'tool_call':
          dispatch({ type: 'ADD_TOOL_CALL', toolName: event.toolName, input: event.input });
          setSpinnerMode('requesting');
          break;
        case 'tool_result':
          dispatch({ type: 'ADD_TOOL_RESULT', toolName: event.toolName, result: event.result });
          break;
        case 'usage':
          dispatch({ type: 'UPDATE_USAGE', inputTokens: event.inputTokens, outputTokens: event.outputTokens });
          break;
        case 'error':
          dispatch({ type: 'ADD_ERROR', message: event.error.message });
          break;
        // compact → no-op
      }
      result = await gen.next();
    }
    setTurnStartTime(startTime);
  } catch (error) {
    dispatch({ type: 'ADD_ERROR', message: error instanceof Error ? error.message : String(error) });
  } finally {
    dispatch({ type: 'SET_PROCESSING', value: false });
  }
}


export function App({ agent, config, permissionDialogActive = false, mcpManager }: AppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [ctrlCCount, setCtrlCCount] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [turnStartTime, setTurnStartTime] = useState(0);
  const [spinnerMode, setSpinnerMode] = useState<SpinnerMode>('requesting');
  const [stallStart, setStallStart] = useState(0);
  const [stallMs, setStallMs] = useState(0);

  // Update stallMs every second while processing for stall timer display
  useEffect(() => {
    if (!state.isProcessing) {
      setStallMs(0);
      return;
    }
    const timer = setInterval(() => {
      setStallMs(Date.now() - stallStart);
    }, 1000);
    return () => clearInterval(timer);
  }, [state.isProcessing, stallStart]);

  // 需求 18：搜索高亮
  const search = useSearch(state.messages);

  // 需求 16.3 + 16.4：焦点状态，用于统一键盘事件路由
  const focusState: FocusState = useMemo(() => ({
    permissionDialogActive,
    isProcessing: state.isProcessing,
  }), [permissionDialogActive, state.isProcessing]);

  // 需求 16.1 + 16.3：统一键盘分发 — Ctrl+L 清屏、Ctrl+C 中止/退出
  const handleAbort = useCallback(() => {
    agent.abort();
    dispatch({ type: 'ADD_ERROR', message: '⏹ Aborted' });
    dispatch({ type: 'SET_PROCESSING', value: false });
  }, [agent]);

  const handleExit = useCallback(() => {
    setCtrlCCount(prev => {
      if (prev >= 1) {
        exit();
        return prev;
      }
      return prev + 1;
    });
  }, [exit]);

  useKeyboard({
    focusState,
    onAbort: handleAbort,
    onExit: handleExit,
    onSearchToggle: search.toggleSearch,
  });

  // Reset Ctrl+C count on any other input
  const resetCtrlC = useCallback(() => setCtrlCCount(0), []);

  // Handle user submit
  const handleSubmit = useCallback(async (input: string) => {
    resetCtrlC();
    setShowWelcome(false);

    const trimmed = input.trim();
    if (!trimmed) return;

    const cmd = parseCommand(trimmed);

    switch (cmd.type) {
      case 'chat': {
        // Regular message — consume the async generator
        dispatch({ type: 'ADD_USER_MESSAGE', content: cmd.text });
        await consumeStream(agent, cmd.text, dispatch, setSpinnerMode, setStallStart, setTurnStartTime);
        break;
      }

      case 'clear': {
        dispatch({ type: 'CLEAR_MESSAGES' });
        agent.clearHistory();
        resetPromptCache();
        break;
      }

      case 'plan': {
        dispatch({ type: 'TOGGLE_PLAN_MODE' });
        break;
      }

      case 'cost': {
        const usage = agent.tokenUsage;
        const lines: string[] = [];
        lines.push(`Token Usage:`);
        lines.push(`  Input:  ${usage.inputTokens.toLocaleString()} tokens`);
        lines.push(`  Output: ${usage.outputTokens.toLocaleString()} tokens`);
        lines.push(`  Total:  ${(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens`);
        const apiStats = agent.apiTimingStats;
        if (apiStats.callCount > 0) {
          const avgMs = apiStats.totalTime / apiStats.callCount;
          lines.push(`  API calls: ${apiStats.callCount}, avg response: ${(avgMs / 1000).toFixed(1)}s`);
        }
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
        break;
      }

      case 'compact': {
        try {
          await agent.compact();
          resetPromptCache();
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: 'Conversation compacted.' });
        } catch (error) {
          dispatch({ type: 'ADD_ERROR', message: error instanceof Error ? error.message : String(error) });
        }
        break;
      }

      case 'config': {
        const configLines = formatConfigInfo(config.provider, config.model);
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: configLines.join('\n') });
        break;
      }

      case 'status': {
        const usage = agent.tokenUsage;
        const total = usage.inputTokens + usage.outputTokens;
        const lines: string[] = [];
        lines.push('Session Status:');
        lines.push(`  Messages: ${agent.messages.length}`);
        lines.push(`  Tokens: ${total.toLocaleString()}`);
        lines.push(`  Plan mode: ${state.planMode ? 'active' : 'inactive'}`);
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
        break;
      }

      case 'help': {
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: '__HELP_PANEL__' });
        break;
      }

      case 'memory': {
        try {
          const memories = listMemories();
          if (memories.length === 0) {
            dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: 'No memories stored. Use /remember <text> to create one.' });
          } else {
            const lines: string[] = [];
            lines.push(`Memories (${memories.length}):`);
            for (const m of memories) {
              lines.push(`  [${m.type}] ${m.filename} (${m.age}): ${m.description}`);
            }
            dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
          }
        } catch (error) {
          dispatch({ type: 'ADD_ERROR', message: `Failed to list memories: ${error instanceof Error ? error.message : String(error)}` });
        }
        break;
      }

      case 'remember': {
        if (!cmd.text) {
          dispatch({ type: 'ADD_ERROR', message: 'Usage: /remember <text>' });
          break;
        }
        try {
          const memType = classifyMemoryType(cmd.text);
          const description = cmd.text.slice(0, 80);
          const filename = createMemory(memType, description, cmd.text);
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: `Memory saved: ${filename} [${memType}]` });
        } catch (error) {
          dispatch({ type: 'ADD_ERROR', message: `Failed to save memory: ${error instanceof Error ? error.message : String(error)}` });
        }
        break;
      }

      case 'rules': {
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: '(No rules configured)' });
        break;
      }

      case 'mcp': {
        if (!mcpManager || mcpManager.size === 0) {
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: 'No MCP servers connected. Use --mcp flag and configure ~/.code-cli/mcp.json' });
        } else {
          const servers = mcpManager.getConnectedServers();
          const lines: string[] = [];
          lines.push(`MCP Servers (${servers.length}):`);
          for (const s of servers) {
            lines.push(`  ${s.name} — ${s.toolCount} tools`);
          }
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
        }
        break;
      }

      case 'commit':
      case 'review':
      case 'debug': {
        const builtins = getBuiltinSkills();
        const skill = builtins.find(s => s.name === cmd.type);
        if (skill) {
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: `[Skill: ${skill.name}] ${skill.description}` });
          await consumeStream(agent, skill.prompt, dispatch, setSpinnerMode, setStallStart, setTurnStartTime);
        }
        break;
      }

      case 'skill': {
        // List all skills
        const builtins = getBuiltinSkills();
        const customs = loadSkills();
        const lines: string[] = [];
        lines.push('Skills:');
        lines.push('  Built-in:');
        for (const s of builtins) {
          lines.push(`    /${s.name} — ${s.description}`);
        }
        if (customs.length > 0) {
          lines.push('  Custom:');
          for (const s of customs) {
            lines.push(`    /skill ${s.name} — ${s.description} [${s.trigger}]`);
          }
        }
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
        break;
      }

      case 'skill_run': {
        // Check builtins first
        const builtins = getBuiltinSkills();
        const builtin = builtins.find(s => s.name === cmd.name);
        if (builtin) {
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: `[Skill: ${builtin.name}] ${builtin.description}` });
          await consumeStream(agent, builtin.prompt, dispatch, setSpinnerMode, setStallStart, setTurnStartTime);
          break;
        }
        // Check custom skills
        const customPrompt = getSkillPrompt(cmd.name);
        if (customPrompt) {
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: `[Skill: ${cmd.name}]` });
          await consumeStream(agent, customPrompt, dispatch, setSpinnerMode, setStallStart, setTurnStartTime);
        } else {
          const customs = loadSkills();
          const allNames = [...builtins.map(s => s.name), ...customs.map(s => s.name)];
          const available = allNames.length > 0 ? ` Available skills: ${allNames.join(', ')}` : '';
          dispatch({ type: 'ADD_ERROR', message: `Skill "${cmd.name}" not found.${available}` });
        }
        break;
      }

      case 'task_list': {
        const tasks = listTasks();
        if (tasks.length === 0) {
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: 'No tasks. Use /task add <title> to create one.' });
        } else {
          const lines: string[] = [];
          lines.push(`Tasks (${getProgressSummary()}):`);
          for (const t of tasks) {
            const statusIcon =
              t.status === 'completed' ? '✅' :
              t.status === 'in_progress' ? '🔄' :
              t.status === 'failed' ? '❌' : '⏳';
            lines.push(`  ${statusIcon} [${t.id}] ${t.title} (${t.status})`);
          }
          dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: lines.join('\n') });
        }
        break;
      }

      case 'task_add': {
        if (!cmd.title) {
          dispatch({ type: 'ADD_ERROR', message: 'Usage: /task add <title>' });
          break;
        }
        const task = createTask(cmd.title);
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: `Task created: ${task.id} — ${task.title}` });
        break;
      }

      case 'task_run': {
        if (!cmd.id) {
          dispatch({ type: 'ADD_ERROR', message: 'Usage: /task run <id>' });
          break;
        }
        dispatch({ type: 'ADD_SYSTEM_MESSAGE', content: `Running task ${cmd.id}...` });
        await consumeStream(agent, `Execute task: ${cmd.id}. Find the task details and complete it.`, dispatch, setSpinnerMode, setStallStart, setTurnStartTime);
        break;
      }

      case 'unknown': {
        dispatch({ type: 'ADD_ERROR', message: `Unknown command: ${cmd.raw}` });
        break;
      }
    }
  }, [agent, config, state.planMode, mcpManager, resetCtrlC]);

  return (
    <Box flexDirection="column" width="100%">
      {showWelcome && (
        <WelcomeScreen
          provider={config.provider}
          model={config.model}
        />
      )}

      <MessageList messages={state.messages} searchQuery={search.searchQuery} />

      {search.isSearching && (
        <SearchBar
          query={search.searchQuery}
          matchCount={search.matchCount}
          onQueryChange={search.setQuery}
          onClose={search.clearSearch}
        />
      )}

      {state.isProcessing && (
        <Box marginLeft={1}>
          <SpinnerGlyph mode={spinnerMode} stallMs={stallMs} />
        </Box>
      )}

      {!state.isProcessing && turnStartTime > 0 && (
        <StatusBar
          inputTokens={state.inputTokens}
          outputTokens={state.outputTokens}
          elapsed={performance.now() - turnStartTime}
          apiCallCount={state.apiCallCount}
          totalApiTime={state.totalApiTime}
        />
      )}

      {ctrlCCount > 0 && (
        <Box marginLeft={1}>
          <Text dimColor>Press Ctrl+C again to exit</Text>
        </Box>
      )}

      {!state.isProcessing && !permissionDialogActive && (
        <PromptInput
          onSubmit={handleSubmit}
          planMode={state.planMode}
        />
      )}
    </Box>
  );
}
