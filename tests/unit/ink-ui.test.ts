/**
 * Ink UI 组件单元测试
 *
 * 测试组件化终端 UI：
 * - InkRenderer 模式切换和降级
 * - StreamingText 流式渲染
 * - PermissionDialog 对话框和选择解析
 * - ToolProgress 进度指示器
 * - InkSpinner 动画
 * - P33: --no-ink 回退到 chalk 输出
 */

import { describe, it, expect } from 'vitest';
import { InkRenderer } from '../../src/ink/renderer.js';
import { StreamingText } from '../../src/ink/components/streaming-text.js';
import { PermissionDialog } from '../../src/ink/components/permission-dialog.js';
import { ToolProgress, type ToolProgressState } from '../../src/ink/components/tool-progress.js';
import { InkSpinner } from '../../src/ink/components/spinner.js';

// ===== InkRenderer Tests =====

describe('InkRenderer', () => {
  describe('mode selection', () => {
    it('should be in Ink mode when useInk is true', () => {
      const renderer = new InkRenderer({ useInk: true });
      expect(renderer.isInkMode).toBe(true);
    });

    it('should be in chalk mode when useInk is false', () => {
      const renderer = new InkRenderer({ useInk: false });
      expect(renderer.isInkMode).toBe(false);
    });
  });

  describe('P33: chalk fallback', () => {
    it('should render streaming text in chalk mode', () => {
      const renderer = new InkRenderer({ useInk: false });
      const result = renderer.renderStreamingText('Hello world');
      expect(result).toBe('Hello world');
    });

    it('should render tool progress in chalk mode', () => {
      const renderer = new InkRenderer({ useInk: false });
      const result = renderer.renderToolProgress({
        toolName: 'read_file',
        status: 'completed',
        elapsed: 150,
      });
      expect(result).toContain('read_file');
      expect(result).toContain('✅');
    });

    it('should render spinner in chalk mode', () => {
      const renderer = new InkRenderer({ useInk: false });
      const result = renderer.renderSpinner('Loading...');
      expect(result).toContain('Loading...');
    });

    it('should render permission dialog in chalk mode', () => {
      const renderer = new InkRenderer({ useInk: false });
      const result = renderer.renderPermissionDialog(
        'run_shell',
        'Executes arbitrary shell commands',
        'allow run_shell',
      );
      expect(result).toContain('run_shell');
      expect(result).toContain('Permission');
    });
  });

  describe('Ink mode rendering', () => {
    it('should render streaming text in Ink mode', () => {
      const renderer = new InkRenderer({ useInk: true });
      const result = renderer.renderStreamingText('Hello');
      expect(result).toBeDefined();
    });

    it('should render tool progress in Ink mode', () => {
      const renderer = new InkRenderer({ useInk: true });
      const result = renderer.renderToolProgress({
        toolName: 'edit_file',
        status: 'running',
      });
      expect(result).toContain('edit_file');
    });
  });

  describe('formatPermissionChoice', () => {
    it('should format yes choice', () => {
      const renderer = new InkRenderer({ useInk: false });
      expect(renderer.formatPermissionChoice('yes')).toContain('Allowed');
    });

    it('should format no choice', () => {
      const renderer = new InkRenderer({ useInk: false });
      expect(renderer.formatPermissionChoice('no')).toContain('Denied');
    });

    it('should format always choice', () => {
      const renderer = new InkRenderer({ useInk: false });
      expect(renderer.formatPermissionChoice('always')).toContain('Always');
    });
  });
});

// ===== StreamingText Tests =====

describe('StreamingText', () => {
  it('should render text chunks', () => {
    const st = new StreamingText();
    const result = st.render('Hello ');
    expect(result).toBeDefined();
  });

  it('should accumulate text', () => {
    const st = new StreamingText();
    st.render('Hello ');
    st.render('World');
    expect(st.getFullText()).toBe('Hello World');
  });

  it('should reset state', () => {
    const st = new StreamingText();
    st.render('Hello');
    st.reset();
    expect(st.getFullText()).toBe('');
    expect(st.isInCodeBlock).toBe(false);
  });

  it('should start not in code block', () => {
    const st = new StreamingText();
    expect(st.isInCodeBlock).toBe(false);
  });
});

// ===== PermissionDialog Tests =====

describe('PermissionDialog', () => {
  const dialog = new PermissionDialog();

  describe('render', () => {
    it('should render dialog with tool name', () => {
      const result = dialog.render('run_shell', 'Executes commands');
      expect(result).toContain('run_shell');
      expect(result).toContain('Permission');
    });

    it('should include risk explanation', () => {
      const result = dialog.render('run_shell', 'Dangerous operation');
      expect(result).toContain('Dangerous operation');
    });

    it('should include suggested rule when provided', () => {
      const result = dialog.render('run_shell', 'Risk', 'allow run_shell');
      expect(result).toContain('allow run_shell');
    });

    it('should show y/n/a options', () => {
      const result = dialog.render('tool', 'risk');
      expect(result).toContain('y');
      expect(result).toContain('n');
      expect(result).toContain('a');
    });
  });

  describe('parseChoice', () => {
    it('should parse "y" as yes', () => {
      expect(dialog.parseChoice('y')).toBe('yes');
    });

    it('should parse "yes" as yes', () => {
      expect(dialog.parseChoice('yes')).toBe('yes');
    });

    it('should parse "n" as no', () => {
      expect(dialog.parseChoice('n')).toBe('no');
    });

    it('should parse "no" as no', () => {
      expect(dialog.parseChoice('no')).toBe('no');
    });

    it('should parse "a" as always', () => {
      expect(dialog.parseChoice('a')).toBe('always');
    });

    it('should parse "always" as always', () => {
      expect(dialog.parseChoice('always')).toBe('always');
    });

    it('should return null for invalid input', () => {
      expect(dialog.parseChoice('maybe')).toBeNull();
      expect(dialog.parseChoice('')).toBeNull();
    });

    it('should be case insensitive', () => {
      expect(dialog.parseChoice('Y')).toBe('yes');
      expect(dialog.parseChoice('YES')).toBe('yes');
      expect(dialog.parseChoice('N')).toBe('no');
      expect(dialog.parseChoice('A')).toBe('always');
    });

    it('should trim whitespace', () => {
      expect(dialog.parseChoice('  y  ')).toBe('yes');
    });
  });
});

// ===== ToolProgress Tests =====

describe('ToolProgress', () => {
  it('should render running state with spinner', () => {
    const tp = new ToolProgress();
    const result = tp.render({
      toolName: 'read_file',
      status: 'running',
    });
    expect(result).toContain('read_file');
  });

  it('should render completed state', () => {
    const tp = new ToolProgress();
    const result = tp.render({
      toolName: 'edit_file',
      status: 'completed',
      elapsed: 250,
    });
    expect(result).toContain('edit_file');
    expect(result).toContain('✅');
  });

  it('should render failed state', () => {
    const tp = new ToolProgress();
    const result = tp.render({
      toolName: 'run_shell',
      status: 'failed',
      resultSummary: 'Command not found',
    });
    expect(result).toContain('run_shell');
    expect(result).toContain('❌');
  });

  it('should render nested tools with indentation', () => {
    const tp = new ToolProgress();
    const result = tp.render({
      toolName: 'sub_tool',
      status: 'running',
      depth: 2,
    });
    expect(result).toMatch(/^\s{4}/); // 2 levels * 2 spaces
  });

  it('should format elapsed time correctly', () => {
    const tp = new ToolProgress();

    // Milliseconds
    const ms = tp.render({ toolName: 't', status: 'completed', elapsed: 500 });
    expect(ms).toContain('500ms');

    // Seconds
    const sec = tp.render({ toolName: 't', status: 'completed', elapsed: 2500 });
    expect(sec).toContain('2.5s');

    // Minutes
    const min = tp.render({ toolName: 't', status: 'completed', elapsed: 90000 });
    expect(min).toContain('1.5m');
  });

  it('should render a list of tool progress', () => {
    const tp = new ToolProgress();
    const states: ToolProgressState[] = [
      { toolName: 'read_file', status: 'completed', elapsed: 100 },
      { toolName: 'edit_file', status: 'running' },
      { toolName: 'run_shell', status: 'failed' },
    ];
    const result = tp.renderList(states);
    expect(result).toContain('read_file');
    expect(result).toContain('edit_file');
    expect(result).toContain('run_shell');
  });

  it('should include input summary when provided', () => {
    const tp = new ToolProgress();
    const result = tp.render({
      toolName: 'read_file',
      status: 'running',
      inputSummary: 'src/index.ts',
    });
    expect(result).toContain('src/index.ts');
  });

  it('should reset spinner frame', () => {
    const tp = new ToolProgress();
    tp.render({ toolName: 't', status: 'running' });
    tp.render({ toolName: 't', status: 'running' });
    tp.reset();
    // After reset, should start from frame 0 again
    const result = tp.render({ toolName: 't', status: 'running' });
    expect(result).toContain('⠋'); // First frame
  });
});

// ===== InkSpinner Tests =====

describe('InkSpinner', () => {
  it('should render with default dots style', () => {
    const spinner = new InkSpinner();
    const result = spinner.render('Loading...');
    expect(result).toContain('Loading...');
    expect(result).toContain('⠋'); // First dots frame
  });

  it('should cycle through frames', () => {
    const spinner = new InkSpinner();
    const frame1 = spinner.render('msg');
    const frame2 = spinner.render('msg');
    expect(frame1).not.toBe(frame2);
  });

  it('should support different styles', () => {
    const spinner = new InkSpinner('line');
    const result = spinner.render('msg');
    expect(result).toContain('-'); // First line frame
  });

  it('should change style', () => {
    const spinner = new InkSpinner('dots');
    spinner.setStyle('arrow');
    expect(spinner.getStyle()).toBe('arrow');
    const result = spinner.render('msg');
    expect(result).toContain('←'); // First arrow frame
  });

  it('should reset frame counter', () => {
    const spinner = new InkSpinner();
    spinner.render('msg');
    spinner.render('msg');
    spinner.reset();
    expect(spinner.currentFrame()).toBe('⠋'); // Back to first frame
  });

  it('should get current frame without incrementing', () => {
    const spinner = new InkSpinner();
    const frame1 = spinner.currentFrame();
    const frame2 = spinner.currentFrame();
    expect(frame1).toBe(frame2);
  });
});
