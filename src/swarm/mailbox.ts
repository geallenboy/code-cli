/**
 * Swarm 消息邮箱系统
 *
 * 提供 Agent 间的异步消息传递机制：
 * - send(agentName, message): 发送消息到指定 Agent
 * - receive(): 接收当前 Agent 的消息
 * - 消息队列 + 超时
 * - 消息隔离：Agent 只能读取自己的消息（P31）
 *
 * 参考 Claude Code: Swarm mailbox communication
 */

/** 邮箱消息 */
export interface MailboxMessage {
  /** 消息 ID */
  id: string;
  /** 发送者 Agent 名称 */
  from: string;
  /** 接收者 Agent 名称 */
  to: string;
  /** 消息内容 */
  content: string;
  /** 发送时间 */
  timestamp: number;
  /** 是否已读 */
  read: boolean;
}

/** 默认接收超时（ms） */
const DEFAULT_RECEIVE_TIMEOUT = 30_000;

/**
 * 消息邮箱
 *
 * 每个 Agent 有独立的消息队列。
 * 消息不跨 Agent 泄露（隔离性 P31）。
 */
export class Mailbox {
  /** Agent 名称 → 消息队列 */
  private queues: Map<string, MailboxMessage[]> = new Map();
  /** 等待消息的 resolve 回调 */
  private waiters: Map<string, Array<(msg: MailboxMessage) => void>> = new Map();
  /** 消息计数器 */
  private messageCounter = 0;

  /**
   * 注册 Agent 的邮箱
   *
   * @param agentName - Agent 名称
   */
  register(agentName: string): void {
    if (!this.queues.has(agentName)) {
      this.queues.set(agentName, []);
      this.waiters.set(agentName, []);
    }
  }

  /**
   * 注销 Agent 的邮箱
   *
   * @param agentName - Agent 名称
   */
  unregister(agentName: string): void {
    this.queues.delete(agentName);
    // 拒绝所有等待中的接收者
    const waiting = this.waiters.get(agentName) ?? [];
    this.waiters.delete(agentName);
    // Waiters will timeout naturally
    void waiting;
  }

  /**
   * 发送消息到指定 Agent
   *
   * @param from - 发送者名称
   * @param to - 接收者名称
   * @param content - 消息内容
   * @returns 消息 ID
   * @throws 如果接收者未注册
   */
  send(from: string, to: string, content: string): string {
    if (!this.queues.has(to)) {
      throw new Error(`Agent "${to}" is not registered in the mailbox`);
    }

    const message: MailboxMessage = {
      id: `msg-${++this.messageCounter}`,
      from,
      to,
      content,
      timestamp: Date.now(),
      read: false,
    };

    // 如果有等待者，直接交付
    const waiting = this.waiters.get(to) ?? [];
    if (waiting.length > 0) {
      const waiter = waiting.shift();
      if (waiter) {
        message.read = true;
        waiter(message);
      }
    } else {
      // 否则放入队列
      const queue = this.queues.get(to);
      if (queue) queue.push(message);
    }

    return message.id;
  }

  /**
   * 接收消息（阻塞等待）
   *
   * 如果队列中有消息，立即返回最早的一条。
   * 如果队列为空，等待直到有新消息或超时。
   *
   * @param agentName - 接收者名称
   * @param timeout - 超时时间（ms），默认 30s
   * @returns 消息，超时返回 null
   */
  async receive(agentName: string, timeout = DEFAULT_RECEIVE_TIMEOUT): Promise<MailboxMessage | null> {
    if (!this.queues.has(agentName)) {
      throw new Error(`Agent "${agentName}" is not registered in the mailbox`);
    }

    const queue = this.queues.get(agentName);
    if (!queue) {
      throw new Error(`Agent "${agentName}" is not registered in the mailbox`);
    }

    // 队列中有消息，立即返回
    if (queue.length > 0) {
      const msg = queue.shift();
      if (msg) {
        msg.read = true;
        return msg;
      }
    }

    // 等待新消息
    return new Promise<MailboxMessage | null>((resolve) => {
      const timer = setTimeout(() => {
        // 超时：从等待列表中移除
        const waiting = this.waiters.get(agentName) ?? [];
        const idx = waiting.indexOf(resolveWrapper);
        if (idx >= 0) waiting.splice(idx, 1);
        resolve(null);
      }, timeout);

      const resolveWrapper = (msg: MailboxMessage) => {
        clearTimeout(timer);
        resolve(msg);
      };

      const waiting = this.waiters.get(agentName);
      if (waiting) {
        waiting.push(resolveWrapper);
      } else {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  /**
   * 查看消息队列（不消费）
   *
   * @param agentName - Agent 名称
   * @returns 未读消息列表
   */
  peek(agentName: string): MailboxMessage[] {
    return [...(this.queues.get(agentName) ?? [])];
  }

  /**
   * 获取队列中的消息数量
   *
   * @param agentName - Agent 名称
   * @returns 消息数量
   */
  getQueueSize(agentName: string): number {
    return this.queues.get(agentName)?.length ?? 0;
  }

  /** 获取已注册的 Agent 列表 */
  getRegisteredAgents(): string[] {
    return Array.from(this.queues.keys());
  }

  /** 清空所有邮箱 */
  clear(): void {
    this.queues.clear();
    this.waiters.clear();
    this.messageCounter = 0;
  }
}
