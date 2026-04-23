/**
 * 键盘快捷键 — useKeyboard 纯函数单元测试
 *
 * 需求 16：键盘快捷键
 * - Ctrl+L 清屏
 * - 统一键盘事件分发
 * - PermissionDialog 活跃时优先路由
 */

import { describe, it, expect, vi } from 'vitest';
import {
  routeKeyEvent,
  clearScreen,
  isModifierKey,
  type FocusState,
} from '../../src/ink-app/useKeyboard.js';

// ===== routeKeyEvent Tests =====

describe('routeKeyEvent', () => {
  const idle: FocusState = { permissionDialogActive: false, isProcessing: false };
  const processing: FocusState = { permissionDialogActive: false, isProcessing: true };
  const dialogActive: FocusState = { permissionDialogActive: true, isProcessing: false };
  const dialogAndProcessing: FocusState = { permissionDialogActive: true, isProcessing: true };

  describe('Ctrl+L clear screen', () => {
    it('should route Ctrl+L to clear-screen when idle', () => {
      expect(routeKeyEvent('l', { ctrl: true }, idle)).toBe('clear-screen');
    });

    it('should route Ctrl+L to clear-screen when processing', () => {
      expect(routeKeyEvent('l', { ctrl: true }, processing)).toBe('clear-screen');
    });

    it('should route Ctrl+L to clear-screen when PermissionDialog is active', () => {
      expect(routeKeyEvent('l', { ctrl: true }, dialogActive)).toBe('clear-screen');
    });

    it('should route Ctrl+L to clear-screen when both dialog active and processing', () => {
      expect(routeKeyEvent('l', { ctrl: true }, dialogAndProcessing)).toBe('clear-screen');
    });
  });

  describe('Ctrl+C abort/exit', () => {
    it('should route Ctrl+C to abort when processing', () => {
      expect(routeKeyEvent('c', { ctrl: true }, processing)).toBe('abort');
    });

    it('should route Ctrl+C to exit when idle', () => {
      expect(routeKeyEvent('c', { ctrl: true }, idle)).toBe('exit');
    });
  });

  describe('PermissionDialog focus routing', () => {
    it('should route regular keys to permission-dialog when dialog is active', () => {
      expect(routeKeyEvent('y', { ctrl: false }, dialogActive)).toBe('permission-dialog');
    });

    it('should route regular keys to permission-dialog for n key', () => {
      expect(routeKeyEvent('n', { ctrl: false }, dialogActive)).toBe('permission-dialog');
    });

    it('should route regular keys to permission-dialog for a key', () => {
      expect(routeKeyEvent('a', { ctrl: false }, dialogActive)).toBe('permission-dialog');
    });
  });

  describe('default routing to prompt-input', () => {
    it('should route regular keys to prompt-input when idle', () => {
      expect(routeKeyEvent('h', { ctrl: false }, idle)).toBe('prompt-input');
    });

    it('should route regular keys to prompt-input when processing (no dialog)', () => {
      expect(routeKeyEvent('x', { ctrl: false }, processing)).toBe('prompt-input');
    });
  });
});

// ===== clearScreen Tests =====

describe('clearScreen', () => {
  it('should write ANSI clear sequence to stdout', () => {
    const mockStdout = { write: vi.fn().mockReturnValue(true) };
    clearScreen(mockStdout);
    expect(mockStdout.write).toHaveBeenCalledOnce();
    expect(mockStdout.write).toHaveBeenCalledWith('\x1b[2J\x1b[H');
  });
});

// ===== isModifierKey Tests =====

describe('isModifierKey', () => {
  it('should return true for ctrl key', () => {
    expect(isModifierKey('l', { ctrl: true, meta: false })).toBe(true);
  });

  it('should return true for meta key', () => {
    expect(isModifierKey('l', { ctrl: false, meta: true })).toBe(true);
  });

  it('should return false for regular key', () => {
    expect(isModifierKey('l', { ctrl: false, meta: false })).toBe(false);
  });
});
