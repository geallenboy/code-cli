/**
 * Ink App 根组件
 *
 * 管理 REPL 生命周期、对话状态和 StreamEvent 消费。
 */

import React, { useReducer, useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { appReducer, initialState } from './reducer.js';
import { MessageList } from './MessageList.js';
import { PromptInput } from './PromptInput.js';
import { StatusBar } from './StatusBar.js';
import { WelcomeScreen } from './WelcomeScreen.js';
import type { AgentConfig } from '../types.js';
import type { Agent } from '../agent.js';

interface AppProps {
  agent: Agent;
  config: AgentConfig;
}

export function App({ agent, config }: AppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [ctrlCCount, setCtrlCCount] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [turnStartTime, setTurnStartTime] = useState(0);

  // Handle Ctrl+C
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (state.isProcessing) {
        agent.abort();
        dispatch({ type: 'ADD_ERROR', message: '⏹ Aborted' });
        dispatch({ type: 'SET_PROCESSING', value: false });
      } else {
        setCtrlCCount(prev => {
          if (prev >= 1) {
            exit();
            return prev;
          }
          return prev + 1;
        });
      }
    }
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

    // Regular message
    dispatch({ type: 'ADD_USER_MESSAGE', content: trimmed });
    dispatch({ type: 'SET_PROCESSING', value: true });
    setTurnStartTime(performance.now());

    try {
      await agent.chat(trimmed);
    } catch (error) {
      dispatch({ type: 'ADD_ERROR', message: error instanceof Error ? error.message : String(error) });
    } finally {
      dispatch({ type: 'SET_PROCESSING', value: false });
    }
  }, [agent, resetCtrlC]);

  // Consume StreamEvent from agent (simplified — full integration in Phase 2)
  useEffect(() => {
    // Token usage sync
    const usage = agent.tokenUsage;
    if (usage.inputTokens > 0 || usage.outputTokens > 0) {
      dispatch({
        type: 'UPDATE_USAGE',
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    }
  }, [state.isProcessing, agent]);

  return (
    <Box flexDirection="column" width="100%">
      {showWelcome && (
        <WelcomeScreen
          provider={config.provider}
          model={config.model}
        />
      )}

      <MessageList messages={state.messages} />

      {state.isProcessing && (
        <Box marginLeft={1}>
          <Text color="cyan">⠋ Processing...</Text>
        </Box>
      )}

      {!state.isProcessing && turnStartTime > 0 && (
        <StatusBar
          inputTokens={state.inputTokens}
          outputTokens={state.outputTokens}
          elapsed={performance.now() - turnStartTime}
        />
      )}

      {ctrlCCount > 0 && (
        <Box marginLeft={1}>
          <Text dimColor>Press Ctrl+C again to exit</Text>
        </Box>
      )}

      <PromptInput
        onSubmit={handleSubmit}
        planMode={state.planMode}
        disabled={state.isProcessing}
      />
    </Box>
  );
}
