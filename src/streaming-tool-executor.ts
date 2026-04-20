/**
 * 流式并行工具执行器
 *
 * 在 API 流式输出期间即时调度已解析完成的工具调用，
 * 基于工具安全语义元数据决定并发/独占执行。
 *
 * 工具经历 4 个状态：queued → executing → completed → yielded
 *
 * 参考 Claude Code: src/services/tools/StreamingToolExecutor.ts (531 行)
 * 简化：基于 ToolSafetyMetadata 的并发调度
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
}

export class StreamingToolExecutor {
  private tools: TrackedTool[] = [];

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
    for (const tool of this.tools) {
      if (tool.status !== 'queued') continue;
      if (!this.canExecute(tool.safety)) continue;
      tool.status = 'executing';
      try {
        tool.result = await tool.execute();
      } catch (e) {
        tool.result = `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
      tool.status = 'completed';
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
}
