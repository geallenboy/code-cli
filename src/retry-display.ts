/**
 * 重试进度显示
 *
 * 在临时 API 错误（HTTP 429/503）期间显示重试进度和倒计时。
 *
 * 功能：
 * - formatRetryProgress(): 显示 "重试中 (N/M)..." 格式的进度消息
 * - formatRetryExhausted(): 显示所有重试用尽后的错误消息
 * - 倒计时显示：在等待期间更新剩余时间
 */

import chalk from 'chalk';

/** 重试进度选项 */
export interface RetryProgressOptions {
  /** 当前尝试次数（1-based） */
  currentAttempt: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 等待时间（毫秒） */
  waitMs: number;
}

/**
 * 格式化重试进度消息
 *
 * @param options - 重试进度选项
 * @returns 格式化的进度消息
 */
export function formatRetryProgress(options: RetryProgressOptions): string {
  const { currentAttempt, maxRetries, waitMs } = options;
  const waitSec = (waitMs / 1000).toFixed(1);
  return chalk.yellow(
    `⟳ Retrying (${currentAttempt}/${maxRetries})... waiting ${waitSec}s`,
  );
}

/**
 * 格式化倒计时消息
 *
 * @param currentAttempt - 当前尝试次数
 * @param maxRetries - 最大重试次数
 * @param remainingMs - 剩余等待时间（毫秒）
 * @returns 格式化的倒计时消息
 */
export function formatRetryCountdown(
  currentAttempt: number,
  maxRetries: number,
  remainingMs: number,
): string {
  const remainingSec = Math.ceil(remainingMs / 1000);
  return chalk.yellow(
    `⟳ Retrying (${currentAttempt}/${maxRetries})... ${remainingSec}s remaining`,
  );
}

/**
 * 格式化重试用尽消息
 *
 * @param maxRetries - 最大重试次数
 * @param errorMessage - 错误消息
 * @returns 格式化的错误消息
 */
export function formatRetryExhausted(maxRetries: number, errorMessage: string): string {
  return chalk.red(
    `✗ All ${maxRetries} retry attempts exhausted. Error: ${errorMessage}`,
  );
}
