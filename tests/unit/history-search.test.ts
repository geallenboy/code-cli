/**
 * Ctrl+R 历史搜索单元测试
 *
 * 测试纯逻辑搜索状态管理：增量过滤、循环匹配、选择、退出。
 */

import { describe, it, expect } from 'vitest';
import {
  createSearchState,
  findMatch,
  searchAppendChar,
  searchBackspace,
  searchCycleOlder,
  searchSelect,
  searchEscape,
  formatSearchPrompt,
} from '../../src/history-search.js';

const history = ['git status', 'npm install', 'npm test', 'git commit -m "fix"', 'npm run build'];

describe('createSearchState', () => {
  it('should create active state with saved input', () => {
    const state = createSearchState('current input');
    expect(state.active).toBe(true);
    expect(state.query).toBe('');
    expect(state.matchIndex).toBe(-1);
    expect(state.matchText).toBeNull();
    expect(state.savedInput).toBe('current input');
  });
});

describe('findMatch', () => {
  it('should return -1 for empty query', () => {
    expect(findMatch(history, '', 4)).toBe(-1);
  });

  it('should return -1 for empty history', () => {
    expect(findMatch([], 'test', 0)).toBe(-1);
  });

  it('should find most recent match', () => {
    expect(findMatch(history, 'npm', 4)).toBe(4); // 'npm run build'
  });

  it('should find match from specified start index', () => {
    expect(findMatch(history, 'npm', 3)).toBe(2); // 'npm test'
  });

  it('should be case-insensitive', () => {
    expect(findMatch(history, 'NPM', 4)).toBe(4);
  });

  it('should return -1 when no match found', () => {
    expect(findMatch(history, 'python', 4)).toBe(-1);
  });

  it('should handle startIndex beyond array length', () => {
    expect(findMatch(history, 'npm', 100)).toBe(4);
  });
});

describe('searchAppendChar', () => {
  it('should append character and find match', () => {
    const state = createSearchState('');
    const result = searchAppendChar(state, 'g', history);
    expect(result.query).toBe('g');
    expect(result.matchText).toBe('git commit -m "fix"');
  });

  it('should narrow results with more characters', () => {
    let state = createSearchState('');
    state = searchAppendChar(state, 'n', history);
    state = searchAppendChar(state, 'p', history);
    state = searchAppendChar(state, 'm', history);
    state = searchAppendChar(state, ' ', history);
    state = searchAppendChar(state, 't', history);
    expect(result(state)).toBe('npm test');
  });

  it('should set matchText to null when no match', () => {
    const state = createSearchState('');
    const result = searchAppendChar(state, 'z', history);
    expect(result.matchText).toBeNull();
    expect(result.matchIndex).toBe(-1);
  });
});

function result(state: ReturnType<typeof createSearchState>): string | null {
  return state.matchText;
}

describe('searchBackspace', () => {
  it('should remove last character and re-search', () => {
    let state = createSearchState('');
    state = searchAppendChar(state, 'g', history);
    state = searchAppendChar(state, 'i', history);
    state = searchAppendChar(state, 'z', history); // no match
    expect(state.matchText).toBeNull();

    state = searchBackspace(state, history);
    expect(state.query).toBe('gi');
    expect(state.matchText).toBe('git commit -m "fix"');
  });

  it('should do nothing when query is empty', () => {
    const state = createSearchState('');
    const result = searchBackspace(state, history);
    expect(result.query).toBe('');
    expect(result).toBe(state); // same reference
  });

  it('should clear match when query becomes empty', () => {
    let state = createSearchState('');
    state = searchAppendChar(state, 'g', history);
    state = searchBackspace(state, history);
    expect(state.query).toBe('');
    expect(state.matchText).toBeNull();
  });
});

describe('searchCycleOlder', () => {
  it('should cycle to next older match', () => {
    let state = createSearchState('');
    state = searchAppendChar(state, 'n', history);
    state = searchAppendChar(state, 'p', history);
    state = searchAppendChar(state, 'm', history);
    // Most recent: 'npm run build' (index 4)
    expect(state.matchIndex).toBe(4);

    state = searchCycleOlder(state, history);
    // Next older: 'npm test' (index 2)
    expect(state.matchIndex).toBe(2);
    expect(state.matchText).toBe('npm test');

    state = searchCycleOlder(state, history);
    // Next older: 'npm install' (index 1)
    expect(state.matchIndex).toBe(1);
    expect(state.matchText).toBe('npm install');
  });

  it('should stay at current when no older match', () => {
    let state = createSearchState('');
    state = searchAppendChar(state, 'g', history);
    state = searchAppendChar(state, 'i', history);
    state = searchAppendChar(state, 't', history);
    state = searchAppendChar(state, ' ', history);
    state = searchAppendChar(state, 's', history);
    // Only match: 'git status' (index 0)
    expect(state.matchIndex).toBe(0);

    state = searchCycleOlder(state, history);
    expect(state.matchIndex).toBe(0); // unchanged
  });

  it('should do nothing when query is empty', () => {
    const state = createSearchState('');
    const result = searchCycleOlder(state, history);
    expect(result).toBe(state);
  });
});

describe('searchSelect', () => {
  it('should return matched text', () => {
    let state = createSearchState('');
    state = searchAppendChar(state, 'g', history);
    expect(searchSelect(state)).toBe('git commit -m "fix"');
  });

  it('should return null when no match', () => {
    const state = createSearchState('');
    expect(searchSelect(state)).toBeNull();
  });
});

describe('searchEscape', () => {
  it('should return saved input', () => {
    const state = createSearchState('my original input');
    expect(searchEscape(state)).toBe('my original input');
  });
});

describe('formatSearchPrompt', () => {
  it('should format with query and match', () => {
    let state = createSearchState('');
    state = searchAppendChar(state, 'g', history);
    const prompt = formatSearchPrompt(state);
    expect(prompt).toContain('g');
    expect(prompt).toContain('git commit');
    expect(prompt).toContain('reverse-i-search');
  });

  it('should format with empty match', () => {
    const state = createSearchState('');
    const prompt = formatSearchPrompt(state);
    expect(prompt).toBe("(reverse-i-search)`': ");
  });
});
