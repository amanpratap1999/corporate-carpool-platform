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
});
