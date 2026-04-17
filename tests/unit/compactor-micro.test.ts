/**
 * Micro 压缩器单元测试
 *
 * 测试 microCompact：超过 5 轮前的工具结果被压缩到 500 字符 + [compressed]。
 * 最近 5 轮内的结果不受影响。
 */

import { describe, it, expect } from 'vitest';
import type { ModelMessage, ToolResultPart, ToolCallPart } from 'ai';
import { microCompact } from '../../src/compactor/micro.js';

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
function makeString(length: number, char = 'a'): string {
  return char.repeat(length);
}

describe('microCompact', () => {
  it('should compress tool results older than 5 exchanges to 500 chars', () => {
    const longContent = makeString(2000);
    const messages: ModelMessage[] = [
      // Old exchange (will be compressed)
      makeAssistantWithToolCall('tc-old'),
      makeToolResult('tc-old', longContent),
      // 5 recent exchanges
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', 'recent 1'),
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'recent 2'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'recent 3'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'recent 4'),
      makeAssistantWithToolCall('tc-5'),
      makeToolResult('tc-5', 'recent 5'),
    ];

    const result = microCompact(messages);

    // Old tool result should be compressed
    const oldPart = (result.messages[1].content as ToolResultPart[])[0];
    const outputValue = (oldPart.output as { value: string }).value;
    expect(outputValue).toContain('[compressed]');
    expect(outputValue.length).toBeLessThanOrEqual(500 + ' [compressed]'.length);

    // Recent results should be untouched
    const recentPart = (result.messages[3].content as ToolResultPart[])[0];
    expect((recentPart.output as { value: string }).value).toBe('recent 1');

    expect(result.tokensFreed).toBeGreaterThan(0);
  });

  it('should NOT compress recent tool results (within 5 exchanges)', () => {
    const longContent = makeString(2000);
    const messages: ModelMessage[] = [
      // Only 4 exchanges — everything is "recent"
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', longContent),
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', longContent),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', longContent),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', longContent),
    ];

    const result = microCompact(messages);

    // Nothing should be compressed
    for (let i = 1; i < result.messages.length; i += 2) {
      const part = (result.messages[i].content as ToolResultPart[])[0];
      expect((part.output as { value: string }).value).toBe(longContent);
    }
    expect(result.tokensFreed).toBe(0);
  });

  it('should NOT compress tool results <= 500 chars', () => {
    const shortContent = makeString(400);
    const messages: ModelMessage[] = [
      // Old exchange with short content
      makeAssistantWithToolCall('tc-old'),
      makeToolResult('tc-old', shortContent),
      // 5 recent exchanges
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', 'r'),
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'r'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'r'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'r'),
      makeAssistantWithToolCall('tc-5'),
      makeToolResult('tc-5', 'r'),
    ];

    const result = microCompact(messages);

    const oldPart = (result.messages[1].content as ToolResultPart[])[0];
    expect((oldPart.output as { value: string }).value).toBe(shortContent);
    expect(result.tokensFreed).toBe(0);
  });

  it('should preserve tool_call_id in compressed results', () => {
    const longContent = makeString(2000);
    const messages: ModelMessage[] = [
      makeAssistantWithToolCall('unique-id-123'),
      makeToolResult('unique-id-123', longContent),
      makeAssistantWithToolCall('tc-1'),
      makeToolResult('tc-1', 'r'),
      makeAssistantWithToolCall('tc-2'),
      makeToolResult('tc-2', 'r'),
      makeAssistantWithToolCall('tc-3'),
      makeToolResult('tc-3', 'r'),
      makeAssistantWithToolCall('tc-4'),
      makeToolResult('tc-4', 'r'),
      makeAssistantWithToolCall('tc-5'),
      makeToolResult('tc-5', 'r'),
    ];

    const result = microCompact(messages);

    const compressedPart = (result.messages[1].content as ToolResultPart[])[0];
    expect(compressedPart.toolCallId).toBe('unique-id-123');
  });

  it('should handle empty message list', () => {
    const result = microCompact([]);
    expect(result.messages).toEqual([]);
    expect(result.tokensFreed).toBe(0);
  });

  it('should handle messages with no tool results', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    const result = microCompact(messages);
    expect(result.messages).toEqual(messages);
    expect(result.tokensFreed).toBe(0);
  });
});
