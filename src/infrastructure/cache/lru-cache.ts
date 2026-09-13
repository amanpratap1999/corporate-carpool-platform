/**
 * In-Memory LRU Cache with TTL
 * Used to cache third-party API responses (Google Directions, Places)
 * to avoid redundant metered API billing and reduce latency.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LruCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxEntries: number;
  private defaultTtlMs: number;

  constructor(maxEntries: number = 500, defaultTtlSeconds: number = 300) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  public get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh LRU order: delete and re-insert
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  public set(key: string, value: T, ttlSeconds?: number): void {
    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;
    const expiresAt = Date.now() + ttlMs;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry (first key in iteration order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, expiresAt });
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
