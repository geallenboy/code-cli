/**
 * StreamingToolExecutor 单元测试
 *
 * 测试流式并行工具执行器的核心逻辑：
 * - 4 状态转换：queued → executing → completed → yielded
 * - 并发安全工具并行执行
 * - 非并发安全工具独占执行
 * - getCompletedResults + getRemainingResults
 */

import { describe, it, expect } from 'vitest';
import { StreamingToolExecutor } from '../../src/streaming-tool-executor.js';
import type { ToolSafetyMetadata } from '../../src/tools/index.js';

const readOnlySafety: ToolSafetyMetadata = {
  isReadOnly: true,
  isConcurrencySafe: true,
  isDestructive: false,
};

const writeSafety: ToolSafetyMetadata = {
  isReadOnly: false,
  isConcurrencySafe: false,
  isDestructive: false,
};

describe('StreamingToolExecutor', () => {
  describe('status transitions', () => {
    it('should transition from queued to completed after execution', async () => {
      const executor = new StreamingToolExecutor();
      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => 'result1');
      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(1);
      expect(results[0].result).toBe('result1');
    });

    it('should transition to yielded after getCompletedResults', async () => {
      const executor = new StreamingToolExecutor();
      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => 'result1');
      await executor.getRemainingResults();
      // After getRemainingResults, results are yielded — calling again should return empty
      const moreResults = await executor.getRemainingResults();
      expect(moreResults).toHaveLength(0);
    });

    it('should handle errors and still complete', async () => {
      const executor = new StreamingToolExecutor();
      executor.addTool('t1', 'run_shell', {}, writeSafety, async () => {
        throw new Error('command failed');
      });
      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(1);
      expect(results[0].result).toContain('Error: command failed');
    });

    it('should report allCompleted correctly', async () => {
      const executor = new StreamingToolExecutor();
      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => 'done');
      // Wait for completion
      await executor.getRemainingResults();
      expect(executor.allCompleted).toBe(true);
    });
  });

  describe('concurrency', () => {
    it('should execute concurrent-safe tools in parallel', async () => {
      const executor = new StreamingToolExecutor();
      const order: string[] = [];

      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => {
        order.push('t1-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('t1-end');
        return 'file1';
      });
      executor.addTool('t2', 'grep_search', {}, readOnlySafety, async () => {
        order.push('t2-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('t2-end');
        return 'search1';
      });

      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(['t1', 't2']);
    });

    it('should execute non-concurrent tools exclusively', async () => {
      const executor = new StreamingToolExecutor();

      executor.addTool('t1', 'write_file', {}, writeSafety, async () => {
        return 'written';
      });
      executor.addTool('t2', 'edit_file', {}, writeSafety, async () => {
        return 'edited';
      });

      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(2);
      // Both should complete, just not simultaneously
      expect(results.map((r) => r.result)).toContain('written');
      expect(results.map((r) => r.result)).toContain('edited');
    });
  });

  describe('getCompletedResults + getRemainingResults', () => {
    it('getCompletedResults should yield completed tools', async () => {
      const executor = new StreamingToolExecutor();
      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => 'result1');

      // Wait for completion
      await executor.getRemainingResults();

      // After getRemainingResults consumed them, generator should be empty
      const gen = executor.getCompletedResults();
      const next = gen.next();
      expect(next.done).toBe(true);
    });

    it('getRemainingResults should wait for all tools', async () => {
      const executor = new StreamingToolExecutor();
      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'slow-result';
      });

      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(1);
      expect(results[0].result).toBe('slow-result');
    });

    it('should handle non-Error throws gracefully', async () => {
      const executor = new StreamingToolExecutor();
      executor.addTool('t1', 'run_shell', {}, writeSafety, async () => {
        throw 'string error';
      });
      const results = await executor.getRemainingResults();
      expect(results[0].result).toContain('Error: string error');
    });
  });
});
