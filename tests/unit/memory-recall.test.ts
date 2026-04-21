/**
 * 记忆语义召回单元测试
 *
 * 测试 recallRelevantMemories 的核心行为：
 * - manifest 构建和模型调用
 * - 去重逻辑
 * - 总量限制
 * - 优雅降级
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModel } from 'ai';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;

/** Create a mock LanguageModel for testing */
function mockModel(): LanguageModel {
  return {} as unknown as LanguageModel;
}

describe('recallRelevantMemories', () => {
  beforeEach(() => {
    vi.resetModules();
    tempDir = join(
      tmpdir(),
      `xiaomi-code-recall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });

    // Mock os.homedir
    vi.doMock('node:os', () => ({
      homedir: () => tempDir,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should return empty array when no memories exist', async () => {
    // Mock generateText
    vi.doMock('ai', () => ({
      generateText: vi.fn().mockResolvedValue({ text: '' }),
    }));

    const { recallRelevantMemories } = await import('../../src/memory/recall.js');
    const result = await recallRelevantMemories('test query', mockModel(), new Set());
    expect(result).toEqual([]);
  });

  it('should recall memories selected by the model', async () => {
    // First create some memories
    const { createMemory } = await import('../../src/memory/store.js');
    const filename1 = createMemory('user', 'Dark mode preference', 'I prefer dark mode');
    // Create a second memory to ensure the model selects only the relevant one
    createMemory('feedback', 'Use vitest', 'Use vitest not jest');

    // Mock generateText to return the first filename
    vi.doMock('ai', () => ({
      generateText: vi.fn().mockResolvedValue({ text: filename1 }),
    }));

    const { recallRelevantMemories } = await import('../../src/memory/recall.js');
    const result = await recallRelevantMemories('what theme do I prefer?', mockModel(), new Set());

    expect(result.length).toBe(1);
    expect(result[0].filename).toBe(filename1);
    expect(result[0].content).toContain('dark mode');
  });

  it('should deduplicate already recalled memories', async () => {
    const { createMemory } = await import('../../src/memory/store.js');
    const filename1 = createMemory('user', 'Pref one', 'Content one');

    vi.doMock('ai', () => ({
      generateText: vi.fn().mockResolvedValue({ text: filename1 }),
    }));

    const { recallRelevantMemories } = await import('../../src/memory/recall.js');
    const alreadyRecalled = new Set([filename1]);

    // Should return empty because the only memory is already recalled
    const result = await recallRelevantMemories('query', mockModel(), alreadyRecalled);
    expect(result).toEqual([]);
  });

  it('should handle model errors gracefully', async () => {
    const { createMemory } = await import('../../src/memory/store.js');
    createMemory('user', 'Some memory', 'Content');

    vi.doMock('ai', () => ({
      generateText: vi.fn().mockRejectedValue(new Error('API error')),
    }));

    const { recallRelevantMemories } = await import('../../src/memory/recall.js');
    const result = await recallRelevantMemories('query', mockModel(), new Set());
    expect(result).toEqual([]);
  });

  it('should add recalled memories to alreadyRecalled set', async () => {
    const { createMemory } = await import('../../src/memory/store.js');
    const filename1 = createMemory('user', 'Test memory', 'Content');

    vi.doMock('ai', () => ({
      generateText: vi.fn().mockResolvedValue({ text: filename1 }),
    }));

    const { recallRelevantMemories } = await import('../../src/memory/recall.js');
    const alreadyRecalled = new Set<string>();

    await recallRelevantMemories('query', mockModel(), alreadyRecalled);
    expect(alreadyRecalled.has(filename1)).toBe(true);
  });

  it('should limit recalled memories to MAX_RECALLED (5)', async () => {
    const { createMemory } = await import('../../src/memory/store.js');
    const filenames: string[] = [];
    for (let i = 0; i < 8; i++) {
      filenames.push(createMemory('reference', `Memory ${i}`, `Content ${i}`));
    }

    // Model returns all 8 filenames
    vi.doMock('ai', () => ({
      generateText: vi.fn().mockResolvedValue({ text: filenames.join('\n') }),
    }));

    const { recallRelevantMemories } = await import('../../src/memory/recall.js');
    const result = await recallRelevantMemories('query', mockModel(), new Set());
    expect(result.length).toBeLessThanOrEqual(5);
  });
});
