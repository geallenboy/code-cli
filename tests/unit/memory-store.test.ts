/**
 * 记忆存储层单元测试
 *
 * 测试 createMemory、listMemories、loadMemory、buildMemoryIndex 的核心行为。
 * 使用临时目录避免污染用户的 ~/.gearcode/memory/。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;

describe('memory store', () => {
  beforeEach(() => {
    vi.resetModules();
    tempDir = join(
      tmpdir(),
      `gearcode-mem-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });

    // Mock os.homedir to redirect memory to temp dir
    vi.doMock('node:os', () => ({
      homedir: () => tempDir,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  async function getStoreModule() {
    return await import('../../src/memory/store.js');
  }

  it('should create a memory and return a filename', async () => {
    const { createMemory } = await getStoreModule();
    const filename = createMemory('user', 'Prefer dark mode', 'I always use dark mode in my editor.');
    expect(filename).toMatch(/^user-.*\.md$/);
    expect(filename).toContain('prefer-dark-mode');
  });

  it('should save and load a memory (round trip)', async () => {
    const { createMemory, loadMemory } = await getStoreModule();
    const description = 'Test round trip';
    const content = 'This is the memory content.';
    const filename = createMemory('feedback', description, content);

    const loaded = loadMemory(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.type).toBe('feedback');
    expect(loaded!.description).toBe(description);
    expect(loaded!.content).toBe(content);
    expect(loaded!.filename).toBe(filename);
  });

  it('should list all memories', async () => {
    const { createMemory, listMemories } = await getStoreModule();
    createMemory('user', 'Pref one', 'Content one');
    createMemory('project', 'Deadline info', 'Content two');
    createMemory('reference', 'API docs', 'Content three');

    const memories = listMemories();
    expect(memories.length).toBe(3);
    expect(memories.map(m => m.type)).toContain('user');
    expect(memories.map(m => m.type)).toContain('project');
    expect(memories.map(m => m.type)).toContain('reference');
  });

  it('should return null for non-existent memory', async () => {
    const { loadMemory } = await getStoreModule();
    const result = loadMemory('nonexistent.md');
    expect(result).toBeNull();
  });

  it('should return empty list when no memories exist', async () => {
    const { listMemories } = await getStoreModule();
    const memories = listMemories();
    expect(memories).toEqual([]);
  });

  it('should build memory index', async () => {
    const { createMemory, buildMemoryIndex } = await getStoreModule();
    createMemory('user', 'Dark mode preference', 'I prefer dark mode');
    createMemory('feedback', 'Use vitest', 'Use vitest not jest');

    const index = buildMemoryIndex();
    expect(index).toContain('# Memory Index');
    expect(index).toContain('[user]');
    expect(index).toContain('[feedback]');
    expect(index).toContain('Dark mode preference');
    expect(index).toContain('Use vitest');
  });

  it('should return empty string for index when no memories', async () => {
    const { buildMemoryIndex } = await getStoreModule();
    const index = buildMemoryIndex();
    expect(index).toBe('');
  });

  it('should include age in memory entries', async () => {
    const { createMemory, listMemories } = await getStoreModule();
    createMemory('user', 'Today memory', 'Created today');

    const memories = listMemories();
    expect(memories.length).toBe(1);
    expect(memories[0].age).toBe('today');
  });

  it('should handle special characters in description for filename', async () => {
    const { createMemory } = await getStoreModule();
    const filename = createMemory('user', 'Use "quotes" & <special> chars!', 'Content');
    expect(filename).toMatch(/^user-.*\.md$/);
    // Should not contain special characters
    expect(filename).not.toMatch(/[<>"&!]/);
  });

  it('should truncate long descriptions in filename', async () => {
    const { createMemory } = await getStoreModule();
    const longDesc = 'a'.repeat(100);
    const filename = createMemory('user', longDesc, 'Content');
    // Slug should be truncated to 40 chars max
    const slug = filename.replace(/^user-/, '').replace(/\.md$/, '');
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});

describe('parseFrontmatter', () => {
  it('should parse valid frontmatter', async () => {
    vi.resetModules();
    const tempDir2 = join(
      tmpdir(),
      `gearcode-fm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir2, { recursive: true });
    vi.doMock('node:os', () => ({ homedir: () => tempDir2 }));

    const { parseFrontmatter } = await import('../../src/memory/store.js');
    const result = parseFrontmatter('---\ntype: user\ndescription: Test\ncreated: 2025-01-01\n---\n\nContent');
    expect(result.type).toBe('user');
    expect(result.description).toBe('Test');
    expect(result.created).toBe('2025-01-01');

    vi.restoreAllMocks();
    try { rmSync(tempDir2, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should return empty object for no frontmatter', async () => {
    vi.resetModules();
    const tempDir2 = join(
      tmpdir(),
      `gearcode-fm-test2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir2, { recursive: true });
    vi.doMock('node:os', () => ({ homedir: () => tempDir2 }));

    const { parseFrontmatter } = await import('../../src/memory/store.js');
    const result = parseFrontmatter('No frontmatter here');
    expect(result).toEqual({});

    vi.restoreAllMocks();
    try { rmSync(tempDir2, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should handle colons in values', async () => {
    vi.resetModules();
    const tempDir2 = join(
      tmpdir(),
      `gearcode-fm-test3-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir2, { recursive: true });
    vi.doMock('node:os', () => ({ homedir: () => tempDir2 }));

    const { parseFrontmatter } = await import('../../src/memory/store.js');
    const result = parseFrontmatter('---\ndescription: Use vitest: not jest\n---\n\nContent');
    expect(result.description).toBe('Use vitest: not jest');

    vi.restoreAllMocks();
    try { rmSync(tempDir2, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});
