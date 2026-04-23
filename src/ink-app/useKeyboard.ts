/**
 * 统一键盘事件分发 Hook
 *
 * 需求 16：键盘快捷键
 *
 * - Ctrl+L 清屏并重新渲染
 * - Ctrl+R 进入历史搜索模式
 * - Ctrl+C 中止/退出
 * - 根据焦点状态路由键盘事件（PermissionDialog 优先）
 *
 * 导出纯函数用于测试：routeKeyEvent, isModifierKey
 */

import { useCallback } from 'react';
import { useInput } from 'ink';

/** 焦点状态 */
export interface FocusState {
  /** PermissionDialog 是否处于活跃状态 */
  permissionDialogActive: boolean;
  /** 是否正在处理中 */
  isProcessing: boolean;
}

/** Ink Key 对象的简化类型（匹配 ink 的 Key 接口） */
export interface KeyInfo {
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  escape: boolean;
  return: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
}

/** 路由结果：指示哪个处理器应该处理该事件 */
export type KeyRoute =
  | 'clear-screen'
  | 'search-toggle'
  | 'abort'
  | 'exit'
  | 'permission-dialog'
  | 'prompt-input'
  | 'none';

/**
 * 判断是否为修饰键组合。
 *
 * @param input - 用户输入字符
 * @param key - Ink Key 对象
 * @returns 是否为 Ctrl/Meta 修饰键组合
 */
export function isModifierKey(input: string, key: Pick<KeyInfo, 'ctrl' | 'meta'>): boolean {
  return key.ctrl || key.meta;
}

/**
 * 根据输入和焦点状态路由键盘事件到正确的处理器。
 *
 * 需求 16.3：通过 useInput 统一管理键盘事件分发
 * 需求 16.4：PermissionDialog 活跃时优先路由到 PermissionDialog
 *
 * @param input - 用户输入字符
 * @param key - Ink Key 对象（部分字段）
 * @param focusState - 当前焦点状态
 * @returns 路由目标处理器名称
 */
export function routeKeyEvent(
  input: string,
  key: Pick<KeyInfo, 'ctrl'>,
  focusState: FocusState,
): KeyRoute {
  // Ctrl+L always clears screen regardless of focus state
  if (key.ctrl && input === 'l') {
    return 'clear-screen';
  }

  // Ctrl+F toggles search mode (需求 18.1)
  if (key.ctrl && input === 'f') {
    return 'search-toggle';
  }

  // Ctrl+C: abort if processing, otherwise exit flow
  if (key.ctrl && input === 'c') {
    if (focusState.isProcessing) {
      return 'abort';
    }
    return 'exit';
  }

  // When PermissionDialog is active, route all other keys to it
  if (focusState.permissionDialogActive) {
    return 'permission-dialog';
  }

  // Default: route to prompt input
  return 'prompt-input';
}

/**
 * 清除终端屏幕。
 *
 * 需求 16.1：Ctrl+L 清除终端屏幕并重新渲染当前界面
 *
 * 使用 ANSI 转义序列：
 * - \x1b[2J 清除整个屏幕
 * - \x1b[H  将光标移到左上角
 */
export function clearScreen(stdout: { write: (s: string) => boolean }): void {
  stdout.write('\x1b[2J\x1b[H');
}

/** useKeyboard hook 的配置选项 */
export interface UseKeyboardOptions {
  /** 焦点状态 */
  focusState: FocusState;
  /** 中止当前操作的回调 */
  onAbort: () => void;
  /** 退出应用的回调（Ctrl+C 双击） */
  onExit: () => void;
  /** 切换搜索模式的回调（Ctrl+F） */
  onSearchToggle?: () => void;
  /** stdout 引用，用于清屏 */
  stdout?: { write: (s: string) => boolean };
}

/**
 * 统一键盘事件分发 Hook。
 *
 * 需求 16.3：通过 Ink 的 useInput Hook 统一管理键盘事件分发
 *
 * 处理全局快捷键（Ctrl+L 清屏、Ctrl+C 中止/退出），
 * 其余键盘事件根据焦点状态路由到 PermissionDialog 或 PromptInput。
 */
export function useKeyboard(options: UseKeyboardOptions): void {
  const { focusState, onAbort, onExit, onSearchToggle, stdout = process.stdout } = options;

  const handleInput = useCallback(
    (input: string, key: { ctrl: boolean }) => {
      const route = routeKeyEvent(input, key, focusState);

      switch (route) {
        case 'clear-screen':
          clearScreen(stdout);
          break;
        case 'search-toggle':
          onSearchToggle?.();
          break;
        case 'abort':
          onAbort();
          break;
        case 'exit':
          onExit();
          break;
        // 'permission-dialog' and 'prompt-input' are handled by their own useInput hooks
        // via Ink's isActive prop — this hook only handles global shortcuts
        default:
          break;
      }
    },
    [focusState, onAbort, onExit, onSearchToggle, stdout],
  );

  useInput(handleInput);
}
