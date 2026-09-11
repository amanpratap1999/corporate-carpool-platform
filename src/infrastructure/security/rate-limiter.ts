/**
 * In-Memory Sliding Window Rate Limiter
 * Provides per-IP and per-User rate limiting to mitigate DoS and credential stuffing
 */

interface RateLimitEntry {
  timestamps: number[];
}

class InMemoryRateLimiter {
  private cache: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Periodically prune stale buckets every 5 minutes
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.prune(), 5 * 60 * 1000);
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  public check(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): { allowed: boolean; remaining: number; resetSeconds: number } {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    let entry = this.cache.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.cache.set(key, entry);
    }

    // Filter out timestamps older than current window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const resetSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetSeconds: Math.max(1, resetSeconds),
      };
    }

    // Record this request
    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: maxRequests - entry.timestamps.length,
      resetSeconds: windowSeconds,
    };
  }

  public clear(): void {
    this.cache.clear();
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      // If no activity in 10 minutes, remove
      if (
        entry.timestamps.length === 0 ||
        now - entry.timestamps[entry.timestamps.length - 1] > 10 * 60 * 1000
      ) {
        this.cache.delete(key);
      }
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();
