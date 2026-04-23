/**
 * SpinnerGlyph 组件单元测试
 *
 * 测试模式感知 Spinner 的核心逻辑：
 * - 三种模式配置（requesting/thinking/responding）
 * - 停滞颜色渐变（10s 黄色，20s 红色 + stalled 标记）
 * - 帧动画间隔
 * - 导出类型正确性
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FRAMES,
  MODE_CONFIG,
  getStallColor,
  getStallLabel,
  type SpinnerMode,
} from '../../src/ink-app/SpinnerGlyph.js';

// ===== Pure function tests (no React needed) =====

describe('SpinnerGlyph', () => {
  describe('MODE_CONFIG', () => {
    it('requesting mode should have 50ms interval', () => {
      expect(MODE_CONFIG.requesting.interval).toBe(50);
    });

    it('thinking mode should have 200ms interval', () => {
      expect(MODE_CONFIG.thinking.interval).toBe(200);
    });

    it('responding mode should have 100ms interval', () => {
      expect(MODE_CONFIG.responding.interval).toBe(100);
    });

    it('all modes should have labels', () => {
      const modes: SpinnerMode[] = ['requesting', 'thinking', 'responding'];
      for (const mode of modes) {
        expect(MODE_CONFIG[mode].label).toBeTruthy();
        expect(typeof MODE_CONFIG[mode].label).toBe('string');
      }
    });

    it('requesting should be fastest, thinking slowest', () => {
      expect(MODE_CONFIG.requesting.interval).toBeLessThan(MODE_CONFIG.responding.interval);
      expect(MODE_CONFIG.responding.interval).toBeLessThan(MODE_CONFIG.thinking.interval);
    });
  });

  describe('FRAMES', () => {
    it('should have 10 braille spinner frames', () => {
      expect(FRAMES).toHaveLength(10);
    });

    it('all frames should be single characters', () => {
      for (const frame of FRAMES) {
        expect(frame.length).toBe(1);
      }
    });
  });

  describe('getStallColor', () => {
    it('should return cyan for 0ms (no stall)', () => {
      expect(getStallColor(0)).toBe('cyan');
    });

    it('should return cyan for under 10 seconds', () => {
      expect(getStallColor(5_000)).toBe('cyan');
      expect(getStallColor(9_999)).toBe('cyan');
    });

    it('should return cyan at exactly 10 seconds (boundary)', () => {
      expect(getStallColor(10_000)).toBe('cyan');
    });

    it('should return yellow just over 10 seconds', () => {
      expect(getStallColor(10_001)).toBe('yellow');
    });

    it('should return yellow between 10 and 20 seconds', () => {
      expect(getStallColor(15_000)).toBe('yellow');
      expect(getStallColor(19_999)).toBe('yellow');
    });

    it('should return yellow at exactly 20 seconds (boundary)', () => {
      expect(getStallColor(20_000)).toBe('yellow');
    });

    it('should return red just over 20 seconds', () => {
      expect(getStallColor(20_001)).toBe('red');
    });

    it('should return red for very long stalls', () => {
      expect(getStallColor(60_000)).toBe('red');
      expect(getStallColor(120_000)).toBe('red');
    });
  });

  describe('getStallLabel', () => {
    it('should return empty string for 0ms', () => {
      expect(getStallLabel(0)).toBe('');
    });

    it('should return empty string under 10 seconds', () => {
      expect(getStallLabel(5_000)).toBe('');
    });

    it('should return empty string between 10 and 20 seconds', () => {
      // Requirement 10.2: only color change at 10s, no "(stalled)" label
      expect(getStallLabel(10_001)).toBe('');
      expect(getStallLabel(15_000)).toBe('');
      expect(getStallLabel(20_000)).toBe('');
    });

    it('should return " (stalled)" just over 20 seconds', () => {
      expect(getStallLabel(20_001)).toBe(' (stalled)');
    });

    it('should return " (stalled)" for very long stalls', () => {
      expect(getStallLabel(60_000)).toBe(' (stalled)');
    });
  });

  describe('SpinnerMode type', () => {
    it('should accept all three valid modes', () => {
      const modes: SpinnerMode[] = ['requesting', 'thinking', 'responding'];
      expect(modes).toHaveLength(3);
      // Verify each mode has a config entry
      for (const mode of modes) {
        expect(MODE_CONFIG[mode]).toBeDefined();
        expect(MODE_CONFIG[mode].interval).toBeGreaterThan(0);
      }
    });
  });

  describe('SpinnerGlyph React component', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should render with default props', async () => {
      const { render } = await import('ink-testing-library');
      const React = await import('react');
      const { SpinnerGlyph } = await import('../../src/ink-app/SpinnerGlyph.js');

      const { lastFrame } = render(React.createElement(SpinnerGlyph));
      const output = lastFrame();
      expect(output).toContain(FRAMES[0]);
      expect(output).toContain('Requesting...');
    });

    it('should render thinking mode label', async () => {
      const { render } = await import('ink-testing-library');
      const React = await import('react');
      const { SpinnerGlyph } = await import('../../src/ink-app/SpinnerGlyph.js');

      const { lastFrame } = render(
        React.createElement(SpinnerGlyph, { mode: 'thinking' as SpinnerMode }),
      );
      expect(lastFrame()).toContain('Thinking...');
    });

    it('should render responding mode label', async () => {
      const { render } = await import('ink-testing-library');
      const React = await import('react');
      const { SpinnerGlyph } = await import('../../src/ink-app/SpinnerGlyph.js');

      const { lastFrame } = render(
        React.createElement(SpinnerGlyph, { mode: 'responding' as SpinnerMode }),
      );
      expect(lastFrame()).toContain('Responding...');
    });

    it('should show stalled label when stallMs > 20000', async () => {
      const { render } = await import('ink-testing-library');
      const React = await import('react');
      const { SpinnerGlyph } = await import('../../src/ink-app/SpinnerGlyph.js');

      const { lastFrame } = render(
        React.createElement(SpinnerGlyph, { stallMs: 25_000 }),
      );
      expect(lastFrame()).toContain('(stalled)');
    });

    it('should NOT show stalled label when stallMs is between 10s and 20s', async () => {
      const { render } = await import('ink-testing-library');
      const React = await import('react');
      const { SpinnerGlyph } = await import('../../src/ink-app/SpinnerGlyph.js');

      const { lastFrame } = render(
        React.createElement(SpinnerGlyph, { stallMs: 15_000 }),
      );
      expect(lastFrame()).not.toContain('(stalled)');
    });

    it('should NOT show stalled label when stallMs is 0', async () => {
      const { render } = await import('ink-testing-library');
      const React = await import('react');
      const { SpinnerGlyph } = await import('../../src/ink-app/SpinnerGlyph.js');

      const { lastFrame } = render(
        React.createElement(SpinnerGlyph, { stallMs: 0 }),
      );
      expect(lastFrame()).not.toContain('(stalled)');
    });
  });
});
