import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ai', () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () { yield 'hello'; })(),
    text: Promise.resolve('hello'),
    toolCalls: Promise.resolve([]),
    toolResults: Promise.resolve([]),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
    response: Promise.resolve({ messages: [] }),
  })),
  stepCountIs: vi.fn(() => () => true),
  tool: vi.fn((def: unknown) => def),
}));
vi.mock('../../src/provider.js', () => ({ createModel: vi.fn(() => ({ modelId: 'test' })) }));
vi.mock('../../src/tools/index.js', () => ({ getToolDefinitions: vi.fn(() => ({})) }));
vi.mock('../../src/prompt.js', () => ({ buildSystemPrompt: vi.fn(() => 'prompt') }));
vi.mock('../../src/session.js', () => ({ saveSession: vi.fn() }));
vi.mock('../../src/normalizer.js', () => ({ normalizeMessages: (m: unknown[]) => m }));
vi.mock('../../src/compactor/snip.js', () => ({ snipCompact: (m: unknown[]) => ({ messages: m, tokensFreed: 0 }) }));
vi.mock('../../src/compactor/micro.js', () => ({ microCompact: (m: unknown[]) => ({ messages: m, tokensFreed: 0 }) }));
vi.mock('../../src/compactor/collapse.js', () => ({ applyCollapse: (m: unknown[]) => ({ projected: m, tokensFreed: 0 }) }));
vi.mock('../../src/compactor/auto.js', () => ({
  shouldAutoCompact: () => false,
  autoCompact: vi.fn().mockResolvedValue({ messages: [], failed: false }),
}));

import { QueryEngine } from '../../src/query-engine.js';

describe('QueryEngine', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('should create with config', () => {
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000,
    });
    expect(engine.config.provider).toBe('anthropic');
    expect(engine.isProcessing).toBe(false);
    expect(engine.messages).toEqual([]);
  });

  it('should track token usage after chat', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000,
    });
    await engine.chat('hello');
    expect(engine.tokenUsage.inputTokens).toBe(10);
    expect(engine.tokenUsage.outputTokens).toBe(5);
  });

  it('should push user message to history', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000,
    });
    await engine.chat('test message');
    expect(engine.messages[0]).toEqual({ role: 'user', content: 'test message' });
  });

  it('should clear history', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000,
    });
    await engine.chat('hello');
    expect(engine.messages.length).toBeGreaterThan(0);
    engine.clearHistory();
    expect(engine.messages).toEqual([]);
  });

  it('should not be processing after chat completes', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000,
    });
    await engine.chat('hello');
    expect(engine.isProcessing).toBe(false);
  });

  it('should support maxTurns config', () => {
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000, maxTurns: 10,
    });
    expect(engine.config.maxTurns).toBe(10);
  });

  it('should support maxBudgetUsd config', () => {
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000, maxBudgetUsd: 5.0,
    });
    expect(engine.config.maxBudgetUsd).toBe(5.0);
  });

  it('should expose confirmedCommands set', () => {
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000,
    });
    expect(engine.confirmedCommands).toBeInstanceOf(Set);
  });

  it('should restore messages', () => {
    const engine = new QueryEngine({
      provider: 'anthropic', model: 'test', yolo: false, effectiveContextWindow: 100000,
    });
    engine.restoreMessages([{ role: 'user', content: 'restored' }]);
    expect(engine.messages).toHaveLength(1);
    expect(engine.messages[0]).toEqual({ role: 'user', content: 'restored' });
  });
});
