/**
 * Swarm 模式单元测试
 *
 * 测试 Swarm 模块的核心逻辑：
 * - Mailbox 消息传递和隔离
 * - SwarmAgent 生命周期
 * - SwarmManager 注册和管理
 * - 正确性属性 P31: Swarm 消息不跨 Agent 泄露
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Mailbox } from '../../src/swarm/mailbox.js';
import { SwarmAgent, type SwarmAgentConfig } from '../../src/swarm/agent.js';
import { SwarmManager, type SwarmConfig } from '../../src/swarm/swarm.js';

// ===== Mailbox Tests =====

describe('Mailbox', () => {
  let mailbox: Mailbox;

  beforeEach(() => {
    mailbox = new Mailbox();
  });

  describe('registration', () => {
    it('should register agents', () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');
      expect(mailbox.getRegisteredAgents()).toContain('agent-a');
      expect(mailbox.getRegisteredAgents()).toContain('agent-b');
    });

    it('should handle duplicate registration gracefully', () => {
      mailbox.register('agent-a');
      mailbox.register('agent-a');
      expect(mailbox.getRegisteredAgents().filter(n => n === 'agent-a')).toHaveLength(1);
    });

    it('should unregister agents', () => {
      mailbox.register('agent-a');
      mailbox.unregister('agent-a');
      expect(mailbox.getRegisteredAgents()).not.toContain('agent-a');
    });
  });

  describe('send and receive', () => {
    it('should send a message to a registered agent', () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');

      const msgId = mailbox.send('agent-a', 'agent-b', 'Hello B!');
      expect(msgId).toMatch(/^msg-\d+$/);
      expect(mailbox.getQueueSize('agent-b')).toBe(1);
    });

    it('should throw when sending to unregistered agent', () => {
      mailbox.register('agent-a');
      expect(() => mailbox.send('agent-a', 'unknown', 'Hello')).toThrow('not registered');
    });

    it('should receive messages in FIFO order', async () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');

      mailbox.send('agent-a', 'agent-b', 'First');
      mailbox.send('agent-a', 'agent-b', 'Second');

      const msg1 = await mailbox.receive('agent-b');
      const msg2 = await mailbox.receive('agent-b');

      expect(msg1?.content).toBe('First');
      expect(msg2?.content).toBe('Second');
    });

    it('should mark received messages as read', async () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');

      mailbox.send('agent-a', 'agent-b', 'Hello');
      const msg = await mailbox.receive('agent-b');

      expect(msg?.read).toBe(true);
    });

    it('should include correct from/to fields', async () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');

      mailbox.send('agent-a', 'agent-b', 'Hello');
      const msg = await mailbox.receive('agent-b');

      expect(msg?.from).toBe('agent-a');
      expect(msg?.to).toBe('agent-b');
    });

    it('should timeout when no messages available', async () => {
      mailbox.register('agent-a');
      const msg = await mailbox.receive('agent-a', 50);
      expect(msg).toBeNull();
    });

    it('should throw when receiving from unregistered agent', async () => {
      await expect(mailbox.receive('unknown')).rejects.toThrow('not registered');
    });
  });

  describe('P31: message isolation', () => {
    it('should not allow agent-a to read agent-b messages', async () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');

      mailbox.send('agent-a', 'agent-b', 'Secret for B');

      // agent-a should have no messages
      expect(mailbox.getQueueSize('agent-a')).toBe(0);
      const msg = await mailbox.receive('agent-a', 50);
      expect(msg).toBeNull();

      // agent-b should have the message
      expect(mailbox.getQueueSize('agent-b')).toBe(1);
    });

    it('should isolate messages between multiple agents', async () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');
      mailbox.register('agent-c');

      mailbox.send('agent-a', 'agent-b', 'For B only');
      mailbox.send('agent-a', 'agent-c', 'For C only');

      const msgB = await mailbox.receive('agent-b');
      const msgC = await mailbox.receive('agent-c');

      expect(msgB?.content).toBe('For B only');
      expect(msgC?.content).toBe('For C only');

      // Cross-check: B shouldn't see C's message
      expect(mailbox.getQueueSize('agent-b')).toBe(0);
      expect(mailbox.getQueueSize('agent-c')).toBe(0);
    });
  });

  describe('peek', () => {
    it('should peek without consuming messages', () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');

      mailbox.send('agent-a', 'agent-b', 'Hello');

      const peeked = mailbox.peek('agent-b');
      expect(peeked).toHaveLength(1);
      expect(peeked[0].content).toBe('Hello');

      // Message should still be in queue
      expect(mailbox.getQueueSize('agent-b')).toBe(1);
    });

    it('should return empty array for empty queue', () => {
      mailbox.register('agent-a');
      expect(mailbox.peek('agent-a')).toEqual([]);
    });
  });

  describe('async delivery', () => {
    it('should deliver message to waiting receiver', async () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');

      // Start receiving before sending
      const receivePromise = mailbox.receive('agent-b', 5000);

      // Send after a small delay
      setTimeout(() => {
        mailbox.send('agent-a', 'agent-b', 'Async hello');
      }, 10);

      const msg = await receivePromise;
      expect(msg?.content).toBe('Async hello');
    });
  });

  describe('clear', () => {
    it('should clear all queues and registrations', () => {
      mailbox.register('agent-a');
      mailbox.register('agent-b');
      mailbox.send('agent-a', 'agent-b', 'Hello');

      mailbox.clear();

      expect(mailbox.getRegisteredAgents()).toEqual([]);
    });
  });
});

// ===== SwarmAgent Tests =====

describe('SwarmAgent', () => {
  const baseConfig: SwarmAgentConfig = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    yolo: true,
    effectiveContextWindow: 128000,
    name: 'test-agent',
    role: 'test worker',
  };

  it('should create an agent with correct name', () => {
    const mailbox = new Mailbox();
    const agent = new SwarmAgent(baseConfig, mailbox);

    expect(agent.name).toBe('test-agent');
    expect(agent.state).toBe('idle');
  });

  it('should register in mailbox on creation', () => {
    const mailbox = new Mailbox();
    const agent = new SwarmAgent(baseConfig, mailbox);

    expect(mailbox.getRegisteredAgents()).toContain('test-agent');
    agent.cleanup();
  });

  it('should unregister from mailbox on cleanup', () => {
    const mailbox = new Mailbox();
    const agent = new SwarmAgent(baseConfig, mailbox);
    agent.cleanup();

    expect(mailbox.getRegisteredAgents()).not.toContain('test-agent');
  });

  it('should send messages through mailbox', () => {
    const mailbox = new Mailbox();
    const agentA = new SwarmAgent({ ...baseConfig, name: 'agent-a' }, mailbox);
    const agentB = new SwarmAgent({ ...baseConfig, name: 'agent-b' }, mailbox);

    const msgId = agentA.send('agent-b', 'Hello from A');
    expect(msgId).toMatch(/^msg-\d+$/);
    expect(mailbox.getQueueSize('agent-b')).toBe(1);

    agentA.cleanup();
    agentB.cleanup();
  });

  it('should return correct status', () => {
    const mailbox = new Mailbox();
    const agent = new SwarmAgent(baseConfig, mailbox);

    const status = agent.getStatus();
    expect(status.name).toBe('test-agent');
    expect(status.state).toBe('idle');
    expect(status.messagesProcessed).toBe(0);

    agent.cleanup();
  });
});

// ===== SwarmManager Tests =====

describe('SwarmManager', () => {
  const baseConfig: SwarmConfig = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    yolo: true,
    effectiveContextWindow: 128000,
    maxAgents: 3,
  };

  describe('agent registration', () => {
    it('should register agents', () => {
      const manager = new SwarmManager(baseConfig);
      const agent = manager.registerAgent('worker-1', 'code reviewer');

      expect(agent.name).toBe('worker-1');
      expect(manager.size).toBe(1);

      manager.cleanup();
    });

    it('should reject duplicate agent names', () => {
      const manager = new SwarmManager(baseConfig);
      manager.registerAgent('worker-1');

      expect(() => manager.registerAgent('worker-1')).toThrow('already registered');

      manager.cleanup();
    });

    it('should enforce max agent limit', () => {
      const manager = new SwarmManager(baseConfig);
      manager.registerAgent('worker-1');
      manager.registerAgent('worker-2');
      manager.registerAgent('worker-3');

      expect(() => manager.registerAgent('worker-4')).toThrow('Maximum agent count');

      manager.cleanup();
    });

    it('should unregister agents', () => {
      const manager = new SwarmManager(baseConfig);
      manager.registerAgent('worker-1');
      manager.unregisterAgent('worker-1');

      expect(manager.size).toBe(0);
      expect(manager.getAgent('worker-1')).toBeUndefined();

      manager.cleanup();
    });
  });

  describe('status', () => {
    it('should return status for all agents', () => {
      const manager = new SwarmManager(baseConfig);
      manager.registerAgent('worker-1', 'reviewer');
      manager.registerAgent('worker-2', 'implementer');

      const status = manager.getStatus();
      expect(status).toHaveLength(2);
      expect(status.map(s => s.name)).toContain('worker-1');
      expect(status.map(s => s.name)).toContain('worker-2');

      manager.cleanup();
    });
  });

  describe('messaging', () => {
    it('should send messages between agents', () => {
      const manager = new SwarmManager(baseConfig);
      manager.registerAgent('agent-a');
      manager.registerAgent('agent-b');

      const msgId = manager.sendMessage('agent-a', 'agent-b', 'Hello');
      expect(msgId).toMatch(/^msg-\d+$/);

      const mailbox = manager.getMailbox();
      expect(mailbox.getQueueSize('agent-b')).toBe(1);

      manager.cleanup();
    });
  });

  describe('cleanup', () => {
    it('should cleanup all agents and mailbox', () => {
      const manager = new SwarmManager(baseConfig);
      manager.registerAgent('worker-1');
      manager.registerAgent('worker-2');

      manager.cleanup();

      expect(manager.size).toBe(0);
    });
  });
});
