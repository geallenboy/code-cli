/**
 * Agent Loop 单元测试
 *
 * 测试 Agent 核心类的关键行为：
 * - chat 方法：无工具调用时循环终止
 * - chat 方法：有工具调用时执行工具并继续循环
 * - token 使用量累计追踪
 * - abort 取消处理
 * - withRetry 重试逻辑
 * - isRetryableError 错误分类
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isRetryableError, withRetry } from '../../src/agent.js';

// ===== isRetryableError tests =====

describe('isRetryableError', () => {
  it('should return true for 429 status code', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it('should return true for 503 status code', () => {
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it('should return true for 529 status code', () => {
    expect(isRetryableError({ status: 529 })).toBe(true);
  });

  it('should return false for 400 status code', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
  });

  it('should return false for 401 status code', () => {
    expect(isRetryableError({ status: 401 })).toBe(false);
  });

  it('should return false for 500 status code', () => {
    expect(isRetryableError({ status: 500 })).toBe(false);
  });

  it('should check statusCode property as fallback', () => {
    expect(isRetryableError({ statusCode: 429 })).toBe(true);
    expect(isRetryableError({ statusCode: 400 })).toBe(false);
  });

  it('should check error message as fallback', () => {
    expect(isRetryableError({ message: 'Rate limit exceeded (429)' })).toBe(true);
    expect(isRetryableError({ message: 'Service unavailable 503' })).toBe(true);
  });

  it('should return false for null/undefined', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('should return false for non-object errors', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });

  it('should return false for objects without status info', () => {
    expect(isRetryableError({})).toBe(false);
    expect(isRetryableError({ message: 'generic error' })).toBe(false);
  });
});

// ===== withRetry tests =====

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 429, message: 'Rate limited' })
      .mockResolvedValue('success');

    // Run the retry with real timers for simplicity
    vi.useRealTimers();
    const result = await withRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable error (400)', async () => {
    vi.useRealTimers();
    const error = { status: 400, message: 'Bad request' };
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, 3)).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not retry on non-retryable error (401)', async () => {
    vi.useRealTimers();
    const error = { status: 401, message: 'Unauthorized' };
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, 3)).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw after max retries exhausted', async () => {
    vi.useRealTimers();
    const error = { status: 429, message: 'Rate limited' };
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, 2)).rejects.toEqual(error);
    // 1 initial + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw immediately if signal is aborted', async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    controller.abort();

    const error = { status: 429, message: 'Rate limited' };
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, 3, controller.signal)).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 503 error', async () => {
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 503, message: 'Service unavailable' })
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 529 error', async () => {
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 529, message: 'Overloaded' })
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ===== Agent class tests =====

describe('Agent', () => {
  // We test the Agent class by mocking the ai module's streamText
  // and the provider module's createModel

  const mockModelInstance = {
    modelId: 'test-model',
    provider: 'test',
    specificationVersion: 'v1',
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to create an Agent with mocked dependencies.
   * We dynamically import after mocking to ensure mocks are applied.
   */
  async function createMockedAgent(streamTextResponses: Array<{
    text: string;
    toolCalls?: Array<{ toolCallId: string; toolName: string; input: Record<string, unknown> }>;
    toolResults?: Array<{ toolCallId: string; toolName: string; input: Record<string, unknown>; output: string }>;
    usage?: { inputTokens: number; outputTokens: number };
  }>) {
    let callIndex = 0;

    // Mock the ai module
    vi.doMock('ai', () => {
      return {
        streamText: vi.fn(() => {
          const response = streamTextResponses[callIndex] ?? streamTextResponses[streamTextResponses.length - 1];
          callIndex++;

          const textChunks = response.text ? [response.text] : [];
          const tc = response.toolCalls ?? [];
          const tr = response.toolResults ?? [];
          const usage = response.usage ?? { inputTokens: 10, outputTokens: 5 };

          return {
            textStream: (async function* () {
              for (const chunk of textChunks) {
                yield chunk;
              }
            })(),
            text: Promise.resolve(response.text),
            toolCalls: Promise.resolve(tc),
            toolResults: Promise.resolve(tr),
            usage: Promise.resolve({
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
              outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
              totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            }),
            response: Promise.resolve({
              messages: [],
            }),
            steps: Promise.resolve([]),
          };
        }),
        stepCountIs: vi.fn(() => () => true),
        tool: vi.fn((def: unknown) => def),
      };
    });

    // Mock the provider module
    vi.doMock('../../src/provider.js', () => ({
      createModel: vi.fn(() => mockModelInstance),
    }));

    // Mock the tools module
    vi.doMock('../../src/tools/index.js', () => ({
      getToolDefinitions: vi.fn(() => ({})),
    }));

    // Mock the prompt module
    vi.doMock('../../src/prompt.js', () => ({
      buildSystemPrompt: vi.fn(() => 'You are a test assistant.'),
    }));

    // Mock session to avoid file system writes
    vi.doMock('../../src/session.js', () => ({
      saveSession: vi.fn(),
    }));

    // Mock normalizer (pass-through)
    vi.doMock('../../src/normalizer.js', () => ({
      normalizeMessages: (msgs: unknown[]) => msgs,
    }));

    // Mock compactor modules (no-op)
    vi.doMock('../../src/compactor/snip.js', () => ({
      snipCompact: (msgs: unknown[]) => ({ messages: msgs, tokensFreed: 0 }),
    }));
    vi.doMock('../../src/compactor/micro.js', () => ({
      microCompact: (msgs: unknown[]) => ({ messages: msgs, tokensFreed: 0 }),
    }));
    vi.doMock('../../src/compactor/auto.js', () => ({
      shouldAutoCompact: () => false,
      autoCompact: vi.fn().mockResolvedValue({ messages: [], failed: false }),
    }));
    vi.doMock('../../src/compactor/index.js', () => ({
      snipCompact: (msgs: unknown[]) => ({ messages: msgs, tokensFreed: 0 }),
      microCompact: (msgs: unknown[]) => ({ messages: msgs, tokensFreed: 0 }),
      shouldAutoCompact: () => false,
      autoCompact: vi.fn().mockResolvedValue({ messages: [], failed: false }),
      shouldCompact: () => false,
      compactConversation: vi.fn().mockResolvedValue({ messages: [], failed: false }),
    }));

    // Mock the ui module to capture output
    const printedText: string[] = [];
    const printedToolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
    const printedToolResults: Array<{ name: string; result: string }> = [];

    vi.doMock('../../src/ui.js', () => ({
      printAssistantText: vi.fn((text: string) => printedText.push(text)),
      printToolCall: vi.fn((name: string, input: Record<string, unknown>) =>
        printedToolCalls.push({ name, input })),
      printToolResult: vi.fn((name: string, result: string) =>
        printedToolResults.push({ name, result })),
    }));

    // Mock the markdown module to capture streaming text output
    vi.doMock('../../src/markdown.js', () => ({
      StreamingMarkdownRenderer: class {
        private text = '';
        push(chunk: string) {
          printedText.push(chunk);
          this.text += chunk;
          return chunk;
        }
        flush() {
          return '';
        }
        reset() {
          this.text = '';
        }
      },
      renderMarkdown: (text: string) => text,
      renderDiff: (oldContent: string, newContent: string, filePath: string) =>
        `--- a/${filePath}\n+++ b/${filePath}`,
    }));

    // Dynamically import Agent after mocking
    const { Agent } = await import('../../src/agent.js');

    const agent = new Agent({
      provider: 'anthropic',
      model: 'test-model',
      yolo: false,
      effectiveContextWindow: 200_000,
    });

    return { agent, printedText, printedToolCalls, printedToolResults };
  }

  it('should terminate loop when response has no tool calls', async () => {
    const { agent, printedText } = await createMockedAgent([
      { text: 'Hello! How can I help?', usage: { inputTokens: 100, outputTokens: 20 } },
    ]);

    // Mock process.stdout.write to avoid actual output
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Hi');

    expect(printedText).toEqual(['Hello! How can I help?']);
    expect(agent.messages.length).toBe(2); // user + assistant
    expect(agent.messages[0]).toEqual({ role: 'user', content: 'Hi' });

    writeSpy.mockRestore();
  });

  it('should track token usage correctly', async () => {
    const { agent } = await createMockedAgent([
      { text: 'Response 1', usage: { inputTokens: 100, outputTokens: 20 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Test');

    expect(agent.tokenUsage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
    });
  });

  it('should accumulate token usage across multiple chats', async () => {
    const { agent } = await createMockedAgent([
      { text: 'Response 1', usage: { inputTokens: 100, outputTokens: 20 } },
      { text: 'Response 2', usage: { inputTokens: 150, outputTokens: 30 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('First');
    await agent.chat('Second');

    expect(agent.tokenUsage).toEqual({
      inputTokens: 250,
      outputTokens: 50,
    });
  });

  it('should handle tool calls and continue loop', async () => {
    const { agent, printedToolCalls, printedToolResults } = await createMockedAgent([
      {
        text: '',
        toolCalls: [{ toolCallId: 'tc1', toolName: 'read_file', input: { file_path: 'test.ts' } }],
        toolResults: [{ toolCallId: 'tc1', toolName: 'read_file', input: { file_path: 'test.ts' }, output: '1 | console.log("hello")' }],
        usage: { inputTokens: 100, outputTokens: 30 },
      },
      {
        text: 'I read the file. It contains a hello world program.',
        usage: { inputTokens: 200, outputTokens: 40 },
      },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Read test.ts');

    // Should have printed tool call and result
    expect(printedToolCalls).toHaveLength(1);
    expect(printedToolCalls[0].name).toBe('read_file');
    expect(printedToolResults).toHaveLength(1);

    // Messages: user + assistant(tool call) + tool(result) + assistant(text)
    expect(agent.messages.length).toBe(4);
    expect(agent.tokenUsage).toEqual({
      inputTokens: 300,
      outputTokens: 70,
    });
  });

  it('should set isProcessing during chat', async () => {
    const { agent } = await createMockedAgent([
      { text: 'Done', usage: { inputTokens: 10, outputTokens: 5 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(agent.isProcessing).toBe(false);
    const chatPromise = agent.chat('Test');
    // isProcessing is set synchronously at the start
    // After await, it should be false again
    await chatPromise;
    expect(agent.isProcessing).toBe(false);
  });

  it('should clear history', async () => {
    const { agent } = await createMockedAgent([
      { text: 'Hello', usage: { inputTokens: 10, outputTokens: 5 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Hi');
    expect(agent.messages.length).toBeGreaterThan(0);

    agent.clearHistory();
    expect(agent.messages.length).toBe(0);
  });

  it('should expose config', async () => {
    const { agent } = await createMockedAgent([]);

    expect(agent.config).toEqual({
      provider: 'anthropic',
      model: 'test-model',
      yolo: false,
      effectiveContextWindow: 200_000,
    });
  });

  it('should expose confirmedCommands set', async () => {
    const { agent } = await createMockedAgent([]);
    expect(agent.confirmedCommands).toBeInstanceOf(Set);
    expect(agent.confirmedCommands.size).toBe(0);
  });
});
