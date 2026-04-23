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

interface AppProps {
  agent: Agent;
  config: AgentConfig;
  /** Whether PermissionDialog is currently active (for focus routing) */
  permissionDialogActive?: boolean;
}

export function App({ agent, config, permissionDialogActive = false }: AppProps) {
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

    // Handle slash commands
    if (trimmed === '/clear') {
      dispatch({ type: 'CLEAR_MESSAGES' });
      agent.clearHistory();
      return;
    }
    if (trimmed === '/plan') {
      dispatch({ type: 'TOGGLE_PLAN_MODE' });
      return;
    }

    // Regular message — consume the async generator
    dispatch({ type: 'ADD_USER_MESSAGE', content: trimmed });
    dispatch({ type: 'SET_PROCESSING', value: true });
    setSpinnerMode('requesting');
    setStallStart(Date.now());
    const startTime = performance.now();

    try {
      const gen = agent.queryStream(trimmed);
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
      // result.value is Terminal — record elapsed time
      setTurnStartTime(startTime);
    } catch (error) {
      dispatch({ type: 'ADD_ERROR', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'SET_PROCESSING', value: false });
    }
  }, [agent, resetCtrlC]);

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
