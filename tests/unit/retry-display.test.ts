/**
 * 重试进度显示单元测试与属性测试
 *
 * 测试 formatRetryProgress 和 formatRetryExhausted 的核心逻辑：
 * - 进度消息格式
 * - 倒计时显示
 * - 错误消息格式
 *
 * 属性测试：
 * - 属性 6：重试格式
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  formatRetryProgress,
  formatRetryExhausted,
  formatRetryCountdown,
} from '../../src/retry-display.js';

/**
 * Helper: strip all ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ===== Unit Tests =====

describe('formatRetryProgress', () => {
  it('should show attempt count in (N/M) format', () => {
    const result = formatRetryProgress({
      currentAttempt: 1,
      maxRetries: 3,
      waitMs: 1000,
    });
    const stripped = stripAnsi(result);
    expect(stripped).toContain('(1/3)');
  });

  it('should show wait time in seconds', () => {
    const result = formatRetryProgress({
      currentAttempt: 1,
      maxRetries: 3,
      waitMs: 2500,
    });
    const stripped = stripAnsi(result);
    expect(stripped).toContain('2.5s');
  });

  it('should include retry indicator', () => {
    const result = formatRetryProgress({
      currentAttempt: 2,
      maxRetries: 5,
      waitMs: 1000,
    });
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Retrying');
  });

  it('should show correct format for last attempt', () => {
    const result = formatRetryProgress({
      currentAttempt: 3,
      maxRetries: 3,
      waitMs: 5000,
    });
    const stripped = stripAnsi(result);
    expect(stripped).toContain('(3/3)');
    expect(stripped).toContain('5.0s');
  });
});

describe('formatRetryCountdown', () => {
  it('should show remaining time in seconds', () => {
    const result = formatRetryCountdown(1, 3, 5000);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('5s remaining');
  });

  it('should ceil remaining time', () => {
    const result = formatRetryCountdown(1, 3, 1500);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('2s remaining');
  });

  it('should show attempt count', () => {
    const result = formatRetryCountdown(2, 4, 3000);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('(2/4)');
  });
});

describe('formatRetryExhausted', () => {
  it('should show total retry count', () => {
    const result = formatRetryExhausted(3, 'Rate limited');
    const stripped = stripAnsi(result);
    expect(stripped).toContain('3');
  });

  it('should show error message', () => {
    const result = formatRetryExhausted(3, 'Service unavailable');
    const stripped = stripAnsi(result);
    expect(stripped).toContain('Service unavailable');
  });

  it('should indicate exhaustion', () => {
    const result = formatRetryExhausted(5, 'error');
    const stripped = stripAnsi(result);
    expect(stripped).toContain('exhausted');
  });
});

// ===== Property Tests =====

describe('Property 6: Retry progress format', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any current attempt N (1 ≤ N ≤ M) and max retries M,
   * the retry progress message should contain a string of format "(N/M)"
   * where N and M are both positive integers.
   */
  it('retry progress contains (N/M) format with positive integers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 100, max: 60000 }),
        (maxRetries, attemptOffset, waitMs) => {
          // Ensure currentAttempt is between 1 and maxRetries
          const currentAttempt = Math.min(attemptOffset, maxRetries);

          const result = formatRetryProgress({
            currentAttempt,
            maxRetries,
            waitMs,
          });
          const stripped = stripAnsi(result);

          // Should contain (N/M) format
          const pattern = `(${currentAttempt}/${maxRetries})`;
          if (!stripped.includes(pattern)) return false;

          // N and M should be positive integers
          if (currentAttempt < 1 || maxRetries < 1) return false;

          // N should be <= M
          if (currentAttempt > maxRetries) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.3**
   *
   * For any max retries and error message, the exhausted message
   * should contain the retry count and error message.
   */
  it('retry exhausted message contains retry count and error', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.stringMatching(/^[a-zA-Z0-9 .,!?_:;()-]+$/).filter((s) => s.length > 0 && s.length <= 100),
        (maxRetries, errorMessage) => {
          const result = formatRetryExhausted(maxRetries, errorMessage);
          const stripped = stripAnsi(result);

          // Should contain the max retries count
          if (!stripped.includes(String(maxRetries))) return false;

          // Should contain the error message
          if (!stripped.includes(errorMessage)) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
