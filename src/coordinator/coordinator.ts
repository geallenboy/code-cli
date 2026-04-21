/**
 * Coordinator 模式
 *
 * 纯指挥官模式：Coordinator 只能分配任务给子 Agent，
 * 不能直接使用文件/Shell 工具。
 *
 * 4 阶段工作流：
 * 1. Research — 探索代码库，理解上下文
 * 2. Synthesize — 综合分析，制定计划
 * 3. Implement — 分配实现任务给子 Agent
 * 4. Verify — 验证结果，合并输出
 *
 * 参考 Claude Code: Coordinator pattern
 * - Coordinator 不能直接执行，只能编排
 * - 子 Agent 在独立 worktree 中工作
 * - 结果汇总后呈现给用户
 */

import { QueryEngine } from '../query-engine.js';
import type { QueryEngineConfig } from '../types.js';
import { WorktreeManager, type WorktreeInfo } from './worktree.js';

/** Coordinator 配置 */
export interface CoordinatorConfig extends QueryEngineConfig {
  /** 是否启用 worktree 隔离 */
  useWorktree?: boolean;
  /** 最大并行子 Agent 数 */
  maxParallelAgents?: number;
}

/** Coordinator 阶段 */
export type CoordinatorPhase = 'research' | 'synthesize' | 'implement' | 'verify';

/** 子任务定义 */
export interface CoordinatorTask {
  /** 任务 ID */
  id: string;
  /** 任务描述 */
  description: string;
  /** 任务类型 */
  type: 'explore' | 'implement' | 'verify';
  /** 任务状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 执行结果 */
  result?: string;
  /** 错误信息 */
  error?: string;
  /** 分配的 worktree */
  worktree?: WorktreeInfo;
}

/** Coordinator 执行结果 */
export interface CoordinatorResult {
  /** 是否成功 */
  success: boolean;
  /** 各阶段结果 */
  phases: Record<CoordinatorPhase, string>;
  /** 子任务列表 */
  tasks: CoordinatorTask[];
  /** 有更改的 worktree（需要用户决定是否合并） */
  pendingWorktrees: WorktreeInfo[];
}

/**
 * Coordinator — 纯指挥官 Agent
 *
 * 核心约束：Coordinator 不能直接使用文件/Shell 工具（P30）。
 * 所有实际操作通过子 Agent 执行。
 *
 * 工作流：
 * 1. Research: 使用 explore 子 Agent 探索代码库
 * 2. Synthesize: Coordinator 自身分析并制定计划
 * 3. Implement: 分配实现任务给 general 子 Agent
 * 4. Verify: 使用 explore 子 Agent 验证结果
 */
export class Coordinator {
  private readonly config: CoordinatorConfig;
  private readonly worktreeManager: WorktreeManager;
  private readonly tasks: CoordinatorTask[] = [];
  private readonly phaseResults: Record<CoordinatorPhase, string> = {
    research: '',
    synthesize: '',
    implement: '',
    verify: '',
  };
  private currentPhase: CoordinatorPhase = 'research';
  private taskCounter = 0;

  constructor(config: CoordinatorConfig) {
    this.config = config;
    this.worktreeManager = new WorktreeManager();
  }

  /** 获取当前阶段 */
  get phase(): CoordinatorPhase {
    return this.currentPhase;
  }

  /** 获取所有任务 */
  getTasks(): CoordinatorTask[] {
    return [...this.tasks];
  }

  /**
   * 创建子任务
   *
   * @param description - 任务描述
   * @param type - 任务类型
   * @returns 任务对象
   */
  createTask(description: string, type: CoordinatorTask['type'] = 'implement'): CoordinatorTask {
    const task: CoordinatorTask = {
      id: `task-${++this.taskCounter}`,
      description,
      type,
      status: 'pending',
    };
    this.tasks.push(task);
    return task;
  }

  /**
   * 执行单个子任务
   *
   * 创建独立的子 Agent 执行任务。
   * 如果启用 worktree，在隔离的 worktree 中执行。
   *
   * @param task - 要执行的任务
   */
  async executeTask(task: CoordinatorTask): Promise<void> {
    task.status = 'running';

    try {
      // 如果启用 worktree 且是实现任务，创建隔离环境
      if (this.config.useWorktree && task.type === 'implement') {
        try {
          task.worktree = this.worktreeManager.create(task.id);
        } catch {
          // Worktree 创建失败不阻塞任务执行
        }
      }

      const subConfig: QueryEngineConfig = {
        ...this.config,
        maxTurns: 20,
      };
      const subEngine = new QueryEngine(subConfig);

      // 根据任务类型构建提示
      const prompt = this.buildTaskPrompt(task);
      await subEngine.chat(prompt);

      // 提取结果
      const messages = subEngine.messages;
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        const content = lastAssistant.content;
        if (typeof content === 'string') {
          task.result = content;
        } else if (Array.isArray(content)) {
          const textParts = content.filter(
            (p): p is { type: 'text'; text: string } =>
              typeof p === 'object' && p !== null && 'type' in p && p.type === 'text',
          );
          task.result = textParts.map(p => p.text).join('\n');
        }
      }

      task.status = 'completed';
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * 并行执行多个子任务
   *
   * 使用 Promise.allSettled 确保单个任务失败不影响其他任务。
   *
   * @param tasks - 要执行的任务列表
   */
  async executeTasks(tasks: CoordinatorTask[]): Promise<void> {
    const maxParallel = this.config.maxParallelAgents ?? 3;
    const batches: CoordinatorTask[][] = [];

    // 分批执行
    for (let i = 0; i < tasks.length; i += maxParallel) {
      batches.push(tasks.slice(i, i + maxParallel));
    }

    for (const batch of batches) {
      await Promise.allSettled(batch.map(task => this.executeTask(task)));
    }
  }

  /**
   * 执行 Research 阶段
   *
   * 使用 explore 子 Agent 探索代码库，收集上下文信息。
   *
   * @param query - 用户的原始请求
   */
  async research(query: string): Promise<string> {
    this.currentPhase = 'research';

    const task = this.createTask(
      `[READ-ONLY MODE] Explore the codebase to understand the context for: ${query}\n` +
      'List relevant files, their purposes, and key code patterns.',
      'explore',
    );

    await this.executeTask(task);
    this.phaseResults.research = task.result ?? 'No research results.';
    return this.phaseResults.research;
  }

  /**
   * 执行 Synthesize 阶段
   *
   * Coordinator 自身分析 research 结果，制定实现计划。
   * 注意：这个阶段 Coordinator 自己思考，不委派子 Agent。
   *
   * @param query - 用户的原始请求
   * @returns 实现计划
   */
  synthesize(query: string): string {
    this.currentPhase = 'synthesize';

    const plan = [
      `## Implementation Plan for: ${query}`,
      '',
      '### Research Summary',
      this.phaseResults.research,
      '',
      '### Pending Tasks',
      ...this.tasks
        .filter(t => t.status === 'pending')
        .map(t => `- ${t.id}: ${t.description}`),
    ].join('\n');

    this.phaseResults.synthesize = plan;
    return plan;
  }

  /**
   * 执行 Implement 阶段
   *
   * 将实现任务分配给子 Agent 并行执行。
   *
   * @param tasks - 实现任务列表
   */
  async implement(tasks: CoordinatorTask[]): Promise<void> {
    this.currentPhase = 'implement';
    await this.executeTasks(tasks);

    const results = tasks.map(t =>
      `### ${t.id}: ${t.description}\n` +
      `Status: ${t.status}\n` +
      (t.result ? `Result: ${t.result.slice(0, 500)}` : '') +
      (t.error ? `Error: ${t.error}` : ''),
    );

    this.phaseResults.implement = results.join('\n\n');
  }

  /**
   * 执行 Verify 阶段
   *
   * 使用 explore 子 Agent 验证实现结果。
   *
   * @param verificationQuery - 验证查询
   */
  async verify(verificationQuery: string): Promise<string> {
    this.currentPhase = 'verify';

    const task = this.createTask(
      `[READ-ONLY MODE] Verify the implementation:\n${verificationQuery}\n` +
      'Check for correctness, completeness, and potential issues.',
      'verify',
    );

    await this.executeTask(task);
    this.phaseResults.verify = task.result ?? 'No verification results.';
    return this.phaseResults.verify;
  }

  /**
   * 执行完整的 4 阶段工作流
   *
   * @param query - 用户的原始请求
   * @returns Coordinator 执行结果
   */
  async run(query: string): Promise<CoordinatorResult> {
    try {
      // Phase 1: Research
      await this.research(query);

      // Phase 2: Synthesize
      this.synthesize(query);

      // Phase 3: Implement
      const implementTasks = this.tasks.filter(
        t => t.type === 'implement' && t.status === 'pending',
      );
      if (implementTasks.length > 0) {
        await this.implement(implementTasks);
      }

      // Phase 4: Verify
      await this.verify(
        `Verify the following changes:\n${this.phaseResults.implement}`,
      );

      // Cleanup worktrees
      const pendingWorktrees = this.worktreeManager.cleanupAll();

      return {
        success: true,
        phases: { ...this.phaseResults },
        tasks: this.getTasks(),
        pendingWorktrees,
      };
    } catch {
      return {
        success: false,
        phases: { ...this.phaseResults },
        tasks: this.getTasks(),
        pendingWorktrees: [],
      };
    }
  }

  /**
   * 构建子任务的提示词
   *
   * 根据任务类型添加适当的约束和上下文。
   */
  private buildTaskPrompt(task: CoordinatorTask): string {
    const cwd = task.worktree?.path ?? process.cwd();
    const prefix = task.type === 'explore' || task.type === 'verify'
      ? '[READ-ONLY MODE] You may only use read_file, grep_search, and list_files tools. Do NOT modify any files.\n\n'
      : '';

    return `${prefix}Working directory: ${cwd}\n\n${task.description}`;
  }

  /** 清理资源 */
  cleanup(): void {
    this.worktreeManager.cleanupAll();
  }
}
