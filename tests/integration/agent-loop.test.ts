/**
 * Agent Loop 集成测试
 *
 * 测试完整流程：用户输入 → API 调用（mock）→ 工具执行 → 结果注入 → 循环终止
 * 测试多轮工具调用场景
 * 测试消息历史正确累积
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Agent Loop Integration', () => {
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
   * Helper to create an Agent with mocked dependencies and configurable streamText responses.
   */
  async function createMockedAgent(streamTextResponses: Array<{
    text: string;
    toolCalls?: Array<{ toolCallId: string; toolName: string; input: Record<string, unknown> }>;
    toolResults?: Array<{ toolCallId: string; toolName: string; input: Record<string, unknown>; output: string }>;
    usage?: { inputTokens: number; outputTokens: number };
  }>, agentConfig?: { yolo?: boolean; effectiveContextWindow?: number }) {
    let callIndex = 0;

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
              totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            }),
            response: Promise.resolve({ messages: [] }),
            steps: Promise.resolve([]),
          };
        }),
        stepCountIs: vi.fn(() => () => true),
        tool: vi.fn((def: unknown) => def),
        generateText: vi.fn().mockResolvedValue({ text: 'Summary of conversation' }),
      };
    });

    vi.doMock('../../src/provider.js', () => ({
      createModel: vi.fn(() => mockModelInstance),
    }));

    vi.doMock('../../src/tools/index.js', () => ({
      getToolDefinitions: vi.fn(() => ({})),
    }));

    vi.doMock('../../src/prompt.js', () => ({
      buildSystemPrompt: vi.fn(() => 'You are a test assistant.'),
    }));

    // Mock session to avoid file system writes during tests
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

    const { Agent } = await import('../../src/agent.js');

    const agent = new Agent({
      provider: 'anthropic',
      model: 'test-model',
      yolo: agentConfig?.yolo ?? false,
      effectiveContextWindow: agentConfig?.effectiveContextWindow ?? 200_000,
    });

    return { agent, printedText, printedToolCalls, printedToolResults };
  }

  // ===== Complete flow tests =====

  it('should complete a simple flow: user input → API call → text response → loop termination', async () => {
    const { agent, printedText } = await createMockedAgent([
      { text: 'Hello! I can help you with coding.', usage: { inputTokens: 50, outputTokens: 15 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Hi there');

    // Verify messages accumulated correctly
    expect(agent.messages).toHaveLength(2);
    expect(agent.messages[0]).toEqual({ role: 'user', content: 'Hi there' });
    expect(agent.messages[1].role).toBe('assistant');

    // Verify text was streamed
    expect(printedText).toEqual(['Hello! I can help you with coding.']);

    // Verify token tracking
    expect(agent.tokenUsage.inputTokens).toBe(50);
    expect(agent.tokenUsage.outputTokens).toBe(15);
  });

  it('should handle single tool call: user input → tool execution → result injection → final response', async () => {
    const { agent, printedToolCalls, printedToolResults, printedText } = await createMockedAgent([
      {
        text: '',
        toolCalls: [{ toolCallId: 'call-1', toolName: 'read_file', input: { file_path: 'src/main.ts' } }],
        toolResults: [{ toolCallId: 'call-1', toolName: 'read_file', input: { file_path: 'src/main.ts' }, output: '1 | console.log("hello")' }],
        usage: { inputTokens: 100, outputTokens: 30 },
      },
      {
        text: 'The file contains a hello world program.',
        usage: { inputTokens: 200, outputTokens: 25 },
      },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Read src/main.ts');

    // Messages: user + assistant(tool call) + tool(result) + assistant(text)
    expect(agent.messages).toHaveLength(4);
    expect(agent.messages[0].role).toBe('user');
    expect(agent.messages[1].role).toBe('assistant');
    expect(agent.messages[2].role).toBe('tool');
    expect(agent.messages[3].role).toBe('assistant');

    // Verify tool call was printed
    expect(printedToolCalls).toHaveLength(1);
    expect(printedToolCalls[0].name).toBe('read_file');

    // Verify tool result was printed
    expect(printedToolResults).toHaveLength(1);

    // Verify final text
    expect(printedText).toContain('The file contains a hello world program.');

    // Verify cumulative token usage
    expect(agent.tokenUsage.inputTokens).toBe(300);
    expect(agent.tokenUsage.outputTokens).toBe(55);
  });

  it('should handle multi-round tool calls', async () => {
    const { agent, printedToolCalls } = await createMockedAgent([
      // Round 1: read a file
      {
        text: '',
        toolCalls: [{ toolCallId: 'tc1', toolName: 'read_file', input: { file_path: 'package.json' } }],
        toolResults: [{ toolCallId: 'tc1', toolName: 'read_file', input: { file_path: 'package.json' }, output: '{"name": "test"}' }],
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      // Round 2: edit the file
      {
        text: '',
        toolCalls: [{ toolCallId: 'tc2', toolName: 'edit_file', input: { file_path: 'package.json', old_string: '"test"', new_string: '"updated"' } }],
        toolResults: [{ toolCallId: 'tc2', toolName: 'edit_file', input: { file_path: 'package.json', old_string: '"test"', new_string: '"updated"' }, output: 'File edited successfully' }],
        usage: { inputTokens: 200, outputTokens: 30 },
      },
      // Round 3: final text response
      {
        text: 'I updated the package name from "test" to "updated".',
        usage: { inputTokens: 300, outputTokens: 25 },
      },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Update the package name');

    // Messages: user + (assistant+tool) * 2 rounds + final assistant = 1 + 2 + 2 + 1 = 6
    expect(agent.messages).toHaveLength(6);

    // Verify both tool calls were made
    expect(printedToolCalls).toHaveLength(2);
    expect(printedToolCalls[0].name).toBe('read_file');
    expect(printedToolCalls[1].name).toBe('edit_file');

    // Verify cumulative tokens across all rounds
    expect(agent.tokenUsage.inputTokens).toBe(600);
    expect(agent.tokenUsage.outputTokens).toBe(75);
  });

  it('should accumulate messages across multiple chat calls', async () => {
    const { agent } = await createMockedAgent([
      { text: 'First response', usage: { inputTokens: 50, outputTokens: 10 } },
      { text: 'Second response', usage: { inputTokens: 100, outputTokens: 20 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('First message');
    expect(agent.messages).toHaveLength(2); // user + assistant

    await agent.chat('Second message');
    expect(agent.messages).toHaveLength(4); // 2 from first + 2 from second

    // Verify message order
    expect(agent.messages[0]).toEqual({ role: 'user', content: 'First message' });
    expect(agent.messages[1].role).toBe('assistant');
    expect(agent.messages[2]).toEqual({ role: 'user', content: 'Second message' });
    expect(agent.messages[3].role).toBe('assistant');
  });

  it('should handle empty text with tool calls correctly', async () => {
    const { agent } = await createMockedAgent([
      {
        text: '',
        toolCalls: [{ toolCallId: 'tc1', toolName: 'run_shell', input: { command: 'echo hello' } }],
        toolResults: [{ toolCallId: 'tc1', toolName: 'run_shell', input: { command: 'echo hello' }, output: 'hello\n' }],
        usage: { inputTokens: 50, outputTokens: 15 },
      },
      {
        text: 'Command executed successfully.',
        usage: { inputTokens: 100, outputTokens: 10 },
      },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Run echo hello');

    // The assistant message with empty text but tool calls should still be added
    const assistantMessages = agent.messages.filter(m => m.role === 'assistant');
    expect(assistantMessages.length).toBe(2);
  });

  it('should restore messages and continue conversation', async () => {
    const { agent } = await createMockedAgent([
      { text: 'Continuing from where we left off.', usage: { inputTokens: 150, outputTokens: 20 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Simulate restoring a previous session
    agent.restoreMessages([
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: [{ type: 'text' as const, text: 'Previous answer' }] },
    ]);

    expect(agent.messages).toHaveLength(2);

    await agent.chat('Follow up question');

    // Should have: 2 restored + 1 new user + 1 new assistant = 4
    expect(agent.messages).toHaveLength(4);
    expect(agent.messages[2]).toEqual({ role: 'user', content: 'Follow up question' });
  });

  it('should clear history and start fresh', async () => {
    const { agent } = await createMockedAgent([
      { text: 'First', usage: { inputTokens: 10, outputTokens: 5 } },
      { text: 'After clear', usage: { inputTokens: 10, outputTokens: 5 } },
    ]);

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await agent.chat('Hello');
    expect(agent.messages).toHaveLength(2);

    agent.clearHistory();
    expect(agent.messages).toHaveLength(0);

    await agent.chat('Fresh start');
    expect(agent.messages).toHaveLength(2);
    expect(agent.messages[0]).toEqual({ role: 'user', content: 'Fresh start' });
  });
});
