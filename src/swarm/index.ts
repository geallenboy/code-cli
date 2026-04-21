/**
 * Swarm 模块入口
 *
 * 导出 Swarm 管理器、消息邮箱和 Swarm Agent。
 */

export { SwarmManager, type SwarmConfig } from './swarm.js';
export { Mailbox, type MailboxMessage } from './mailbox.js';
export { SwarmAgent, type SwarmAgentConfig, type SwarmAgentStatus } from './agent.js';
