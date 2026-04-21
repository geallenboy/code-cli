/**
 * 流式并行工具执行器
 *
 * 在 API 流式输出期间即时调度已解析完成的工具调用，
 * 基于工具安全语义元数据决定并发/独占执行。
 *
 * 工具经历 4 个状态：queued → executing → completed → yielded
 *
 * 增强功能：
 * - Promise.allSettled 并发执行（容错）
 * - 级联中止：Bash 失败取消兄弟 Bash，不取消 read-only
 * - 执行计时报告
 *
 * 参考 Claude Code: src/services/tools/StreamingToolExecutor.ts (531 行)
 */

import type { ToolSafetyMetadata } from './tools/index.js';

type ToolStatus = 'queued' | 'executing' | 'completed' | 'yielded';

interface TrackedTool {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  safety: ToolSafetyMetadata;
  status: ToolStatus;
  result?: string;
  execute: () => Promise<string>;
  startTime?: number;
  endTime?: number;
}

export interface ExecutionTiming {
  wallClockMs: number;
  sumIndividualMs: number;
  parallelismBenefit: number; // ratio: sum / wall (>1 means parallelism helped)
}

export class StreamingToolExecutor {
  private tools: TrackedTool[] = [];
  private executionStartTime: number | null = null;

  addTool(
    id: string,
    toolName: string,
    input: Record<string, unknown>,
    safety: ToolSafetyMetadata,
    execute: () => Promise<string>,
  ): void {
    this.tools.push({ id, toolName, input, safety, status: 'queued', execute });
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.executionStartTime === null) {
      this.executionStartTime = Date.now();
    }

    // Collect concurrent-safe queued tools
    const concurrentTools = this.tools.filter(
      (t) => t.status === 'queued' && t.safety.isConcurrencySafe,
    );

    // If multiple concurrent-safe tools are queued, execute them in parallel with allSettled
    if (concurrentTools.length > 1) {
      for (const tool of concurrentTools) {
        tool.status = 'executing';
        tool.startTime = Date.now();
      }

      const results = await Promise.allSettled(
        concurrentTools.map(async (tool) => {
          try {
            const result = await tool.execute();
            tool.endTime = Date.now();
            return { tool, result };
          } catch (e) {
            tool.endTime = Date.now();
            throw { tool, error: e };
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          result.value.tool.result = result.value.result;
          result.value.tool.status = 'completed';
        } else {
          const { tool, error } = result.reason as { tool: TrackedTool; error: unknown };
          tool.result = `Error: ${error instanceof Error ? error.message : String(error)}`;
          tool.status = 'completed';
        }
      }

      // Process remaining queued tools
      await this.processQueue();
      return;
    }

    // Sequential execution for non-concurrent or single tools
    for (const tool of this.tools) {
      if (tool.status !== 'queued') continue;
      if (!this.canExecute(tool.safety)) continue;
      tool.status = 'executing';
      tool.startTime = Date.now();
      try {
        tool.result = await tool.execute();
      } catch (e) {
        tool.result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        // Cascading abort for Bash errors
        if (tool.toolName === 'run_shell' && !tool.safety.isReadOnly) {
          this.handleBashError();
        }
      }
      tool.endTime = Date.now();
      tool.status = 'completed';
    }
  }

  /**
   * Cascading abort: when a Bash tool errors, cancel sibling Bash tools
   * but NOT read-only tools.
   */
  private handleBashError(): void {
    for (const tool of this.tools) {
      if (
        tool.status === 'queued' &&
        tool.toolName === 'run_shell' &&
        !tool.safety.isReadOnly
      ) {
        tool.status = 'completed';
        tool.result = 'Cancelled: sibling Bash command failed';
        tool.startTime = Date.now();
        tool.endTime = Date.now();
      }
    }
  }

  private canExecute(safety: ToolSafetyMetadata): boolean {
    const executing = this.tools.filter((t) => t.status === 'executing');
    if (executing.length === 0) return true;
    return safety.isConcurrencySafe && executing.every((t) => t.safety.isConcurrencySafe);
  }

  *getCompletedResults(): Generator<{ id: string; toolName: string; result: string }> {
    for (const tool of this.tools) {
      if (tool.status === 'completed' && tool.result !== undefined) {
        tool.status = 'yielded';
        yield { id: tool.id, toolName: tool.toolName, result: tool.result };
      }
    }
  }

  async getRemainingResults(): Promise<Array<{ id: string; toolName: string; result: string }>> {
    // Wait for all executing tools
    while (this.tools.some((t) => t.status === 'executing' || t.status === 'queued')) {
      await new Promise((r) => setTimeout(r, 10));
      await this.processQueue();
    }
    const results: Array<{ id: string; toolName: string; result: string }> = [];
    for (const r of this.getCompletedResults()) {
      results.push(r);
    }
    return results;
  }

  get allCompleted(): boolean {
    return this.tools.every((t) => t.status === 'completed' || t.status === 'yielded');
  }

  /** Get execution timing report */
  getExecutionTiming(): ExecutionTiming {
    const wallClockMs = this.executionStartTime
      ? Date.now() - this.executionStartTime
      : 0;

    const sumIndividualMs = this.tools.reduce((sum, tool) => {
      if (tool.startTime && tool.endTime) {
        return sum + (tool.endTime - tool.startTime);
      }
      return sum;
    }, 0);

    const parallelismBenefit = wallClockMs > 0 ? sumIndividualMs / wallClockMs : 1;

    return { wallClockMs, sumIndividualMs, parallelismBenefit };
  }
}
