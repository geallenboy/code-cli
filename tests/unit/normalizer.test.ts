/**
 * 消息规范化器单元测试
 *
 * 测试 normalizeMessages 的核心功能：
 * - 孤立 tool_use → 合成错误结果
 * - 孤立 tool_result → 移除
 * - 连续同角色消息 → 合并
 * - 幂等性
 * - 空消息列表
 */

import { describe, it, expect } from 'vitest';
import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import { normalizeMessages } from '../../src/normalizer.js';

describe('normalizeMessages', () => {
  it('should return empty array for empty input', () => {
    const result = normalizeMessages([]);
    expect(result).toEqual([]);
    // Should return the same reference for empty
    expect(result).toBe(result);
  });

  it('should pass through already-normalized messages unchanged', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-1',
            toolName: 'read_file',
            input: { path: 'test.ts' },
          } as ToolCallPart,
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'read_file',
            output: { type: 'text', value: 'file content' },
          } as ToolResultPart,
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Done!' }] },
    ];

    const result = normalizeMessages(messages);
    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
    expect(result[2].role).toBe('tool');
    expect(result[3].role).toBe('assistant');
  });

  it('should generate synthetic error result for orphaned tool_use', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Do something' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-orphan',
            toolName: 'write_file',
            input: { path: 'test.ts', content: 'hello' },
          } as ToolCallPart,
        ],
      },
      // No tool result for tc-orphan
    ];

    const result = normalizeMessages(messages);

    // Should have added a synthetic tool result message
    const toolMsg = result.find(
      (m) =>
        m.role === 'tool' &&
        Array.isArray(m.content) &&
        m.content.some(
          (p) =>
            p.type === 'tool-result' &&
            (p as ToolResultPart).toolCallId === 'tc-orphan',
        ),
    );
    expect(toolMsg).toBeDefined();

    const syntheticPart = (toolMsg!.content as ToolResultPart[]).find(
      (p) => (p as ToolResultPart).toolCallId === 'tc-orphan',
    ) as ToolResultPart;
    expect(syntheticPart).toBeDefined();
    expect(syntheticPart.output).toEqual({
      type: 'text',
      value: 'Tool execution was interrupted',
    });
  });

  it('should remove orphaned tool_result (no matching tool_use)', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-nonexistent',
            toolName: 'read_file',
            output: { type: 'text', value: 'stale result' },
          } as ToolResultPart,
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] },
    ];

    const result = normalizeMessages(messages);

    // The orphaned tool message should be removed entirely
    const toolMsgs = result.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(0);
    expect(result).toHaveLength(2);
  });

  it('should merge consecutive user messages', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'First message' },
      { role: 'user', content: 'Second message' },
      { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
    ];

    const result = normalizeMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('First message\n\nSecond message');
  });

  it('should be idempotent — normalizing twice produces equivalent result', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-1',
            toolName: 'read_file',
            input: { path: 'a.ts' },
          } as ToolCallPart,
        ],
      },
      // Orphaned tool_use — no result
      { role: 'user', content: 'Continue' },
      { role: 'user', content: 'Please' },
    ];

    const first = normalizeMessages(messages);
    const second = normalizeMessages(first);

    expect(second).toEqual(first);
  });

  it('should handle mixed orphaned tool_use and tool_result', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Do things' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tc-1',
            toolName: 'read_file',
            input: { path: 'a.ts' },
          } as ToolCallPart,
          {
            type: 'tool-call',
            toolCallId: 'tc-2',
            toolName: 'write_file',
            input: { path: 'b.ts', content: 'x' },
          } as ToolCallPart,
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'read_file',
            output: { type: 'text', value: 'content of a.ts' },
          } as ToolResultPart,
          // tc-2 result is missing
          {
            type: 'tool-result',
            toolCallId: 'tc-ghost',
            toolName: 'unknown',
            output: { type: 'text', value: 'orphaned result' },
          } as ToolResultPart,
        ],
      },
    ];

    const result = normalizeMessages(messages);

    // tc-ghost should be removed (orphaned tool_result)
    // tc-2 should get a synthetic result (orphaned tool_use)
    const allToolResults: ToolResultPart[] = [];
    for (const msg of result) {
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-result') {
            allToolResults.push(part as ToolResultPart);
          }
        }
      }
    }

    const ids = allToolResults.map((p) => p.toolCallId);
    expect(ids).toContain('tc-1'); // kept
    expect(ids).toContain('tc-2'); // synthetic added
    expect(ids).not.toContain('tc-ghost'); // removed
  });

  it('should handle messages with string content in assistant role', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Simple text response' },
    ];

    const result = normalizeMessages(messages);
    expect(result).toHaveLength(2);
    // No tool calls in string content, so no changes needed
  });
});


// ===== Property-Based Tests (fast-check) =====

import fc from 'fast-check';

/** Generate a random tool call ID */
const toolCallIdArb = fc.stringMatching(/^tc-[a-z0-9]{1,8}$/);

/**
 * **Validates: Requirements 4**
 * P6: Message Normalization Idempotency
 *
 * Normalizing an already-normalized message list produces an equivalent result.
 */
describe('P6: Message Normalization Idempotency', () => {
  it('normalizing twice produces the same result as normalizing once', () => {
    // Generate message sequences with paired tool calls/results
    const messagesArb = fc
      .tuple(
        fc.array(toolCallIdArb, { minLength: 0, maxLength: 3 }),
        fc.array(toolCallIdArb, { minLength: 0, maxLength: 2 }),
      )
      .chain(([pairedIds, orphanCallIds]) => {
        const messages: ModelMessage[] = [{ role: 'user', content: 'Start' }];

        // Add paired tool calls + results
        if (pairedIds.length > 0) {
          messages.push({
            role: 'assistant',
            content: pairedIds.map((id) => ({
              type: 'tool-call' as const,
              toolCallId: id,
              toolName: 'read_file',
              input: { path: 'test.ts' },
            })),
          });
          messages.push({
            role: 'tool',
            content: pairedIds.map((id) => ({
              type: 'tool-result' as const,
              toolCallId: id,
              toolName: 'read_file',
              output: { type: 'text' as const, value: 'result' },
            })),
          });
        }

        // Add orphaned tool calls (no results)
        if (orphanCallIds.length > 0) {
          messages.push({
            role: 'assistant',
            content: orphanCallIds.map((id) => ({
              type: 'tool-call' as const,
              toolCallId: `orphan-${id}`,
              toolName: 'write_file',
              input: { path: 'b.ts', content: 'x' },
            })),
          });
        }

        // Optionally add consecutive user messages
        return fc.tuple(
          fc.constant(messages),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 2 }),
        );
      })
      .map(([messages, extraUserMsgs]) => {
        for (const msg of extraUserMsgs) {
          messages.push({ role: 'user', content: msg });
        }
        return messages;
      });

    fc.assert(
      fc.property(messagesArb, (messages) => {
        const first = normalizeMessages(messages);
        const second = normalizeMessages(first);
        expect(second).toEqual(first);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Validates: Requirements 4.3**
 * P7: Orphaned tool_result Removal
 *
 * tool_result parts referencing non-existent tool_call_ids are removed by normalization.
 */
describe('P7: Orphaned tool_result Removal', () => {
  it('tool_results with no matching tool_call are removed', () => {
    const arb = fc
      .tuple(
        // IDs that have both call and result (paired)
        fc.array(toolCallIdArb, { minLength: 0, maxLength: 3 }),
        // IDs that only have results (orphaned results)
        fc.array(toolCallIdArb, { minLength: 1, maxLength: 3 }),
      )
      .filter(([paired, orphaned]) => {
        // Ensure orphaned IDs don't overlap with paired IDs
        const pairedSet = new Set(paired);
        return orphaned.every((id) => !pairedSet.has(id));
      });

    fc.assert(
      fc.property(arb, ([pairedIds, orphanedResultIds]) => {
        const messages: ModelMessage[] = [{ role: 'user', content: 'Start' }];

        // Add assistant with paired tool calls
        if (pairedIds.length > 0) {
          messages.push({
            role: 'assistant',
            content: pairedIds.map((id) => ({
              type: 'tool-call' as const,
              toolCallId: id,
              toolName: 'read_file',
              input: { path: 'test.ts' },
            })),
          });
        }

        // Add tool results: paired + orphaned
        const allResultIds = [...pairedIds, ...orphanedResultIds];
        messages.push({
          role: 'tool',
          content: allResultIds.map((id) => ({
            type: 'tool-result' as const,
            toolCallId: id,
            toolName: 'read_file',
            output: { type: 'text' as const, value: 'result' },
          })),
        });

        const result = normalizeMessages(messages);

        // Collect all remaining tool_result IDs
        const remainingResultIds = new Set<string>();
        for (const msg of result) {
          if (msg.role === 'tool' && Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'tool-result') {
                remainingResultIds.add((part as ToolResultPart).toolCallId);
              }
            }
          }
        }

        // Orphaned result IDs should NOT be present
        for (const orphanId of orphanedResultIds) {
          expect(remainingResultIds.has(orphanId)).toBe(false);
        }

        // Paired result IDs should still be present
        for (const pairedId of pairedIds) {
          expect(remainingResultIds.has(pairedId)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
