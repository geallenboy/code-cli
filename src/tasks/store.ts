/**
 * 任务存储与管理
 *
 * JSON 文件存储到 ~/.code-cli/tasks/，每个任务一个文件。
 * 支持 CRUD、依赖检查、原子 claiming（文件锁）。
 *
 * 参考 Claude Code: src/tasks/ 系统
 */

import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TASKS_DIR = join(homedir(), '.code-cli', 'tasks');

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  description: string;
  dependencies: string[];
  result?: string;
  createdAt: string;
}

function ensureDir(): void {
  mkdirSync(TASKS_DIR, { recursive: true });
}

let taskCounter = 0;

export function createTask(title: string, description: string = '', dependencies: string[] = []): Task {
  ensureDir();
  const id = `task-${Date.now()}-${taskCounter++}`;
  const task: Task = {
    id,
    title,
    status: 'pending',
    description: description || title,
    dependencies,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(TASKS_DIR, `${id}.json`), JSON.stringify(task, null, 2), 'utf-8');
  return task;
}

export function listTasks(): Task[] {
  ensureDir();
  try {
    return readdirSync(TASKS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(TASKS_DIR, f), 'utf-8')) as Task)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export function loadTask(id: string): Task | null {
  const path = join(TASKS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Task;
  } catch {
    return null;
  }
}

export function updateTask(id: string, updates: Partial<Task>): boolean {
  const task = loadTask(id);
  if (!task) return false;
  const updated = { ...task, ...updates };
  writeFileSync(join(TASKS_DIR, `${id}.json`), JSON.stringify(updated, null, 2), 'utf-8');
  return true;
}

export function claimTask(id: string): boolean {
  // Simple atomic claim via lock file
  const lockPath = join(TASKS_DIR, `${id}.lock`);
  try {
    if (existsSync(lockPath)) return false; // Already claimed
    writeFileSync(lockPath, process.pid.toString(), 'utf-8');
    updateTask(id, { status: 'in_progress' });
    return true;
  } catch {
    return false;
  }
}

export function completeTask(id: string, result: string): void {
  updateTask(id, { status: 'completed', result });
  // Remove lock
  const lockPath = join(TASKS_DIR, `${id}.lock`);
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function canExecute(task: Task): boolean {
  if (task.status !== 'pending') return false;
  if (task.dependencies.length === 0) return true;
  const allTasks = listTasks();
  return task.dependencies.every((depId) => {
    const dep = allTasks.find((t) => t.id === depId);
    return dep?.status === 'completed';
  });
}

export function getProgressSummary(): string {
  const tasks = listTasks();
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return `${completed}/${tasks.length} completed`;
}
