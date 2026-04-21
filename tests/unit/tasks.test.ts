/**
 * Task Management System 单元测试
 *
 * 测试任务管理系统的核心逻辑：
 * - createTask/listTasks/loadTask 往返
 * - canExecute 依赖检查
 * - claimTask 原子操作
 * - getProgressSummary
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Create a stable temp dir before module load
const BASE_TEMP = join(tmpdir(), `tasks-test-base-${Date.now()}`);
mkdirSync(BASE_TEMP, { recursive: true });

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => BASE_TEMP,
  };
});

// Import after mock setup
const { createTask, listTasks, loadTask, updateTask, claimTask, completeTask, canExecute, getProgressSummary } =
  await import('../../src/tasks/store.js');

describe('Task Management System', () => {
  beforeEach(() => {
    // Clean the tasks directory before each test
    const tasksDir = join(BASE_TEMP, '.xiaomi-code', 'tasks');
    rmSync(tasksDir, { recursive: true, force: true });
    mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
  });

  // Cleanup after all tests
  afterEach(() => {});

  describe('createTask / listTasks / loadTask round trip', () => {
    it('should create a task and retrieve it', () => {
      const task = createTask('Test task', 'A test description');
      expect(task.id).toMatch(/^task-\d+-\d+$/);
      expect(task.title).toBe('Test task');
      expect(task.status).toBe('pending');
      expect(task.description).toBe('A test description');
      expect(task.dependencies).toEqual([]);
      expect(task.createdAt).toBeTruthy();
    });

    it('should list created tasks', () => {
      createTask('Task 1');
      createTask('Task 2');
      const tasks = listTasks();
      expect(tasks).toHaveLength(2);
      const titles = tasks.map((t) => t.title);
      expect(titles).toContain('Task 1');
      expect(titles).toContain('Task 2');
    });

    it('should load a specific task by id', () => {
      const created = createTask('Specific task', 'Details here');
      const loaded = loadTask(created.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe('Specific task');
      expect(loaded!.description).toBe('Details here');
    });

    it('should return null for non-existent task', () => {
      const loaded = loadTask('task-nonexistent');
      expect(loaded).toBeNull();
    });

    it('should use title as description when description is empty', () => {
      const task = createTask('My title');
      expect(task.description).toBe('My title');
    });
  });

  describe('updateTask', () => {
    it('should update task fields', () => {
      const task = createTask('Update me');
      const result = updateTask(task.id, { status: 'in_progress' });
      expect(result).toBe(true);
      const loaded = loadTask(task.id);
      expect(loaded!.status).toBe('in_progress');
    });

    it('should return false for non-existent task', () => {
      const result = updateTask('task-nonexistent', { status: 'completed' });
      expect(result).toBe(false);
    });
  });

  describe('canExecute with dependencies', () => {
    it('should allow execution of task with no dependencies', () => {
      const task = createTask('Independent task');
      expect(canExecute(task)).toBe(true);
    });

    it('should block execution when dependencies are not completed', () => {
      const dep = createTask('Dependency');
      const task = createTask('Dependent task', '', [dep.id]);
      expect(canExecute(task)).toBe(false);
    });

    it('should allow execution when all dependencies are completed', () => {
      const dep = createTask('Dependency');
      completeTask(dep.id, 'Done');
      const task = createTask('Dependent task', '', [dep.id]);
      expect(canExecute(task)).toBe(true);
    });

    it('should block execution for non-pending tasks', () => {
      const task = createTask('Already running');
      updateTask(task.id, { status: 'in_progress' });
      const loaded = loadTask(task.id)!;
      expect(canExecute(loaded)).toBe(false);
    });

    it('should handle multiple dependencies', () => {
      const dep1 = createTask('Dep 1');
      const dep2 = createTask('Dep 2');
      const task = createTask('Multi-dep task', '', [dep1.id, dep2.id]);

      // Neither completed
      expect(canExecute(task)).toBe(false);

      // Only one completed
      completeTask(dep1.id, 'Done');
      expect(canExecute(task)).toBe(false);

      // Both completed
      completeTask(dep2.id, 'Done');
      expect(canExecute(task)).toBe(true);
    });
  });

  describe('claimTask', () => {
    it('should claim an unclaimed task', () => {
      const task = createTask('Claimable');
      const claimed = claimTask(task.id);
      expect(claimed).toBe(true);
      const loaded = loadTask(task.id);
      expect(loaded!.status).toBe('in_progress');
    });

    it('should prevent double claiming', () => {
      const task = createTask('Single claim');
      const first = claimTask(task.id);
      expect(first).toBe(true);
      const second = claimTask(task.id);
      expect(second).toBe(false);
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed with result', () => {
      const task = createTask('Complete me');
      claimTask(task.id);
      completeTask(task.id, 'All done!');
      const loaded = loadTask(task.id);
      expect(loaded!.status).toBe('completed');
      expect(loaded!.result).toBe('All done!');
    });

    it('should remove lock file after completion', () => {
      const task = createTask('Lock cleanup');
      claimTask(task.id);
      const lockPath = join(BASE_TEMP, '.xiaomi-code', 'tasks', `${task.id}.lock`);
      expect(existsSync(lockPath)).toBe(true);
      completeTask(task.id, 'Done');
      expect(existsSync(lockPath)).toBe(false);
    });
  });

  describe('getProgressSummary', () => {
    it('should return correct progress summary', () => {
      createTask('Task A');
      const taskB = createTask('Task B');
      createTask('Task C');
      completeTask(taskB.id, 'Done');

      const summary = getProgressSummary();
      expect(summary).toBe('1/3 completed');
    });

    it('should handle empty task list', () => {
      const summary = getProgressSummary();
      expect(summary).toBe('0/0 completed');
    });
  });
});
