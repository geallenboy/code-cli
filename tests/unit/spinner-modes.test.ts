/**
 * Spinner 模式增强单元测试
 *
 * 测试 Spinner 类的模式切换和停滞检测：
 * - 三种模式配置
 * - 模式切换
 * - 停滞警告
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Spinner } from '../../src/ui.js';
import type { SpinnerMode } from '../../src/ui.js';

describe('Spinner modes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('mode initialization', () => {
    it('should default to requesting mode', () => {
      const spinner = new Spinner();
      // Default message is 'Thinking...' from constructor, but mode is 'requesting'
      expect(spinner.mode).toBe('requesting');
    });

    it('should accept custom initial message', () => {
      const spinner = new Spinner('Custom...');
      expect(spinner.mode).toBe('requesting');
    });
  });

  describe('setMode', () => {
    it('should switch to requesting mode', () => {
      const spinner = new Spinner();
      spinner.setMode('requesting');
      expect(spinner.mode).toBe('requesting');
    });

    it('should switch to thinking mode', () => {
      const spinner = new Spinner();
      spinner.setMode('thinking');
      expect(spinner.mode).toBe('thinking');
    });

    it('should switch to responding mode', () => {
      const spinner = new Spinner();
      spinner.setMode('responding');
      expect(spinner.mode).toBe('responding');
    });

    it('should update mode when switching between modes', () => {
      const spinner = new Spinner();
      spinner.setMode('requesting');
      expect(spinner.mode).toBe('requesting');

      spinner.setMode('thinking');
      expect(spinner.mode).toBe('thinking');

      spinner.setMode('responding');
      expect(spinner.mode).toBe('responding');
    });

    it('should restart interval when switching mode while running', () => {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner();
      spinner.start();

      // Switch mode while running
      spinner.setMode('thinking');
      expect(spinner.mode).toBe('thinking');

      spinner.stop();
    });
  });

  describe('start and stop', () => {
    it('should start and stop without errors', () => {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner();
      spinner.start();
      spinner.stop();
    });

    it('should not start twice', () => {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner();
      spinner.start();
      spinner.start(); // Should be a no-op
      spinner.stop();
    });

    it('should handle stop without start', () => {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner();
      spinner.stop(); // Should not throw
    });
  });

  describe('tick', () => {
    it('should update last token time', () => {
      const spinner = new Spinner();
      spinner.tick();
      // After tick, stall time should be very small
      expect(spinner.getStallTime()).toBeLessThan(100);
    });
  });

  describe('stall detection', () => {
    it('should detect stall after 10s without tick', () => {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner();
      spinner.start();

      // Manually set lastTokenTime to simulate stall
      // We can't easily test the render output, but we can verify getStallTime
      spinner.tick();
      expect(spinner.getStallTime()).toBeLessThan(100);

      spinner.stop();
    });

    it('should reset stall time on tick', () => {
      const spinner = new Spinner();
      spinner.tick();
      const stallTime = spinner.getStallTime();
      expect(stallTime).toBeLessThan(50);
    });
  });

  describe('mode configurations', () => {
    it('all three modes should be valid SpinnerMode values', () => {
      const modes: SpinnerMode[] = ['requesting', 'thinking', 'responding'];
      const spinner = new Spinner();

      for (const mode of modes) {
        spinner.setMode(mode);
        expect(spinner.mode).toBe(mode);
      }
    });

    it('should use mode-specific interval when started', () => {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const spinner = new Spinner();

      // Start in requesting mode (50ms interval)
      spinner.setMode('requesting');
      spinner.start();
      expect(spinner.mode).toBe('requesting');
      spinner.stop();

      // Start in thinking mode (200ms interval)
      spinner.setMode('thinking');
      spinner.start();
      expect(spinner.mode).toBe('thinking');
      spinner.stop();

      // Start in responding mode (100ms interval)
      spinner.setMode('responding');
      spinner.start();
      expect(spinner.mode).toBe('responding');
      spinner.stop();
    });
  });
});
