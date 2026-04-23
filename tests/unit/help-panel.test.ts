/**
 * HelpPanel 组件单元测试
 *
 * 需求 14：帮助面板组件
 * - 14.1 渲染两个带边框的面板：命令列表和快捷键列表
 * - 14.2 显示所有斜杠命令及其简要说明
 * - 14.3 显示所有键盘快捷键及其功能说明
 * - 14.4 使用 Ink Box 组件实现 Flexbox 布局，自动适应终端宽度
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  HelpPanel,
  COMMANDS,
  SHORTCUTS,
  formatCommands,
  formatShortcuts,
  type CommandEntry,
  type ShortcutEntry,
} from '../../src/ink-app/HelpPanel.js';

// ─── COMMANDS constant ───

describe('COMMANDS', () => {
  it('should contain all 11 required slash commands (需求 14.2)', () => {
    const names = COMMANDS.map(c => c.command);
    expect(names).toContain('/clear');
    expect(names).toContain('/cost');
    expect(names).toContain('/compact');
    expect(names).toContain('/config');
    expect(names).toContain('/plan');
    expect(names).toContain('/status');
    expect(names).toContain('/memory');
    expect(names).toContain('/remember');
    expect(names).toContain('/skill');
    expect(names).toContain('/task');
    expect(names).toContain('/help');
  });

  it('should have exactly 11 entries', () => {
    expect(COMMANDS).toHaveLength(11);
  });

  it('should have non-empty descriptions for all commands', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── SHORTCUTS constant ───

describe('SHORTCUTS', () => {
  it('should contain all required keyboard shortcuts (需求 14.3)', () => {
    const keys = SHORTCUTS.map(s => s.key);
    expect(keys).toContain('Enter');
    expect(keys).toContain('Alt+Enter');
    expect(keys).toContain('Ctrl+C');
    expect(keys).toContain('Ctrl+R');
    expect(keys).toContain('Ctrl+L');
    expect(keys).toContain('Tab');
  });

  it('should have exactly 6 entries', () => {
    expect(SHORTCUTS).toHaveLength(6);
  });

  it('should have non-empty descriptions for all shortcuts', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── formatCommands ───

describe('formatCommands', () => {
  it('should pad command names to align descriptions', () => {
    const cmds: CommandEntry[] = [
      { command: '/a', description: 'short' },
      { command: '/long', description: 'longer name' },
    ];
    const lines = formatCommands(cmds);
    expect(lines).toHaveLength(2);
    // Both lines should have the command padded to the same width
    // /a padded to 5 chars ("/long" length) + 2 spaces separator
    expect(lines[0]).toBe('/a     short');
    expect(lines[1]).toBe('/long  longer name');
  });

  it('should format all default commands without error', () => {
    const lines = formatCommands(COMMANDS);
    expect(lines).toHaveLength(11);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

// ─── formatShortcuts ───

describe('formatShortcuts', () => {
  it('should pad key names to align descriptions', () => {
    const shortcuts: ShortcutEntry[] = [
      { key: 'A', description: 'do A' },
      { key: 'Ctrl+B', description: 'do B' },
    ];
    const lines = formatShortcuts(shortcuts);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('A       do A');
    expect(lines[1]).toBe('Ctrl+B  do B');
  });

  it('should format all default shortcuts without error', () => {
    const lines = formatShortcuts(SHORTCUTS);
    expect(lines).toHaveLength(6);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

// ─── HelpPanel Component Rendering ───

describe('HelpPanel Component', () => {
  it('should render two bordered panels (需求 14.1)', () => {
    const { lastFrame } = render(React.createElement(HelpPanel));
    const output = lastFrame();
    // Ink round border uses ╭ ╮ ╰ ╯ characters
    // Two panels means at least 2 occurrences of top-left corner
    const topLeftCount = (output.match(/╭/g) || []).length;
    expect(topLeftCount).toBeGreaterThanOrEqual(2);
  });

  it('should render "Commands" header (需求 14.1)', () => {
    const { lastFrame } = render(React.createElement(HelpPanel));
    const output = lastFrame();
    expect(output).toContain('Commands');
  });

  it('should render "Shortcuts" header (需求 14.1)', () => {
    const { lastFrame } = render(React.createElement(HelpPanel));
    const output = lastFrame();
    expect(output).toContain('Shortcuts');
  });

  it('should display all slash commands (需求 14.2)', () => {
    const { lastFrame } = render(React.createElement(HelpPanel));
    const output = lastFrame();
    for (const cmd of COMMANDS) {
      expect(output).toContain(cmd.command);
      expect(output).toContain(cmd.description);
    }
  });

  it('should display all keyboard shortcuts (需求 14.3)', () => {
    const { lastFrame } = render(React.createElement(HelpPanel));
    const output = lastFrame();
    for (const shortcut of SHORTCUTS) {
      expect(output).toContain(shortcut.key);
      expect(output).toContain(shortcut.description);
    }
  });

  it('should use Ink Box borders (需求 14.4)', () => {
    const { lastFrame } = render(React.createElement(HelpPanel));
    const output = lastFrame();
    // Round border style uses these characters
    expect(output).toContain('╭');
    expect(output).toContain('╮');
    expect(output).toContain('╰');
    expect(output).toContain('╯');
    expect(output).toContain('│');
  });

  it('should accept custom commands and shortcuts via props', () => {
    const customCmds: CommandEntry[] = [
      { command: '/foo', description: 'Do foo' },
    ];
    const customShortcuts: ShortcutEntry[] = [
      { key: 'F1', description: 'Help key' },
    ];
    const { lastFrame } = render(
      React.createElement(HelpPanel, {
        commands: customCmds,
        shortcuts: customShortcuts,
      }),
    );
    const output = lastFrame();
    expect(output).toContain('/foo');
    expect(output).toContain('Do foo');
    expect(output).toContain('F1');
    expect(output).toContain('Help key');
    // Should NOT contain default commands
    expect(output).not.toContain('/clear');
  });
});
