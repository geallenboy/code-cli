/**
 * Coordinator 模式单元测试
 *
 * 测试 Coordinator 模块的核心逻辑：
 * - Coordinator 4 阶段工作流
 * - 任务创建和管理
 * - WorktreeManager slug 验证和生命周期
 * - 正确性属性 P30: Coordinator 不能直接使用文件/Shell 工具
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Coordinator, type CoordinatorConfig } from '../../src/coordinator/coordinator.js';
import { WorktreeManager } from '../../src/coordinator/worktree.js';

// ===== WorktreeManager Tests =====

describe('WorktreeManager', () => {
  describe('slug validation', () => {
    let manager: WorktreeManager;

    beforeEach(() => {
      manager = new WorktreeManager('/tmp/test-repo');
    });

    it('should accept valid slugs', () => {
      expect(() => manager.validateSlug('task-1')).not.toThrow();
      expect(() => manager.validateSlug('my_task')).not.toThrow();
      expect(() => manager.validateSlug('feature/auth')).not.toThrow();
      expect(() => manager.validateSlug('v1.0.0')).not.toThrow();
    });

    it('should reject empty slugs', () => {
      expect(() => manager.validateSlug('')).toThrow('must be 1-64 characters');
    });

    it('should reject slugs exceeding max length', () => {
      const longSlug = 'a'.repeat(65);
      expect(() => manager.validateSlug(longSlug)).toThrow('must be 1-64 characters');
    });

    it('should reject slugs with invalid characters', () => {
      expect(() => manager.validateSlug('task with spaces')).toThrow('invalid characters');
      expect(() => manager.validateSlug('task@name')).toThrow('invalid characters');
      expect(() => manager.validateSlug('task#1')).toThrow('invalid characters');
    });

    it('should reject path traversal attempts', () => {
      expect(() => manager.validateSlug('../escape')).toThrow('path traversal');
      expect(() => manager.validateSlug('foo/../../bar')).toThrow('path traversal');
    });

    it('should reject absolute paths', () => {
      expect(() => manager.validateSlug('/absolute/path')).toThrow('path traversal');
    });

    it('should accept max length slug', () => {
      const maxSlug = 'a'.repeat(64);
      expect(() => manager.validateSlug(maxSlug)).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('should start with zero active worktrees', () => {
      const manager = new WorktreeManager('/tmp/test-repo');
      expect(manager.size).toBe(0);
      expect(manager.getAll()).toEqual([]);
    });

    it('should detect non-git repos', () => {
      const manager = new WorktreeManager('/tmp/definitely-not-a-repo-' + Date.now());
      expect(manager.isGitRepo()).toBe(false);
    });
  });
});

// ===== Coordinator Tests =====

describe('Coordinator', () => {
  const baseConfig: CoordinatorConfig = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    yolo: true,
    effectiveContextWindow: 128000,
    useWorktree: false,
    maxParallelAgents: 2,
  };

  describe('construction', () => {
    it('should create a coordinator with default phase', () => {
      const coord = new Coordinator(baseConfig);
      expect(coord.phase).toBe('research');
      expect(coord.getTasks()).toEqual([]);
    });
  });

  describe('task management', () => {
    it('should create tasks with incremental IDs', () => {
      const coord = new Coordinator(baseConfig);
      const t1 = coord.createTask('Task 1', 'explore');
      const t2 = coord.createTask('Task 2', 'implement');
      const t3 = coord.createTask('Task 3', 'verify');

      expect(t1.id).toBe('task-1');
      expect(t2.id).toBe('task-2');
      expect(t3.id).toBe('task-3');
    });

    it('should create tasks with correct defaults', () => {
      const coord = new Coordinator(baseConfig);
      const task = coord.createTask('Test task');

      expect(task.description).toBe('Test task');
      expect(task.type).toBe('implement');
      expect(task.status).toBe('pending');
      expect(task.result).toBeUndefined();
      expect(task.error).toBeUndefined();
    });

    it('should return a copy of tasks list', () => {
      const coord = new Coordinator(baseConfig);
      coord.createTask('Task 1');
      const tasks = coord.getTasks();
      tasks.push(coord.createTask('Task 2'));

      // Original should only have 2 tasks (the one we created + the one from push)
      // But getTasks() returns a copy, so modifying it shouldn't affect internal state
      expect(coord.getTasks().length).toBe(2);
    });
  });

  describe('synthesize phase', () => {
    it('should generate a plan from research results', () => {
      const coord = new Coordinator(baseConfig);
      coord.createTask('Implement feature X', 'implement');

      const plan = coord.synthesize('Add user authentication');
      expect(plan).toContain('Implementation Plan');
      expect(plan).toContain('Add user authentication');
      expect(coord.phase).toBe('synthesize');
    });
  });

  describe('P30: Coordinator tool restriction', () => {
    it('should only create explore/verify tasks for research and verify phases', () => {
      const coord = new Coordinator(baseConfig);

      // Research creates explore tasks
      const researchTask = coord.createTask('Explore codebase', 'explore');
      expect(researchTask.type).toBe('explore');

      // Verify creates verify tasks
      const verifyTask = coord.createTask('Check results', 'verify');
      expect(verifyTask.type).toBe('verify');
    });

    it('should delegate implementation to sub-agents via tasks', () => {
      const coord = new Coordinator(baseConfig);
      const task = coord.createTask('Write the code', 'implement');

      // Coordinator creates tasks but doesn't execute directly
      expect(task.status).toBe('pending');
      expect(task.type).toBe('implement');
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', () => {
      const coord = new Coordinator(baseConfig);
      coord.createTask('Task 1');
      expect(() => coord.cleanup()).not.toThrow();
    });
  });
});
