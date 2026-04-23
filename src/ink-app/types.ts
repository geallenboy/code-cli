/**
 * Ink App 共享类型定义
 */

import type { AgentConfig } from '../types.js';

/** 对话消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'error' | 'system';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  elapsed?: number;
  isError?: boolean;
  timestamp: number;
}

/** App 全局状态 */
export interface AppState {
  messages: ChatMessage[];
  isProcessing: boolean;
  planMode: boolean;
  inputTokens: number;
  outputTokens: number;
  apiCallCount: number;
  totalApiTime: number;
}

/** App 状态 Action */
export type AppAction =
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'ADD_ASSISTANT_TEXT'; text: string }
  | { type: 'ADD_TOOL_CALL'; toolName: string; input: Record<string, unknown> }
  | { type: 'ADD_TOOL_RESULT'; toolName: string; result: string; elapsed?: number; isError?: boolean }
  | { type: 'ADD_ERROR'; message: string }
  | { type: 'UPDATE_USAGE'; inputTokens: number; outputTokens: number }
  | { type: 'SET_PROCESSING'; value: boolean }
  | { type: 'TOGGLE_PLAN_MODE' }
  | { type: 'CLEAR_MESSAGES' };

/** App Context 值 */
export interface AppContextValue {
  config: AgentConfig;
  state: AppState;
  dispatch: (action: AppAction) => void;
}
