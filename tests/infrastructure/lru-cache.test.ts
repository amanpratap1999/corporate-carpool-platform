import { describe, it, expect } from 'vitest';
import { LruCache } from '../../src/infrastructure/cache/lru-cache';

describe('In-Memory LRU Cache', () => {
  it('stores and retrieves cached items', () => {
    const cache = new LruCache<string>(3, 60);
    cache.set('a', 'apple');
    cache.set('b', 'banana');

    expect(cache.get('a')).toBe('apple');
    expect(cache.get('b')).toBe('banana');
    expect(cache.get('c')).toBeUndefined();
  });

  it('evicts least recently used item when max capacity is reached', () => {
    const cache = new LruCache<number>(3, 60);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' so 'b' becomes the oldest
    cache.get('a');

    // Add 'd', which should evict 'b'
    cache.set('d', 4);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('expires items past TTL', async () => {
    // 0.05 second TTL
    const cache = new LruCache<string>(5, 0.05);
    cache.set('temp', 'val');
    expect(cache.get('temp')).toBe('val');

    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('temp')).toBeUndefined();
  });
});
