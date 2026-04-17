/**
 * 上下文压缩器单元测试
 *
 * 测试 shouldCompact 阈值判断和 compactConversation 压缩逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelMessage, LanguageModel } from 'ai';

// vi.mock is hoisted, so we use vi.hoisted to create the mock fn before hoisting
const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: mockGenerateText,
  };
});

import { shouldCompact, compactConversation } from '../../src/compactor.js';

describe('shouldCompact', () => {
  it('should return true when tokens exceed 85% of window', () => {
    expect(shouldCompact(86000, 100000)).toBe(true);
  });

  it('should return false when tokens are below 85% of window', () => {
    expect(shouldCompact(80000, 100000)).toBe(false);
  });

  it('should return false when tokens are exactly at 85% threshold', () => {
    expect(shouldCompact(85000, 100000)).toBe(false);
  });

  it('should return false when tokens are 0', () => {
    expect(shouldCompact(0, 100000)).toBe(false);
  });

  it('should return true when window is 0 and tokens > 0', () => {
    expect(shouldCompact(1, 0)).toBe(true);
  });

  it('should return false when both are 0', () => {
    expect(shouldCompact(0, 0)).toBe(false);
  });

  it('should handle large token counts', () => {
    expect(shouldCompact(170001, 200000)).toBe(true);
    expect(shouldCompact(169999, 200000)).toBe(false);
  });

  it('should return true just above 85% boundary', () => {
    expect(shouldCompact(85001, 100000)).toBe(true);
  });
});

describe('compactConversation', () => {
  const mockModel = {} as LanguageModel;

  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it('should skip compression when fewer than 4 messages', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    const result = await compactConversation(messages, mockModel);
    expect(result).toBe(messages);
  });

  it('should skip compression for exactly 3 messages', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' },
    ];

    const result = await compactConversation(messages, mockModel);
    expect(result).toBe(messages);
  });

  it('should compress 4+ messages into summary pair + last user message', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'User asked about TypeScript. Assistant explained types.',
    });

    const messages: ModelMessage[] = [
      { role: 'user', content: 'What is TypeScript?' },
      { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' },
      { role: 'user', content: 'How do I use interfaces?' },
      { role: 'assistant', content: 'You can define interfaces with the interface keyword.' },
      { role: 'user', content: 'Show me an example' },
    ];

    const result = await compactConversation(messages, mockModel);

    expect(result.length).toBe(3);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toContain('[Previous conversation summary]');
    expect(result[1].role).toBe('assistant');
    expect(result[1].content).toContain('continue from where we left off');
    expect(result[2].role).toBe('user');
    expect(result[2].content).toBe('Show me an example');
  });

  it('should return original messages on generateText failure (graceful degradation)', async () => {
    mockGenerateText.mockRejectedValue(new Error('API error'));

    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Follow up' },
    ];

    const result = await compactConversation(messages, mockModel);
    expect(result).toBe(messages);
  });

  it('should preserve the last user message in compressed output', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Summary of the conversation.',
    });

    const lastUserContent = 'This is the very last user message';
    const messages: ModelMessage[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Second' },
      { role: 'assistant', content: 'Response 2' },
      { role: 'user', content: lastUserContent },
    ];

    const result = await compactConversation(messages, mockModel);

    expect(result[result.length - 1].role).toBe('user');
    expect(result[result.length - 1].content).toBe(lastUserContent);
  });
});
