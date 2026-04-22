/**
 * Ctrl+R 反向增量历史搜索
 *
 * 纯逻辑模块：维护搜索状态，支持增量过滤、循环匹配、选择和退出。
 * 不涉及终端 I/O，所有渲染由调用方负责。
 *
 * 参考设计文档：P2 历史搜索
 */

/** 搜索状态 */
export interface HistorySearchState {
  /** 是否处于搜索模式 */
  active: boolean;
  /** 当前搜索查询 */
  query: string;
  /** 匹配的历史条目索引（在 history 数组中的位置） */
  matchIndex: number;
  /** 当前匹配的历史条目文本，null 表示无匹配 */
  matchText: string | null;
  /** 进入搜索前的原始输入文本（用于 Escape 恢复） */
  savedInput: string;
}

/**
 * 创建初始搜索状态。
 *
 * @param savedInput - 进入搜索前的当前输入文本
 */
export function createSearchState(savedInput: string): HistorySearchState {
  return {
    active: true,
    query: '',
    matchIndex: -1,
    matchText: null,
    savedInput,
  };
}

/**
 * 在历史记录中查找包含 query 的条目。
 *
 * 从 startIndex 开始向前（更旧的方向）搜索。
 * history[0] 是最旧的，history[length-1] 是最新的。
 *
 * @param history - 历史记录数组（从旧到新）
 * @param query - 搜索查询
 * @param startIndex - 开始搜索的索引（向更旧的方向搜索）
 * @returns 匹配的索引，-1 表示无匹配
 */
export function findMatch(history: string[], query: string, startIndex: number): number {
  if (query === '' || history.length === 0) return -1;

  const lowerQuery = query.toLowerCase();
  // Search from startIndex backwards (towards older entries)
  const start = startIndex >= 0 ? Math.min(startIndex, history.length - 1) : history.length - 1;
  for (let i = start; i >= 0; i--) {
    if (history[i].toLowerCase().includes(lowerQuery)) {
      return i;
    }
  }
  return -1;
}

/**
 * 处理搜索模式下的字符输入。
 *
 * 追加字符到查询，重新搜索匹配。
 */
export function searchAppendChar(
  state: HistorySearchState,
  ch: string,
  history: string[],
): HistorySearchState {
  const newQuery = state.query + ch;
  // Search from the most recent entry
  const matchIndex = findMatch(history, newQuery, history.length - 1);
  return {
    ...state,
    query: newQuery,
    matchIndex,
    matchText: matchIndex >= 0 ? history[matchIndex] : null,
  };
}

/**
 * 处理搜索模式下的 Backspace。
 *
 * 删除查询最后一个字符，重新搜索。
 */
export function searchBackspace(
  state: HistorySearchState,
  history: string[],
): HistorySearchState {
  if (state.query.length === 0) return state;
  const newQuery = state.query.slice(0, -1);
  if (newQuery === '') {
    return { ...state, query: '', matchIndex: -1, matchText: null };
  }
  const matchIndex = findMatch(history, newQuery, history.length - 1);
  return {
    ...state,
    query: newQuery,
    matchIndex,
    matchText: matchIndex >= 0 ? history[matchIndex] : null,
  };
}

/**
 * 处理 Ctrl+R 循环到下一个更旧的匹配。
 */
export function searchCycleOlder(
  state: HistorySearchState,
  history: string[],
): HistorySearchState {
  if (state.query === '' || state.matchIndex <= 0) return state;
  // Search from one before current match
  const matchIndex = findMatch(history, state.query, state.matchIndex - 1);
  if (matchIndex < 0) return state; // No older match, keep current
  return {
    ...state,
    matchIndex,
    matchText: history[matchIndex],
  };
}

/**
 * 处理 Enter 选择当前匹配。
 *
 * 返回选中的文本，或 null 如果无匹配。
 */
export function searchSelect(state: HistorySearchState): string | null {
  return state.matchText;
}

/**
 * 处理 Escape 退出搜索。
 *
 * 返回进入搜索前保存的原始输入。
 */
export function searchEscape(state: HistorySearchState): string {
  return state.savedInput;
}

/**
 * 格式化搜索提示文本。
 *
 * @returns 格式如 "(reverse-i-search)`query': match" 的提示文本
 */
export function formatSearchPrompt(state: HistorySearchState): string {
  const match = state.matchText ?? '';
  return `(reverse-i-search)\`${state.query}': ${match}`;
}
