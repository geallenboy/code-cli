/**
 * WelcomeScreen Ink 组件单元测试
 *
 * 需求 13：欢迎屏幕组件
 * - 13.1 渲染项目目录、Git 分支信息、提供商和模型名称
 * - 13.2 显示常用快捷键列表（Enter 提交、Alt+Enter 换行、Ctrl+C 中止、Ctrl+R 搜索历史、Tab 补全路径）
 * - 13.3 使用 Ink Box 组件渲染带边框的欢迎面板
 * - 13.4 Git 信息获取失败时优雅降级，仅显示项目目录而不显示分支信息
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  WelcomeScreen,
  SHORTCUT_HINTS,
  buildProjectLine,
  formatShortcutHints,
} from '../../src/ink-app/WelcomeScreen.js';
import type { ProjectContext } from '../../src/welcome.js';

// ─── Helper ───

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    name: 'test-project',
    nameSource: 'package.json',
    gitBranch: 'main',
    uncommittedChanges: 0,
    provider: 'anthropic',
    model: 'claude-4-sonnet',
    ...overrides,
  };
}

// ─── buildProjectLine ───

describe('buildProjectLine', () => {
  it('should return project name and branch', () => {
    const ctx = makeContext({ name: 'my-app', gitBranch: 'develop' });
    const result = buildProjectLine(ctx);
    expect(result.name).toBe('my-app');
    expect(result.branch).toBe('develop');
  });

  it('should return null branch when git info is unavailable', () => {
    const ctx = makeContext({ gitBranch: null });
    const result = buildProjectLine(ctx);
    expect(result.name).toBe('test-project');
    expect(result.branch).toBeNull();
  });
});

// ─── formatShortcutHints ───

describe('formatShortcutHints', () => {
  it('should format all hints as "key description" strings', () => {
    const hints = formatShortcutHints(SHORTCUT_HINTS);
    expect(hints).toHaveLength(5);
    expect(hints[0]).toBe('Enter 提交');
    expect(hints[1]).toBe('Alt+Enter 换行');
    expect(hints[2]).toBe('Ctrl+C 中止');
    expect(hints[3]).toBe('Ctrl+R 搜索历史');
    expect(hints[4]).toBe('Tab 补全路径');
  });
});

// ─── SHORTCUT_HINTS constant ───

describe('SHORTCUT_HINTS', () => {
  it('should contain all 5 required shortcuts (需求 13.2)', () => {
    const keys = SHORTCUT_HINTS.map(h => h.key);
    expect(keys).toContain('Enter');
    expect(keys).toContain('Alt+Enter');
    expect(keys).toContain('Ctrl+C');
    expect(keys).toContain('Ctrl+R');
    expect(keys).toContain('Tab');
  });

  it('should have exactly 5 entries', () => {
    expect(SHORTCUT_HINTS).toHaveLength(5);
  });
});

// ─── WelcomeScreen Component Rendering ───

describe('WelcomeScreen Component', () => {
  it('should render project name (需求 13.1)', () => {
    const ctx = makeContext({ name: 'my-cool-app' });
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('my-cool-app');
  });

  it('should render git branch when available (需求 13.1)', () => {
    const ctx = makeContext({ gitBranch: 'feature/new-ui' });
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('feature/new-ui');
    expect(output).toContain('🔀');
  });

  it('should render provider and model (需求 13.1)', () => {
    const ctx = makeContext({ provider: 'openai', model: 'gpt-4o' });
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'openai',
        model: 'gpt-4o',
        context: ctx,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('openai');
    expect(output).toContain('gpt-4o');
  });

  it('should display all 5 shortcut hints (需求 13.2)', () => {
    const ctx = makeContext();
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('Enter');
    expect(output).toContain('Alt+Enter');
    expect(output).toContain('Ctrl+C');
    expect(output).toContain('Ctrl+R');
    expect(output).toContain('Tab');
  });

  it('should render with Ink Box border (需求 13.3)', () => {
    const ctx = makeContext();
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    // Ink round border uses ╭ ╮ ╰ ╯ characters
    expect(output).toContain('╭');
    expect(output).toContain('╯');
  });

  it('should render Code CLI title', () => {
    const ctx = makeContext();
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('Code CLI');
  });

  it('should gracefully degrade when git info is null (需求 13.4)', () => {
    const ctx = makeContext({ gitBranch: null, uncommittedChanges: null });
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    // Should still show project name
    expect(output).toContain('test-project');
    // Should NOT show branch indicator
    expect(output).not.toContain('🔀');
    // Should still show provider/model
    expect(output).toContain('anthropic');
    expect(output).toContain('claude-4-sonnet');
  });

  it('should show project directory icon', () => {
    const ctx = makeContext({ name: 'my-project' });
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('📁');
  });

  it('should show robot icon for provider/model', () => {
    const ctx = makeContext();
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
        context: ctx,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('🤖');
  });

  it('should use collectProjectContext when no context prop is provided', () => {
    // When no context is provided, it calls collectProjectContext internally
    // This test verifies it works with the real cwd
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        provider: 'test-provider',
        model: 'test-model',
      }),
    );
    const output = lastFrame();
    // Should render without errors and contain provider/model
    expect(output).toContain('test-provider');
    expect(output).toContain('test-model');
    // Should contain the project name (from package.json in this repo)
    expect(output).toContain('code-cli');
  });
});
