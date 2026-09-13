import { describe, it, expect } from 'vitest';
import { rateLimiter } from '../../src/infrastructure/security/rate-limiter';

describe('Gate 1: Sliding Window Rate Limiter Tests', () => {
  it('allows requests within the configured threshold and denies over limit', () => {
    const key = `test-ip-${Date.now()}`;
    const limit = 3;
    const windowSeconds = 2;

    const r1 = rateLimiter.check(key, limit, windowSeconds);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimiter.check(key, limit, windowSeconds);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimiter.check(key, limit, windowSeconds);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request exceeds limit
    const r4 = rateLimiter.check(key, limit, windowSeconds);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.resetSeconds).toBeGreaterThanOrEqual(1);
  });

  it('resets allowed count after sliding window expires', async () => {
    const key = `test-reset-${Date.now()}`;
    const limit = 2;
    const windowSeconds = 1;

    expect(rateLimiter.check(key, limit, windowSeconds).allowed).toBe(true);
    expect(rateLimiter.check(key, limit, windowSeconds).allowed).toBe(true);
    expect(rateLimiter.check(key, limit, windowSeconds).allowed).toBe(false);

    // Wait for window expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const rAfter = rateLimiter.check(key, limit, windowSeconds);
    expect(rAfter.allowed).toBe(true);
    expect(rAfter.remaining).toBe(1);
  });

  it('handles concurrent check requests deterministically', async () => {
    const key = `test-concurrent-${Date.now()}`;
    const limit = 5;
    const windowSeconds = 10;

    // Fire 10 simultaneous requests
    const promises = Array.from({ length: 10 }, () =>
      rateLimiter.check(key, limit, windowSeconds)
    );
    const results = await Promise.all(promises);

    const allowedCount = results.filter((r) => r.allowed).length;
    const deniedCount = results.filter((r) => !r.allowed).length;

    expect(allowedCount).toBe(5);
    expect(deniedCount).toBe(5);
  });

  it('fails closed in production if shared database is not available', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origStorage = process.env.STORAGE_MODE;
    const origDb = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.STORAGE_MODE;
      delete process.env.DATABASE_URL;

      const res = await rateLimiter.checkShared('test-prod-key', 5, 60);
      expect(res.allowed).toBe(false);
      expect(res.error).toBeDefined();
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origStorage) process.env.STORAGE_MODE = origStorage;
      if (origDb) process.env.DATABASE_URL = origDb;
    }
  });
});
