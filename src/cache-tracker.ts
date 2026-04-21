/**
 * Prompt Cache Tracker — 缓存命中率追踪
 *
 * 被动追踪 API 响应中的 cache_read_input_tokens 和 cache_creation_input_tokens，
 * 计算命中率，连续 3 次低于 50% 时发出警告。
 *
 * 关键原则：CacheTracker 是被动的 — 只追踪，不修改行为。
 */

/** 单次 API 调用的缓存使用记录 */
interface CacheEntry {
  cacheRead: number;
  cacheCreation: number;
  total: number;
}

/** API 使用量输入（来自 API 响应） */
export interface CacheUsageInput {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  inputTokens?: number;
}

/** 缓存统计摘要 */
export interface CacheStats {
  hitRate: number;
  totalCached: number;
  totalCreated: number;
}

/**
 * 追踪 Prompt Cache 命中率。
 *
 * 记录每次 API 调用的缓存读取和创建 token 数，
 * 提供命中率计算和连续低命中率检测。
 */
export class CacheTracker {
  private history: CacheEntry[] = [];

  /**
   * 记录一次 API 调用的缓存使用量。
   *
   * @param usage - API 响应中的缓存相关字段
   */
  trackUsage(usage: CacheUsageInput): void {
    this.history.push({
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheCreation: usage.cache_creation_input_tokens ?? 0,
      total: usage.inputTokens ?? 0,
    });
  }

  /**
   * 获取最近一次 API 调用的缓存命中率（0-100）。
   *
   * 命中率 = cacheRead / (cacheRead + cacheCreation) * 100
   * 无历史记录时返回 0。
   */
  getCacheHitRate(): number {
    if (this.history.length === 0) return 0;
    const last = this.history[this.history.length - 1];
    const cached = last.cacheRead;
    const total = last.cacheRead + last.cacheCreation;
    return total > 0 ? Math.round((cached / total) * 100) : 0;
  }

  /**
   * 检测是否连续 3 次缓存命中率低于 50%。
   *
   * 用于触发缓存断裂警告。
   */
  isBreaking(): boolean {
    if (this.history.length < 3) return false;
    const recent = this.history.slice(-3);
    return recent.every((h) => {
      const total = h.cacheRead + h.cacheCreation;
      return total > 0 && (h.cacheRead / total) < 0.5;
    });
  }

  /**
   * 获取缓存统计摘要。
   *
   * @returns 命中率 + 累计缓存读取/创建 token 数
   */
  getStats(): CacheStats {
    const totals = this.history.reduce(
      (acc, h) => ({
        cached: acc.cached + h.cacheRead,
        created: acc.created + h.cacheCreation,
      }),
      { cached: 0, created: 0 },
    );
    return {
      hitRate: this.getCacheHitRate(),
      totalCached: totals.cached,
      totalCreated: totals.created,
    };
  }
}
