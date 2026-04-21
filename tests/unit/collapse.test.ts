/**
 * Context Collapse 单元测试
 *
 * 测试 applyCollapse：投影式折叠不活跃对话段。
 */

import { describe, it, expect } from 'vitest';
import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import { applyCollapse } from '../../src/compactor/collapse.js';

/** Helper: create a user message */
function makeUser(content: string): ModelMessage {
  return { role: 'user', content };
}

/** Helper: create an assistant text message */
function makeAssistant(content: string): ModelMessage {
  return { role: 'assistant', content };
}

/** Helper: create an assistant message with a tool call */
function makeAssistantWithToolCall(toolCallId: string, toolName = 'read_file'): ModelMessage {
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId,
        toolName,
        input: { path: 'test.ts' },
      } as ToolCallPart,
    ],
  };
}

/** Helper: create a tool result message */
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

/** Helper: generate a string of given length */
function makeString(length: number, char = 'x'): string {
  return char.repeat(length);
}

describe('applyCollapse', () => {
  it('should return messages unchanged when fewer than 8 messages', () => {
    const messages: ModelMessage[] = [
      makeUser('Hello'),
      makeAssistant('Hi'),
      makeUser('How are you?'),
      makeAssistant('Good'),
    ];

    const result = applyCollapse(messages);
    expect(result.projected).toBe(messages);
    expect(result.tokensFreed).toBe(0);
  });

  it('should fold inactive segment and preserve recent turns', () => {
    // Build a conversation with enough content to trigger collapse
    const longContent = makeString(3000);
    const messages: ModelMessage[] = [
      makeUser('Initial question'),
      // Old segment (will be collapsed)
      makeAssistantWithToolCall('tc-old-1', 'read_file'),
      makeToolResult('tc-old-1', longContent),
      makeAssistant('Here is the analysis of the file.'),
      makeUser('Thanks, now do something else'),
      // 5 recent assistant turns
      makeAssistant('Sure, working on it.'),
      makeUser('More input'),
      makeAssistant('Processing...'),
      makeUser('Continue'),
      makeAssistant('Almost done.'),
      makeUser('Final'),
      makeAssistant('Here is the result.'),
      makeUser('One more thing'),
      makeAssistant('Done!'),
      makeUser('Last question'),
      makeAssistant('Final answer.'),
    ];

    const result = applyCollapse(messages);

    // Should have collapsed — tokensFreed > 0
    expect(result.tokensFreed).toBeGreaterThan(0);

    // First message should be preserved
    expect(result.projected[0]).toBe(messages[0]);

    // Should have a collapse summary message
    const collapseMsg = result.projected[1];
    expect(collapseMsg.role).toBe('user');
    expect(typeof collapseMsg.content).toBe('string');
    expect(collapseMsg.content as string).toContain('[Collapsed');

    // Should have the acknowledgment message
    expect(result.projected[2].role).toBe('assistant');

    // Recent messages should be preserved at the end
    const lastProjected = result.projected[result.projected.length - 1];
    const lastOriginal = messages[messages.length - 1];
    expect(lastProjected).toBe(lastOriginal);
  });

  it('should preserve tool_use/tool_result pairing in recent section', () => {
    const longContent = makeString(3000);
    const messages: ModelMessage[] = [
      makeUser('Start'),
      // Old segment
      makeAssistant('Old text ' + longContent),
      makeUser('Old question'),
      makeAssistant('Old answer ' + longContent),
      makeUser('Another old question'),
      // Recent section with tool call/result pairs
      makeAssistantWithToolCall('tc-recent-1', 'edit_file'),
      makeToolResult('tc-recent-1', 'File edited'),
      makeAssistantWithToolCall('tc-recent-2', 'read_file'),
      makeToolResult('tc-recent-2', 'File content'),
      makeAssistantWithToolCall('tc-recent-3', 'grep_search'),
      makeToolResult('tc-recent-3', 'Search results'),
      makeAssistantWithToolCall('tc-recent-4', 'write_file'),
      makeToolResult('tc-recent-4', 'File written'),
      makeAssistantWithToolCall('tc-recent-5', 'list_files'),
      makeToolResult('tc-recent-5', 'Files listed'),
    ];

    const result = applyCollapse(messages);

    // Check that recent tool call/result pairs are preserved
    const recentMessages = result.projected.slice(3); // Skip first user + collapse pair
    for (const msg of recentMessages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'tool-call') {
            const tc = part as ToolCallPart;
            // Find matching tool result
            const hasResult = recentMessages.some(
              (m) =>
                m.role === 'tool' &&
                Array.isArray(m.content) &&
                m.content.some(
                  (p) =>
                    p.type === 'tool-result' &&
                    (p as ToolResultPart).toolCallId === tc.toolCallId,
                ),
            );
            expect(hasResult).toBe(true);
          }
        }
      }
    }
  });

  it('should calculate tokensFreed correctly', () => {
    const longContent = makeString(4000);
    const messages: ModelMessage[] = [
      makeUser('Start'),
      // Old segment with known size
      makeAssistant(longContent),
      makeUser('Question'),
      makeAssistant(longContent),
      makeUser('Another'),
      // 5 recent assistant turns
      makeAssistant('r1'),
      makeUser('u1'),
      makeAssistant('r2'),
      makeUser('u2'),
      makeAssistant('r3'),
      makeUser('u3'),
      makeAssistant('r4'),
      makeUser('u4'),
      makeAssistant('r5'),
    ];

    const result = applyCollapse(messages);

    // tokensFreed should be positive and reasonable
    expect(result.tokensFreed).toBeGreaterThan(0);
    // Rough check: collapsed ~8000+ chars, summary is short
    // tokensFreed ≈ (collapsedChars/4) - (summaryChars/4)
    expect(result.tokensFreed).toBeGreaterThan(100);
  });

  it('should not collapse when content is too small', () => {
    const messages: ModelMessage[] = [
      makeUser('Start'),
      makeAssistant('Short'),
      makeUser('Q'),
      makeAssistant('A'),
      makeUser('Q2'),
      makeAssistant('r1'),
      makeUser('u1'),
      makeAssistant('r2'),
      makeUser('u2'),
      makeAssistant('r3'),
      makeUser('u3'),
      makeAssistant('r4'),
      makeUser('u4'),
      makeAssistant('r5'),
    ];

    const result = applyCollapse(messages);
    // Content is too small (< 2000 chars), should not collapse
    expect(result.projected).toBe(messages);
    expect(result.tokensFreed).toBe(0);
  });

  it('should include tool names in collapse summary', () => {
    const longContent = makeString(3000);
    const messages: ModelMessage[] = [
      makeUser('Start'),
      // Old segment with tool calls
      makeAssistantWithToolCall('tc-1', 'read_file'),
      makeToolResult('tc-1', longContent),
      makeAssistantWithToolCall('tc-2', 'edit_file'),
      makeToolResult('tc-2', longContent),
      makeUser('Continue'),
      // 5 recent turns
      makeAssistant('r1'),
      makeUser('u1'),
      makeAssistant('r2'),
      makeUser('u2'),
      makeAssistant('r3'),
      makeUser('u3'),
      makeAssistant('r4'),
      makeUser('u4'),
      makeAssistant('r5'),
    ];

    const result = applyCollapse(messages);
    expect(result.tokensFreed).toBeGreaterThan(0);

    const collapseMsg = result.projected[1];
    const content = collapseMsg.content as string;
    expect(content).toContain('read_file');
    expect(content).toContain('edit_file');
  });
});
