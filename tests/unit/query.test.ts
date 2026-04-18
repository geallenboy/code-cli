/**
 * Query Loop 错误恢复单元测试
 *
 * 测试 query() generator 的错误恢复逻辑：
 * - PTL 错误 → autocompact → 重试
 * - MOT 错误 → 升级 maxOutputTokens → 重试
 * - MOT 续写 → 注入续写提示 → 最多 3 次
 * - 不可恢复错误 → yield error + return
 * - isPTLError / isMOTError 辅助函数
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPTLError, isMOTError } from '../../src/query.js';
import type { StreamEvent, Terminal } from '../../src/types.js';

// ===== Helper function tests =====

describe('isPTLError', () => {
  it('should return true for status 400 with "prompt is too long"', () => {
    const error = { status: 400, message: 'prompt is too long' };
    expect(isPTLError(error)).toBe(true);
  });

  it('should return true for status 400 with "too many tokens"', () => {
    const error = { status: 400, message: 'too many tokens in the input' };
    expect(isPTLError(error)).toBe(true);
  });

  it('should return true for status 400 with "context_length_exceeded"', () => {
    const error = { status: 400, message: 'context_length_exceeded' };
    expect(isPTLError(error)).toBe(true);
  });

  it('should return false for status 400 without PTL keywords', () => {
    const error = { status: 400, message: 'invalid request' };
    expect(isPTLError(error)).toBe(false);
  });

  it('should return false for non-400 status with PTL keywords', () => {
    const error = { status: 500, message: 'prompt is too long' };
    expect(isPTLError(error)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isPTLError(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isPTLError('error string')).toBe(false);
  });

  it('should return false for object without message', () => {
    expect(isPTLError({ status: 400 })).toBe(false);
  });
});

describe('isMOTError', () => {
  it('should return true for "max_output_tokens"', () => {
    const error = { message: 'max_output_tokens exceeded' };
    expect(isMOTError(error)).toBe(true);
  });

  it('should return true for "max_tokens"', () => {
    const error = { message: 'max_tokens limit reached' };
    expect(isMOTError(error)).toBe(true);
  });

  it('should return false for unrelated error', () => {
    const error = { message: 'network timeout' };
    expect(isMOTError(error)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isMOTError(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isMOTError(42)).toBe(false);
  });
});

// ===== query() error recovery integration tests =====

// We need to mock several modules to test query() in isolation
const { mockStreamText, mockAutoCompact } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockAutoCompact: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: mockStreamText,
    stepCountIs: () => () => false,
  };
});

vi.mock('../../src/compactor/auto.js', () => ({
  shouldAutoCompact: () => false,
  autoCompact: mockAutoCompact,
}));

vi.mock('../../src/compactor/snip.js', () => ({
  snipCompact: (msgs: unknown[]) => ({ messages: msgs, tokensFreed: 0 }),
}));

vi.mock('../../src/compactor/micro.js', () => ({
  microCompact: (msgs: unknown[]) => ({ messages: msgs, tokensFreed: 0 }),
}));

vi.mock('../../src/prompt.js', () => ({
  buildSystemPrompt: () => 'system prompt',
}));

vi.mock('../../src/tools/index.js', () => ({
  getToolDefinitions: () => ({}),
}));

vi.mock('../../src/normalizer.js', () => ({
  normalizeMessages: (msgs: unknown[]) => msgs,
}));

import { query, type QueryParams } from '../../src/query.js';
import type { LanguageModel, ModelMessage } from 'ai';

/** Helper to create a mock streamText result that returns text with no tool calls */
function createMockStreamResult(text: string) {
  return {
    textStream: (async function* () {
      yield text;
    })(),
    text: Promise.resolve(text),
    usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
    toolCalls: Promise.resolve([]),
    toolResults: Promise.resolve([]),
  };
}

/** Helper to collect all events from the query generator */
async function collectEvents(
  gen: AsyncGenerator<StreamEvent, Terminal>,
): Promise<{ events: StreamEvent[]; terminal: Terminal }> {
  const events: StreamEvent[] = [];
  let result = await gen.next();
  while (!result.done) {
    events.push(result.value);
    result = await gen.next();
  }
  return { events, terminal: result.value };
}

function makeParams(messages?: ModelMessage[]): QueryParams {
  return {
    model: {} as LanguageModel,
    messages: messages ?? [{ role: 'user', content: 'Hello' }],
    toolContext: { yolo: false, confirm: async () => true, confirmedCommands: new Set() },
    effectiveContextWindow: 100000,
    maxTurns: 10,
  };
}

describe('query() error recovery', () => {
  beforeEach(() => {
    mockStreamText.mockReset();
    mockAutoCompact.mockReset();
  });

  it('should handle PTL error by triggering autocompact and retrying', async () => {
    // First call: throw PTL error
    // Second call: succeed
    let callCount = 0;
    mockStreamText.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw { status: 400, message: 'prompt is too long' };
      }
      return createMockStreamResult('Recovery succeeded');
    });

    mockAutoCompact.mockResolvedValue({
      messages: [{ role: 'user', content: 'Hello' }],
      failed: false,
    });

    const params = makeParams();
    const { events, terminal } = await collectEvents(query(params));

    expect(terminal.reason).toBe('complete');
    // Should have a compact event from PTL recovery
    const compactEvents = events.filter((e) => e.type === 'compact');
    expect(compactEvents.length).toBeGreaterThanOrEqual(1);
    expect(callCount).toBe(2);
  });

  it('should yield error and terminate when PTL autocompact fails', async () => {
    mockStreamText.mockImplementation(() => {
      throw { status: 400, message: 'prompt is too long' };
    });

    mockAutoCompact.mockResolvedValue({
      messages: [{ role: 'user', content: 'Hello' }],
      failed: true,
    });

    const params = makeParams();
    const { events, terminal } = await collectEvents(query(params));

    expect(terminal.reason).toBe('error');
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { type: 'error'; error: Error }).error.message).toContain(
      'Context too long',
    );
  });

  it('should handle MOT error by escalating maxOutputTokens to 16384', async () => {
    let callCount = 0;
    mockStreamText.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw { message: 'max_output_tokens exceeded' };
      }
      return createMockStreamResult('Escalation succeeded');
    });

    const params = makeParams();
    const { terminal } = await collectEvents(query(params));

    expect(terminal.reason).toBe('complete');
    expect(callCount).toBe(2);
  });

  it('should handle MOT continuation with injected prompt up to 3 times', async () => {
    let callCount = 0;
    mockStreamText.mockImplementation(() => {
      callCount++;
      // First call: MOT error (triggers escalation to 16384)
      // Second call: MOT error again (escalation already used, triggers continuation 1)
      // Third call: MOT error (continuation 2)
      // Fourth call: MOT error (continuation 3)
      // Fifth call: MOT error (all exhausted → error)
      throw { message: 'max_output_tokens exceeded' };
    });

    const params = makeParams();
    const { events, terminal } = await collectEvents(query(params));

    // 1 escalation + 3 continuations = 4 retries, then error on 5th
    expect(terminal.reason).toBe('error');
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { type: 'error'; error: Error }).error.message).toContain(
      'Output too long',
    );
    // 1 initial + 1 escalation + 3 continuations = 5 calls
    expect(callCount).toBe(5);
  });

  it('should yield error and terminate for non-recoverable errors', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('Unknown API failure');
    });

    const params = makeParams();
    const { events, terminal } = await collectEvents(query(params));

    expect(terminal.reason).toBe('error');
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { type: 'error'; error: Error }).error.message).toBe(
      'Unknown API failure',
    );
  });

  it('should withhold PTL errors during recovery (error withholding)', async () => {
    // PTL error → autocompact succeeds → retry succeeds
    // No error event should be yielded
    let callCount = 0;
    mockStreamText.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw { status: 400, message: 'context_length_exceeded' };
      }
      return createMockStreamResult('Recovered');
    });

    mockAutoCompact.mockResolvedValue({
      messages: [{ role: 'user', content: 'Hello' }],
      failed: false,
    });

    const params = makeParams();
    const { events, terminal } = await collectEvents(query(params));

    expect(terminal.reason).toBe('complete');
    // No error events should be yielded — error was withheld
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(0);
  });

  it('should withhold MOT errors during recovery (error withholding)', async () => {
    // MOT error → escalation → retry succeeds
    // No error event should be yielded
    let callCount = 0;
    mockStreamText.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw { message: 'max_output_tokens exceeded' };
      }
      return createMockStreamResult('Escalated and recovered');
    });

    const params = makeParams();
    const { events, terminal } = await collectEvents(query(params));

    expect(terminal.reason).toBe('complete');
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(0);
  });
});


// ===== Property-Based Tests (fast-check) =====

import fc from 'fast-check';

/**
 * **Validates: Requirements 3.7**
 * P4: Error Withholding Correctness
 *
 * When PTL/MOT recovery succeeds, no error event is yielded to QueryEngine.
 * When recovery fails, exactly one error event is yielded.
 */
describe('P4: Error Withholding Correctness', () => {
  beforeEach(() => {
    mockStreamText.mockReset();
    mockAutoCompact.mockReset();
  });

  it('PTL recovery success → zero error events yielded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'prompt is too long',
          'too many tokens',
          'context_length_exceeded',
        ),
        async (ptlMessage) => {
          mockStreamText.mockReset();
          mockAutoCompact.mockReset();

          let callCount = 0;
          mockStreamText.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              throw { status: 400, message: ptlMessage };
            }
            return createMockStreamResult('Recovered');
          });

          mockAutoCompact.mockResolvedValue({
            messages: [{ role: 'user', content: 'Hello' }],
            failed: false,
          });

          const params = makeParams();
          const { events, terminal } = await collectEvents(query(params));

          // Recovery succeeded → no error events
          const errorEvents = events.filter((e) => e.type === 'error');
          expect(errorEvents).toHaveLength(0);
          expect(terminal.reason).toBe('complete');
        },
      ),
      { numRuns: 10 },
    );
  });

  it('PTL recovery failure → exactly one error event yielded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'prompt is too long',
          'too many tokens',
          'context_length_exceeded',
        ),
        async (ptlMessage) => {
          mockStreamText.mockReset();
          mockAutoCompact.mockReset();

          mockStreamText.mockImplementation(() => {
            throw { status: 400, message: ptlMessage };
          });

          mockAutoCompact.mockResolvedValue({
            messages: [{ role: 'user', content: 'Hello' }],
            failed: true,
          });

          const params = makeParams();
          const { events, terminal } = await collectEvents(query(params));

          // Recovery failed → exactly one error event
          const errorEvents = events.filter((e) => e.type === 'error');
          expect(errorEvents).toHaveLength(1);
          expect(terminal.reason).toBe('error');
        },
      ),
      { numRuns: 10 },
    );
  });

  it('MOT recovery success → zero error events yielded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('max_output_tokens exceeded', 'max_tokens limit reached'),
        async (motMessage) => {
          mockStreamText.mockReset();
          mockAutoCompact.mockReset();

          let callCount = 0;
          mockStreamText.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              throw { message: motMessage };
            }
            return createMockStreamResult('Escalated');
          });

          const params = makeParams();
          const { events, terminal } = await collectEvents(query(params));

          // MOT escalation succeeded → no error events
          const errorEvents = events.filter((e) => e.type === 'error');
          expect(errorEvents).toHaveLength(0);
          expect(terminal.reason).toBe('complete');
        },
      ),
      { numRuns: 10 },
    );
  });

  it('MOT all recovery exhausted → exactly one error event yielded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('max_output_tokens exceeded', 'max_tokens limit reached'),
        async (motMessage) => {
          mockStreamText.mockReset();
          mockAutoCompact.mockReset();

          // Always throw MOT → exhaust all recovery
          mockStreamText.mockImplementation(() => {
            throw { message: motMessage };
          });

          const params = makeParams();
          const { events, terminal } = await collectEvents(query(params));

          const errorEvents = events.filter((e) => e.type === 'error');
          expect(errorEvents).toHaveLength(1);
          expect(terminal.reason).toBe('error');
        },
      ),
      { numRuns: 10 },
    );
  });
});

/**
 * **Validates: Requirements 3.6**
 * P5: MOT Continuation Max 3 Times
 *
 * mot_continuation retries at most 3 times before stopping.
 * Total MOT calls = 1 initial + 1 escalation + 3 continuations = 5.
 */
describe('P5: MOT Continuation Max 3 Times', () => {
  beforeEach(() => {
    mockStreamText.mockReset();
    mockAutoCompact.mockReset();
  });

  it('MOT continuation never exceeds 3 retries (5 total calls)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('max_output_tokens exceeded', 'max_tokens limit reached'),
        async (motMessage) => {
          mockStreamText.mockReset();
          mockAutoCompact.mockReset();

          let callCount = 0;
          mockStreamText.mockImplementation(() => {
            callCount++;
            throw { message: motMessage };
          });

          const params = makeParams();
          const { terminal } = await collectEvents(query(params));

          // 1 initial + 1 escalation + 3 continuations = 5 total calls
          expect(callCount).toBe(5);
          expect(terminal.reason).toBe('error');
        },
      ),
      { numRuns: 10 },
    );
  });

  it('MOT continuation stops early if recovery succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // succeedAt: which call number succeeds (2 = after escalation, 3-4 = during continuation)
        fc.integer({ min: 2, max: 5 }),
        async (succeedAt) => {
          mockStreamText.mockReset();
          mockAutoCompact.mockReset();

          let callCount = 0;
          mockStreamText.mockImplementation(() => {
            callCount++;
            if (callCount === succeedAt) {
              return createMockStreamResult('Recovered');
            }
            throw { message: 'max_output_tokens exceeded' };
          });

          const params = makeParams();
          const { events, terminal } = await collectEvents(query(params));

          // Should have stopped at succeedAt calls
          expect(callCount).toBe(succeedAt);
          expect(terminal.reason).toBe('complete');
          // No error events when recovery succeeds
          const errorEvents = events.filter((e) => e.type === 'error');
          expect(errorEvents).toHaveLength(0);
        },
      ),
      { numRuns: 20 },
    );
  });
});
