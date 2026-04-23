/**
 * App 状态 Reducer
 */

import type { AppState, AppAction, ChatMessage } from './types.js';

let messageCounter = 0;

function createMessage(partial: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
  return {
    ...partial,
    id: `msg-${++messageCounter}`,
    timestamp: Date.now(),
  };
}

export const initialState: AppState = {
  messages: [],
  isProcessing: false,
  planMode: false,
  inputTokens: 0,
  outputTokens: 0,
  apiCallCount: 0,
  totalApiTime: 0,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, createMessage({ role: 'user', content: action.content })],
      };

    case 'ADD_ASSISTANT_TEXT': {
      const last = state.messages[state.messages.length - 1];
      if (last?.role === 'assistant') {
        // Append to existing assistant message
        const updated = { ...last, content: last.content + action.text };
        return { ...state, messages: [...state.messages.slice(0, -1), updated] };
      }
      return {
        ...state,
        messages: [...state.messages, createMessage({ role: 'assistant', content: action.text })],
      };
    }

    case 'ADD_TOOL_CALL':
      return {
        ...state,
        messages: [
          ...state.messages,
          createMessage({
            role: 'tool',
            content: `${action.toolName}`,
            toolName: action.toolName,
            toolInput: action.input,
          }),
        ],
      };

    case 'ADD_TOOL_RESULT': {
      // Find the last tool message and update it
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'tool' && msgs[i].toolName === action.toolName && !msgs[i].elapsed) {
          msgs[i] = {
            ...msgs[i],
            content: action.result,
            elapsed: action.elapsed,
            isError: action.isError,
          };
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case 'ADD_ERROR':
      return {
        ...state,
        messages: [...state.messages, createMessage({ role: 'error', content: action.message })],
      };

    case 'UPDATE_USAGE':
      return {
        ...state,
        inputTokens: state.inputTokens + action.inputTokens,
        outputTokens: state.outputTokens + action.outputTokens,
        apiCallCount: state.apiCallCount + 1,
      };

    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.value };

    case 'TOGGLE_PLAN_MODE':
      return { ...state, planMode: !state.planMode };

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    default:
      return state;
  }
}
