/**
 * Auto 压缩器单元测试
 *
 * 测试 shouldAutoCompact 阈值判断、autoCompact 压缩逻辑和断路器。
 * 更新：使用新的 src/compactor/ 目录结构和 80% 阈值。
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

import { shouldAutoCompact, autoCompact } from '../../src/compactor/auto.js';
// Also test backward-compat re-exports
import { shouldCompact, compactConversation } from '../../src/compactor/index.js';

describe('shouldAutoCompact', () => {
  it('should return true when tokens exceed 80% of window', () => {
    expect(shouldAutoCompact(81000, 100000)).toBe(true);
  });

  it('should return false when tokens are below 80% of window', () => {
    expect(shouldAutoCompact(79000, 100000)).toBe(false);
  });

  it('should return false when tokens are exactly at 80% threshold', () => {
    expect(shouldAutoCompact(80000, 100000)).toBe(false);
  });

  it('should return false when tokens are 0', () => {
    expect(shouldAutoCompact(0, 100000)).toBe(false);
  });

  it('should return true when window is 0 and tokens > 0', () => {
    expect(shouldAutoCompact(1, 0)).toBe(true);
  });

  it('should return false when both are 0', () => {
    expect(shouldAutoCompact(0, 0)).toBe(false);
  });

  it('should handle large token counts', () => {
    expect(shouldAutoCompact(160001, 200000)).toBe(true);
    expect(shouldAutoCompact(159999, 200000)).toBe(false);
  });

  it('should return true just above 80% boundary', () => {
    expect(shouldAutoCompact(80001, 100000)).toBe(true);
  });
});

describe('backward-compat re-exports', () => {
  it('shouldCompact should be the same as shouldAutoCompact', () => {
    expect(shouldCompact).toBe(shouldAutoCompact);
  });

  it('compactConversation should be the same as autoCompact', () => {
    expect(compactConversation).toBe(autoCompact);
  });
});

describe('autoCompact', () => {
  const mockModel = {} as LanguageModel;

  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it('should skip compression when fewer than 4 messages', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    const result = await autoCompact(messages, mockModel, 0);
    expect(result.messages).toBe(messages);
    expect(result.failed).toBe(false);
  });

  it('should skip compression for exactly 3 messages', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' },
    ];

    const result = await autoCompact(messages, mockModel, 0);
    expect(result.messages).toBe(messages);
    expect(result.failed).toBe(false);
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

    const result = await autoCompact(messages, mockModel, 0);

    expect(result.failed).toBe(false);
    // Should contain summary pair + recent exchanges + last user message
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toContain('[Previous conversation summary]');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[1].content).toContain('continue from where we left off');
  });

  it('should return failed: true on generateText failure (graceful degradation)', async () => {
    mockGenerateText.mockRejectedValue(new Error('API error'));

    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Follow up' },
    ];

    const result = await autoCompact(messages, mockModel, 0);
    expect(result.messages).toBe(messages);
    expect(result.failed).toBe(true);
  });

  it('should trigger circuit breaker after 3 consecutive failures', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Follow up' },
    ];

    // 3 consecutive failures → circuit breaker
    const result = await autoCompact(messages, mockModel, 3);
    expect(result.messages).toBe(messages);
    expect(result.failed).toBe(true);
    // generateText should NOT have been called
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('should not trigger circuit breaker with fewer than 3 failures', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Summary.',
    });

    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'Follow up' },
    ];

    const result = await autoCompact(messages, mockModel, 2);
    expect(result.failed).toBe(false);
    expect(mockGenerateText).toHaveBeenCalled();
  });
});
