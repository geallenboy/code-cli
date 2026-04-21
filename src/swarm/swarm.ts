/**
 * Swarm 管理器
 *
 * 管理多个对等 Agent 的生命周期和协作：
 * - 命名 Agent 注册和管理
 * - 共享 Mailbox 通信
 * - 并行任务执行
 * - 结果收集和汇总
 *
 * 参考 Claude Code: Swarm pattern
 */

import { Mailbox } from './mailbox.js';
import { SwarmAgent, type SwarmAgentConfig, type SwarmAgentStatus } from './agent.js';
import type { QueryEngineConfig } from '../types.js';

/** Swarm 配置 */
export interface SwarmConfig extends QueryEngineConfig {
  /** 最大 Agent 数量 */
  maxAgents?: number;
}

/**
 * Swarm 管理器
 *
 * 管理一组对等 Agent 的协作：
 * - 注册/注销 Agent
 * - 分配任务
 * - 收集结果
 * - 清理资源
 */
export class SwarmManager {
  private readonly config: SwarmConfig;
  private readonly mailbox: Mailbox;
  private readonly agents: Map<string, SwarmAgent> = new Map();
  private readonly maxAgents: number;

  constructor(config: SwarmConfig) {
    this.config = config;
    this.mailbox = new Mailbox();
    this.maxAgents = config.maxAgents ?? 5;
  }

  /**
   * 注册新 Agent
   *
   * @param name - Agent 名称（唯一）
   * @param role - Agent 角色描述
   * @param allowedTools - 允许的工具列表
   * @returns SwarmAgent 实例
   */
  registerAgent(name: string, role?: string, allowedTools?: string[]): SwarmAgent {
    if (this.agents.has(name)) {
      throw new Error(`Agent "${name}" is already registered`);
    }
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum agent count (${this.maxAgents}) reached`);
    }

    const agentConfig: SwarmAgentConfig = {
      ...this.config,
      name,
      role,
      allowedTools,
    };

    const agent = new SwarmAgent(agentConfig, this.mailbox);
    this.agents.set(name, agent);
    return agent;
  }

  /**
   * 注销 Agent
   *
   * @param name - Agent 名称
   */
  unregisterAgent(name: string): void {
    const agent = this.agents.get(name);
    if (agent) {
      agent.cleanup();
      this.agents.delete(name);
    }
  }

  /**
   * 获取 Agent
   *
   * @param name - Agent 名称
   * @returns SwarmAgent 实例，不存在返回 undefined
   */
  getAgent(name: string): SwarmAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * 获取所有 Agent 的状态
   *
   * @returns Agent 状态列表
   */
  getStatus(): SwarmAgentStatus[] {
    return Array.from(this.agents.values()).map(a => a.getStatus());
  }

  /**
   * 发送消息给指定 Agent
   *
   * @param from - 发送者名称
   * @param to - 接收者名称
   * @param content - 消息内容
   */
  sendMessage(from: string, to: string, content: string): string {
    return this.mailbox.send(from, to, content);
  }

  /**
   * 分配任务给多个 Agent 并行执行
   *
   * @param assignments - Agent 名称 → 任务描述
   * @param coordinatorName - coordinator Agent 名称（可选）
   * @returns 执行结果映射
   */
  async assignTasks(
    assignments: Record<string, string>,
    coordinatorName?: string,
  ): Promise<Record<string, { success: boolean; result?: string; error?: string }>> {
    const results: Record<string, { success: boolean; result?: string; error?: string }> = {};

    const promises = Object.entries(assignments).map(async ([agentName, task]) => {
      const agent = this.agents.get(agentName);
      if (!agent) {
        results[agentName] = { success: false, error: `Agent "${agentName}" not found` };
        return;
      }

      try {
        const result = await agent.execute(task, coordinatorName);
        results[agentName] = { success: true, result };
      } catch (error) {
        results[agentName] = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * 执行 Swarm 工作流
   *
   * 1. 注册 coordinator Agent
   * 2. 注册 worker Agent
   * 3. 分配任务
   * 4. 收集结果
   * 5. 清理
   *
   * @param taskDescription - 总体任务描述
   * @param workerConfigs - worker 配置列表
   * @returns 汇总结果
   */
  async run(
    taskDescription: string,
    workerConfigs: Array<{ name: string; role: string; task: string }>,
  ): Promise<{
    success: boolean;
    results: Record<string, { success: boolean; result?: string; error?: string }>;
    summary: string;
  }> {
    // 注册 coordinator
    const coordinatorName = '_swarm_coordinator';
    this.mailbox.register(coordinatorName);

    try {
      // 注册 workers
      const assignments: Record<string, string> = {};
      for (const wc of workerConfigs) {
        this.registerAgent(wc.name, wc.role);
        assignments[wc.name] = wc.task;
      }

      // 并行执行
      const results = await this.assignTasks(assignments, coordinatorName);

      // 收集 coordinator 收到的通知
      const notifications: string[] = [];
      let msg = await this.mailbox.receive(coordinatorName, 100);
      while (msg) {
        notifications.push(msg.content);
        msg = await this.mailbox.receive(coordinatorName, 100);
      }

      // 汇总
      const allSuccess = Object.values(results).every(r => r.success);
      const summary = [
        `## Swarm Execution: ${taskDescription}`,
        '',
        `Workers: ${workerConfigs.length}`,
        `Success: ${Object.values(results).filter(r => r.success).length}/${workerConfigs.length}`,
        '',
        ...Object.entries(results).map(([name, r]) =>
          `### ${name}: ${r.success ? '✅' : '❌'}\n${r.result?.slice(0, 300) ?? r.error ?? ''}`,
        ),
      ].join('\n');

      return { success: allSuccess, results, summary };
    } finally {
      // 清理
      this.mailbox.unregister(coordinatorName);
    }
  }

  /** 获取 Mailbox 实例（用于测试） */
  getMailbox(): Mailbox {
    return this.mailbox;
  }

  /** 获取已注册的 Agent 数量 */
  get size(): number {
    return this.agents.size;
  }

  /** 清理所有资源 */
  cleanup(): void {
    for (const agent of this.agents.values()) {
      agent.cleanup();
    }
    this.agents.clear();
    this.mailbox.clear();
  }
}
