/**
 * 欢迎屏幕与项目上下文单元测试
 *
 * 测试项目名称检测、git 信息获取、欢迎屏幕格式化。
 * 使用临时目录模拟项目结构。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectFromPackageJson,
  detectFromCargoToml,
  detectFromPyprojectToml,
  detectProjectName,
  formatWelcomeScreen,
  renderWelcomeScreen,
  type ProjectContext,
} from '../../src/welcome.js';

describe('detectFromPackageJson', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `welcome-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect name from package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-app' }));
    expect(detectFromPackageJson(tmpDir)).toBe('my-app');
  });

  it('should return null when no package.json', () => {
    expect(detectFromPackageJson(tmpDir)).toBeNull();
  });

  it('should return null for package.json without name', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(detectFromPackageJson(tmpDir)).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    writeFileSync(join(tmpDir, 'package.json'), 'not json{{{');
    expect(detectFromPackageJson(tmpDir)).toBeNull();
  });
});

describe('detectFromCargoToml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `welcome-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect name from Cargo.toml', () => {
    writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]\nname = "my-rust-app"\nversion = "0.1.0"');
    expect(detectFromCargoToml(tmpDir)).toBe('my-rust-app');
  });

  it('should return null when no Cargo.toml', () => {
    expect(detectFromCargoToml(tmpDir)).toBeNull();
  });

  it('should return null when no name field', () => {
    writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]\nversion = "0.1.0"');
    expect(detectFromCargoToml(tmpDir)).toBeNull();
  });
});

describe('detectFromPyprojectToml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `welcome-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect name from pyproject.toml', () => {
    writeFileSync(join(tmpDir, 'pyproject.toml'), '[project]\nname = "my-python-app"\nversion = "1.0"');
    expect(detectFromPyprojectToml(tmpDir)).toBe('my-python-app');
  });

  it('should return null when no pyproject.toml', () => {
    expect(detectFromPyprojectToml(tmpDir)).toBeNull();
  });
});

describe('detectProjectName', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `welcome-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should prefer package.json over others', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'from-pkg' }));
    writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]\nname = "from-cargo"');
    const result = detectProjectName(tmpDir);
    expect(result.name).toBe('from-pkg');
    expect(result.source).toBe('package.json');
  });

  it('should fall back to Cargo.toml', () => {
    writeFileSync(join(tmpDir, 'Cargo.toml'), '[package]\nname = "from-cargo"');
    const result = detectProjectName(tmpDir);
    expect(result.name).toBe('from-cargo');
    expect(result.source).toBe('Cargo.toml');
  });

  it('should fall back to pyproject.toml', () => {
    writeFileSync(join(tmpDir, 'pyproject.toml'), '[project]\nname = "from-py"');
    const result = detectProjectName(tmpDir);
    expect(result.name).toBe('from-py');
    expect(result.source).toBe('pyproject.toml');
  });

  it('should fall back to directory name', () => {
    const result = detectProjectName(tmpDir);
    expect(result.name).toBe(basename(tmpDir));
    expect(result.source).toBe('dirname');
  });
});

/**
 * Helper: strip all ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatWelcomeScreen', () => {
  it('should include project name', () => {
    const ctx: ProjectContext = {
      name: 'my-app',
      nameSource: 'package.json',
      gitBranch: null,
      uncommittedChanges: null,
      provider: 'anthropic',
      model: 'claude-4-sonnet',
    };
    const lines = formatWelcomeScreen(ctx);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('my-app');
  });

  it('should include git branch when available', () => {
    const ctx: ProjectContext = {
      name: 'my-app',
      nameSource: 'package.json',
      gitBranch: 'main',
      uncommittedChanges: 0,
      provider: 'anthropic',
      model: 'claude-4-sonnet',
    };
    const lines = formatWelcomeScreen(ctx);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('main');
  });

  it('should show uncommitted changes count', () => {
    const ctx: ProjectContext = {
      name: 'my-app',
      nameSource: 'package.json',
      gitBranch: 'feature',
      uncommittedChanges: 3,
      provider: 'anthropic',
      model: 'claude-4-sonnet',
    };
    const lines = formatWelcomeScreen(ctx);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('3 uncommitted changes');
  });

  it('should use singular for 1 change', () => {
    const ctx: ProjectContext = {
      name: 'my-app',
      nameSource: 'package.json',
      gitBranch: 'feature',
      uncommittedChanges: 1,
      provider: 'anthropic',
      model: 'claude-4-sonnet',
    };
    const lines = formatWelcomeScreen(ctx);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('1 uncommitted change');
    // Should not contain "changes" (plural)
    expect(text).not.toMatch(/1 uncommitted changes/);
  });

  it('should not show git line when no git', () => {
    const ctx: ProjectContext = {
      name: 'my-app',
      nameSource: 'package.json',
      gitBranch: null,
      uncommittedChanges: null,
      provider: 'anthropic',
      model: 'claude-4-sonnet',
    };
    const lines = formatWelcomeScreen(ctx);
    const text = stripAnsi(lines.join('\n'));
    expect(text).not.toContain('🔀');
  });

  it('should include provider and model', () => {
    const ctx: ProjectContext = {
      name: 'my-app',
      nameSource: 'package.json',
      gitBranch: null,
      uncommittedChanges: null,
      provider: 'openai',
      model: 'gpt-4o',
    };
    const lines = formatWelcomeScreen(ctx);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('openai');
    expect(text).toContain('gpt-4o');
  });

  it('should not show change count when zero', () => {
    const ctx: ProjectContext = {
      name: 'my-app',
      nameSource: 'package.json',
      gitBranch: 'main',
      uncommittedChanges: 0,
      provider: 'anthropic',
      model: 'claude-4-sonnet',
    };
    const lines = formatWelcomeScreen(ctx);
    const text = stripAnsi(lines.join('\n'));
    expect(text).not.toContain('uncommitted');
  });

  it('should use box drawing when terminal is wide enough', () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true });
    try {
      const ctx: ProjectContext = {
        name: 'my-app',
        nameSource: 'package.json',
        gitBranch: 'main',
        uncommittedChanges: 0,
        provider: 'anthropic',
        model: 'claude-4-sonnet',
      };
      const lines = formatWelcomeScreen(ctx);
      const text = stripAnsi(lines.join('\n'));
      expect(text).toContain('╭');
      expect(text).toContain('╯');
      expect(text).toContain('Code CLI');
    } finally {
      Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true });
    }
  });

  it('should fall back to simple format for narrow terminals', () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: 30, configurable: true });
    try {
      const ctx: ProjectContext = {
        name: 'my-app',
        nameSource: 'package.json',
        gitBranch: 'main',
        uncommittedChanges: 0,
        provider: 'anthropic',
        model: 'claude-4-sonnet',
      };
      const lines = formatWelcomeScreen(ctx);
      const text = stripAnsi(lines.join('\n'));
      // Simple format should not have box drawing
      expect(text).not.toContain('╭');
      expect(text).toContain('my-app');
    } finally {
      Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true });
    }
  });
});

describe('renderWelcomeScreen', () => {
  it('should render within 500ms', () => {
    const start = performance.now();
    const lines = renderWelcomeScreen(process.cwd(), 'anthropic', 'claude-4-sonnet');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should detect current project name', () => {
    // Running in the cc-cli project directory
    const lines = renderWelcomeScreen(process.cwd(), 'anthropic', 'claude-4-sonnet');
    const text = stripAnsi(lines.join('\n'));
    // Should find package.json name "code-cli"
    expect(text).toContain('code-cli');
  });

  it('should include provider and model', () => {
    const lines = renderWelcomeScreen(process.cwd(), 'openai', 'gpt-4o');
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('openai');
    expect(text).toContain('gpt-4o');
  });
});
