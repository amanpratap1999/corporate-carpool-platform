/**
 * In-Memory Sliding Window Rate Limiter
 * Provides per-IP and per-User rate limiting to mitigate DoS and credential stuffing
 */

import { getDb } from '@/infrastructure/db/client';
import { sql } from 'drizzle-orm';

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

  /**
   * Distributed shared rate limiter backed by PostgreSQL.
   * Fails closed in staging and production if the shared database store is unavailable,
   * preventing cross-instance rate-limit evasion.
   * Falls back to in-memory sliding window only in local memory or test mode.
   */
  public async checkShared(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetSeconds: number; error?: string }> {
    const isLocalMemory =
      process.env.STORAGE_MODE === 'memory' ||
      process.env.NODE_ENV === 'test';

    const db = getDb();
    if (!db) {
      if (isLocalMemory) {
        return this.check(key, maxRequests, windowSeconds);
      }
      console.error('[RateLimiter] Database not initialized');
      // Strict security: Fail closed in production/staging when shared store is unreachable
      return {
        allowed: false,
        remaining: 0,
        resetSeconds: windowSeconds,
        error: 'Rate limiter unavailable (distributed store required)',
      };
    }

    try {
      const now = new Date();
      const resetAt = new Date(now.getTime() + windowSeconds * 1000);

      // Opportunistic pruning: clean expired records with 5% probability
      if (Math.random() < 0.05) {
        db.execute(sql`DELETE FROM rate_limits WHERE reset_at < ${new Date(now.getTime() - 3600 * 1000)}`).catch(() => {});
      }

      const result: any = await db.execute(sql`
        INSERT INTO rate_limits (key, count, reset_at, updated_at)
        VALUES (${key}, 1, ${resetAt}, ${now})
        ON CONFLICT (key) DO UPDATE
        SET
          count = CASE WHEN rate_limits.reset_at <= ${now} THEN 1 ELSE rate_limits.count + 1 END,
          reset_at = CASE WHEN rate_limits.reset_at <= ${now} THEN ${resetAt} ELSE rate_limits.reset_at END,
          updated_at = ${now}
        RETURNING count, GREATEST(1, EXTRACT(EPOCH FROM (reset_at - ${now})))::integer AS reset_seconds
      `);

      const rows = result?.rows || (Array.isArray(result) ? result : []);
      const row = rows[0];
      if (!row) {
        console.error('[RateLimiter] Query returned empty row for key:', key);
        if (isLocalMemory) return this.check(key, maxRequests, windowSeconds);
        return {
          allowed: false,
          remaining: 0,
          resetSeconds: windowSeconds,
          error: 'Rate limiter query returned empty row',
        };
      }

      const count = Number(row.count);
      const resetSec = Number(row.reset_seconds) || windowSeconds;

      if (count > maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetSeconds: Math.max(1, resetSec),
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - count),
        resetSeconds: Math.max(1, resetSec),
      };
    } catch (err) {
      console.error('[RateLimiter] Database query failed:', err);
      if (isLocalMemory) {
        return this.check(key, maxRequests, windowSeconds);
      }
      // Fail closed in production
      return {
        allowed: false,
        remaining: 0,
        resetSeconds: windowSeconds,
        error: 'Rate limiter database query failed',
      };
    }
  }

  /**
   * Explicit maintenance job to prune stale rate limit buckets.
   */
  public async pruneExpiredSharedEntries(): Promise<number> {
    const db = getDb();
    if (!db) return 0;
    try {
      const res: any = await db.execute(sql`DELETE FROM rate_limits WHERE reset_at < NOW() RETURNING key`);
      const rows = res?.rows || (Array.isArray(res) ? res : []);
      return rows.length;
    } catch {
      return 0;
    }
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
