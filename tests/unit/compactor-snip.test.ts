/**
 * Snip 压缩器单元测试
 *
 * 测试 snipCompact：超过 10K 字符的旧工具结果被截断，
 * 最近 3 轮内的结果不受影响。
 */

import { describe, it, expect } from 'vitest';
import type { ModelMessage, ToolResultPart, ToolCallPart } from 'ai';
import { snipCompact } from '../../src/compactor/snip.js';

/** Helper: create a tool result message with a given output value */
function makeToolResult(toolCallId: string, value: string): ModelMessage {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName: 'read_file',
        output: { type: 'text', value },
      } as ToolResultPart,
    ],
  };
}

/** Helper: create an assistant message with a tool call */
function makeAssistantWithToolCall(toolCallId: string): ModelMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId,
        toolName: 'read_file',
        input: { path: 'test.ts' },
      } as ToolCallPart,
    ],
  };
}

/** Helper: generate a string of given length */
function makeString(length: number, char = 'x'): string {
  return char.repeat(length);
}

describe('snipCompact', () => {
  it('should snip tool results > 10K chars older than 3 exchanges', () => {
    const bigContent = makeString(15000);
    const messages: ModelMessage[] = [
      // Old exchange (will be snipped)
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', bigContent),
      // Recent exchanges (3 total — won't be snipped)
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'short result'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'short result'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'short result'),
    ];

    const result = snipCompact(messages);

    // The old tool result should be snipped
    const oldToolMsg = result.messages[1];
    const oldPart = (oldToolMsg.content as ToolResultPart[])[0];
    const outputValue = (oldPart.output as { value: string }).value;
    expect(outputValue).toContain('[snipped: original was 15000 chars]');
    expect(outputValue.length).toBeLessThan(15000);

    // Recent tool results should be untouched
    const recentToolMsg = result.messages[3];
    const recentPart = (recentToolMsg.content as ToolResultPart[])[0];
    expect((recentPart.output as { value: string }).value).toBe('short result');

    // Should report tokens freed
    expect(result.tokensFreed).toBeGreaterThan(0);
  });

  it('should NOT snip recent tool results (within 3 exchanges)', () => {
    const bigContent = makeString(15000);
    const messages: ModelMessage[] = [
      // Only 2 exchanges — everything is "recent"
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', bigContent),
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', bigContent),
    ];

    const result = snipCompact(messages);

    // Nothing should be snipped since we have fewer than 3 exchanges
    const part1 = (result.messages[1].content as ToolResultPart[])[0];
    expect((part1.output as { value: string }).value).toBe(bigContent);
    expect(result.tokensFreed).toBe(0);
  });

  it('should NOT snip tool results <= 10K chars', () => {
    const smallContent = makeString(9999);
    const messages: ModelMessage[] = [
      // Old exchange
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', smallContent),
      // 3 recent exchanges
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'short'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'short'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'short'),
    ];

    const result = snipCompact(messages);

    const oldPart = (result.messages[1].content as ToolResultPart[])[0];
    expect((oldPart.output as { value: string }).value).toBe(smallContent);
    expect(result.tokensFreed).toBe(0);
  });

  it('should calculate tokensFreed correctly', () => {
    const bigContent = makeString(12000);
    const messages: ModelMessage[] = [
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', bigContent),
      // 3 recent exchanges
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'short'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'short'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'short'),
    ];

    const result = snipCompact(messages);

    // Snipped content: 200 + placeholder + 200 chars
    // Original: 12000 chars
    // Freed chars ≈ 12000 - (200 + ~40 + 200) ≈ 11560
    // Tokens freed ≈ 11560 / 4 ≈ 2890
    expect(result.tokensFreed).toBeGreaterThan(2500);
    expect(result.tokensFreed).toBeLessThan(3500);
  });

  it('should preserve tool_call_id in snipped results', () => {
    const bigContent = makeString(15000);
    const messages: ModelMessage[] = [
      makeAssistantWithToolCall('my-unique-id'),
      makeToolResult('my-unique-id', bigContent),
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'short'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'short'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'short'),
    ];

    const result = snipCompact(messages);

    const snippedPart = (result.messages[1].content as ToolResultPart[])[0];
    expect(snippedPart.toolCallId).toBe('my-unique-id');
  });

  it('should handle messages with no tool results', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    const result = snipCompact(messages);
    expect(result.messages).toEqual(messages);
    expect(result.tokensFreed).toBe(0);
  });

  it('should handle string output format', () => {
    const bigContent = makeString(15000);
    const messages: ModelMessage[] = [
      makeAssistantWithToolCall('tc-1'),
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'read_file',
            output: bigContent,
          } as ToolResultPart,
        ],
      },
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'short'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'short'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'short'),
    ];

    const result = snipCompact(messages);
    const snippedPart = (result.messages[1].content as ToolResultPart[])[0];
    expect(typeof snippedPart.output).toBe('string');
    expect(snippedPart.output as string).toContain('[snipped: original was 15000 chars]');
    expect(result.tokensFreed).toBeGreaterThan(0);
  });
});
