/**
 * 模式感知 Spinner 组件
 *
 * 三种模式：requesting（50ms/帧快速闪烁）、thinking（200ms/帧慢速闪烁）、responding（100ms/帧旋转字符）
 * 停滞检测：10s 黄色渐变，20s 红色 + "(stalled)" 标记
 *
 * stallMs 由父组件传入，父组件在收到 StreamEvent text 事件时重置计时器（需求 10.4）。
 * 使用 setInterval + cleanup 作为动画帧调度等效机制（需求 10.5），
 * 确保组件卸载时清理定时器，避免多实例泄漏。
 */

import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

export type SpinnerMode = 'requesting' | 'thinking' | 'responding';

export const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const MODE_CONFIG: Record<SpinnerMode, { interval: number; label: string }> = {
  requesting: { interval: 50, label: 'Requesting...' },
  thinking: { interval: 200, label: 'Thinking...' },
  responding: { interval: 100, label: 'Responding...' },
};

export interface SpinnerGlyphProps {
  mode?: SpinnerMode;
  /** Milliseconds since last token received. Parent resets on StreamEvent text arrival. */
  stallMs?: number;
}

/**
 * Compute display color based on stall duration.
 * - 0–10s: theme color (cyan)
 * - 10–20s: yellow (warning)
 * - 20s+: red (stalled)
 */
export function getStallColor(stallMs: number): string {
  if (stallMs > 20_000) return 'red';
  if (stallMs > 10_000) return 'yellow';
  return 'cyan';
}

/**
 * Determine whether to show the "(stalled)" label.
 * Only shown when stallMs exceeds 20 seconds.
 */
export function getStallLabel(stallMs: number): string {
  return stallMs > 20_000 ? ' (stalled)' : '';
}

export function SpinnerGlyph({ mode = 'requesting', stallMs = 0 }: SpinnerGlyphProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const config = MODE_CONFIG[mode];

  // Animation frame scheduling via setInterval with proper cleanup (requirement 10.5)
  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % FRAMES.length);
    }, config.interval);
    return () => clearInterval(timer);
  }, [config.interval]);

  const frame = FRAMES[frameIndex];
  const color = getStallColor(stallMs);
  const stallLabel = getStallLabel(stallMs);

  return (
    <Text color={color}>{frame} {config.label}{stallLabel}</Text>
  );
}
