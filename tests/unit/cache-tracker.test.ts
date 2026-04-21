/**
 * CacheTracker 单元测试
 *
 * 测试缓存命中率计算、连续低命中率检测和统计摘要。
 */

import { describe, it, expect } from 'vitest';
import { CacheTracker } from '../../src/cache-tracker.js';

describe('CacheTracker', () => {
  describe('getCacheHitRate', () => {
    it('should return 0 for empty history', () => {
      const tracker = new CacheTracker();
      expect(tracker.getCacheHitRate()).toBe(0);
    });

    it('should calculate hit rate from last entry', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 200,
        inputTokens: 1000,
      });
      // hitRate = 800 / (800 + 200) * 100 = 80%
      expect(tracker.getCacheHitRate()).toBe(80);
    });

    it('should return 0 when no cache tokens', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        inputTokens: 1000,
      });
      expect(tracker.getCacheHitRate()).toBe(0);
    });

    it('should use last entry only', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 900,
        inputTokens: 1000,
      });
      tracker.trackUsage({
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 100,
        inputTokens: 1000,
      });
      // Should use last entry: 900 / (900 + 100) = 90%
      expect(tracker.getCacheHitRate()).toBe(90);
    });

    it('should handle missing optional fields', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({});
      expect(tracker.getCacheHitRate()).toBe(0);
    });
  });

  describe('isBreaking', () => {
    it('should return false with fewer than 3 entries', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 90 });
      tracker.trackUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 90 });
      expect(tracker.isBreaking()).toBe(false);
    });

    it('should return true after 3 consecutive low hit rates', () => {
      const tracker = new CacheTracker();
      // 3 entries all below 50%
      tracker.trackUsage({ cache_read_input_tokens: 20, cache_creation_input_tokens: 80 }); // 20%
      tracker.trackUsage({ cache_read_input_tokens: 30, cache_creation_input_tokens: 70 }); // 30%
      tracker.trackUsage({ cache_read_input_tokens: 40, cache_creation_input_tokens: 60 }); // 40%
      expect(tracker.isBreaking()).toBe(true);
    });

    it('should return false if any of last 3 is above 50%', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({ cache_read_input_tokens: 20, cache_creation_input_tokens: 80 }); // 20%
      tracker.trackUsage({ cache_read_input_tokens: 60, cache_creation_input_tokens: 40 }); // 60% — above threshold
      tracker.trackUsage({ cache_read_input_tokens: 30, cache_creation_input_tokens: 70 }); // 30%
      expect(tracker.isBreaking()).toBe(false);
    });

    it('should only consider last 3 entries', () => {
      const tracker = new CacheTracker();
      // First 2 are low, then 1 high, then 3 low
      tracker.trackUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 90 });
      tracker.trackUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 90 });
      tracker.trackUsage({ cache_read_input_tokens: 80, cache_creation_input_tokens: 20 }); // high
      tracker.trackUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 90 });
      tracker.trackUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 90 });
      tracker.trackUsage({ cache_read_input_tokens: 10, cache_creation_input_tokens: 90 });
      expect(tracker.isBreaking()).toBe(true);
    });

    it('should return false when cache tokens are zero', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
      tracker.trackUsage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
      tracker.trackUsage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
      // total is 0, so condition (total > 0) fails — not breaking
      expect(tracker.isBreaking()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return zeros for empty history', () => {
      const tracker = new CacheTracker();
      const stats = tracker.getStats();
      expect(stats.hitRate).toBe(0);
      expect(stats.totalCached).toBe(0);
      expect(stats.totalCreated).toBe(0);
    });

    it('should accumulate totals across all entries', () => {
      const tracker = new CacheTracker();
      tracker.trackUsage({ cache_read_input_tokens: 100, cache_creation_input_tokens: 50 });
      tracker.trackUsage({ cache_read_input_tokens: 200, cache_creation_input_tokens: 30 });
      tracker.trackUsage({ cache_read_input_tokens: 300, cache_creation_input_tokens: 20 });

      const stats = tracker.getStats();
      expect(stats.totalCached).toBe(600); // 100 + 200 + 300
      expect(stats.totalCreated).toBe(100); // 50 + 30 + 20
      // hitRate is from last entry: 300 / (300 + 20) ≈ 94%
      expect(stats.hitRate).toBe(94);
    });
  });
});
