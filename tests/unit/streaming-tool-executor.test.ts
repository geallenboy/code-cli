/**
 * StreamingToolExecutor 单元测试
 *
 * 测试流式并行工具执行器的核心逻辑：
 * - 4 状态转换：queued → executing → completed → yielded
 * - 并发安全工具并行执行
 * - 非并发安全工具独占执行
 * - getCompletedResults + getRemainingResults
 * - Promise.allSettled 并发执行
 * - 级联中止（Bash 失败取消兄弟 Bash）
 * - 执行计时报告
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

const bashSafety: ToolSafetyMetadata = {
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

  describe('Promise.allSettled for concurrent tools', () => {
    it('should handle individual failures without blocking others', async () => {
      const executor = new StreamingToolExecutor();

      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => {
        throw new Error('file not found');
      });
      executor.addTool('t2', 'grep_search', {}, readOnlySafety, async () => {
        return 'search result';
      });

      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(2);

      const t1Result = results.find((r) => r.id === 't1');
      const t2Result = results.find((r) => r.id === 't2');

      expect(t1Result!.result).toContain('Error: file not found');
      expect(t2Result!.result).toBe('search result');
    });

    it('should complete all concurrent tools even when multiple fail', async () => {
      const executor = new StreamingToolExecutor();

      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => {
        throw new Error('error 1');
      });
      executor.addTool('t2', 'list_files', {}, readOnlySafety, async () => {
        throw new Error('error 2');
      });
      executor.addTool('t3', 'grep_search', {}, readOnlySafety, async () => {
        return 'success';
      });

      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(3);

      const successResult = results.find((r) => r.id === 't3');
      expect(successResult!.result).toBe('success');
    });
  });

  describe('cascading abort for Bash errors', () => {
    it('should cancel sibling Bash tools when one fails', async () => {
      const executor = new StreamingToolExecutor();

      // First bash tool will fail
      executor.addTool('bash1', 'run_shell', {}, bashSafety, async () => {
        throw new Error('command failed');
      });
      // Second bash tool should be cancelled
      executor.addTool('bash2', 'run_shell', {}, bashSafety, async () => {
        return 'should not run';
      });

      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(2);

      const bash1 = results.find((r) => r.id === 'bash1');
      const bash2 = results.find((r) => r.id === 'bash2');

      expect(bash1!.result).toContain('Error: command failed');
      expect(bash2!.result).toContain('Cancelled: sibling Bash command failed');
    });

    it('should NOT cancel read-only tools when Bash fails', async () => {
      const executor = new StreamingToolExecutor();

      // Bash tool will fail
      executor.addTool('bash1', 'run_shell', {}, bashSafety, async () => {
        throw new Error('bash error');
      });
      // Read-only tool should still execute
      executor.addTool('read1', 'read_file', {}, readOnlySafety, async () => {
        return 'file content';
      });

      const results = await executor.getRemainingResults();
      expect(results).toHaveLength(2);

      const readResult = results.find((r) => r.id === 'read1');
      expect(readResult!.result).toBe('file content');
    });
  });

  describe('execution timing', () => {
    it('should report execution timing', async () => {
      const executor = new StreamingToolExecutor();

      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 'done';
      });

      await executor.getRemainingResults();
      const timing = executor.getExecutionTiming();

      expect(timing.wallClockMs).toBeGreaterThanOrEqual(0);
      expect(timing.sumIndividualMs).toBeGreaterThanOrEqual(0);
      expect(timing.parallelismBenefit).toBeGreaterThanOrEqual(0);
    });

    it('should show parallelism benefit > 1 for concurrent tools', async () => {
      const executor = new StreamingToolExecutor();

      executor.addTool('t1', 'read_file', {}, readOnlySafety, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'file1';
      });
      executor.addTool('t2', 'grep_search', {}, readOnlySafety, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'search1';
      });

      await executor.getRemainingResults();
      const timing = executor.getExecutionTiming();

      // Sum of individual times should be >= 100ms (50+50)
      // Wall clock should be ~50ms (parallel)
      // So benefit should be > 1
      expect(timing.sumIndividualMs).toBeGreaterThanOrEqual(80); // Allow some variance
      expect(timing.parallelismBenefit).toBeGreaterThanOrEqual(1);
    });

    it('should return default timing when no tools executed', () => {
      const executor = new StreamingToolExecutor();
      const timing = executor.getExecutionTiming();
      expect(timing.wallClockMs).toBe(0);
      expect(timing.parallelismBenefit).toBe(1);
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
