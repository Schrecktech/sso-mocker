import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAdapter } from '../../src/store/memory.js';

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    MemoryAdapter.flushAll();
    adapter = new MemoryAdapter('Session');
  });

  it('upserts and finds by id', async () => {
    await adapter.upsert('abc', { data: 'hello' }, 3600);
    const found = await adapter.find('abc');
    expect(found).toEqual({ data: 'hello' });
  });
  it('returns undefined for non-existent id', async () => {
    const found = await adapter.find('nonexistent');
    expect(found).toBeUndefined();
  });
  it('destroys by id', async () => {
    await adapter.upsert('abc', { data: 'hello' }, 3600);
    await adapter.destroy('abc');
    expect(await adapter.find('abc')).toBeUndefined();
  });
  it('consumes marks entry as consumed', async () => {
    await adapter.upsert('abc', { data: 'hello' }, 3600);
    await adapter.consume('abc');
    const found = await adapter.find('abc');
    expect(found).toHaveProperty('consumed');
  });
  it('respects TTL expiration', async () => {
    vi.useFakeTimers();
    adapter = new MemoryAdapter('Session');
    await adapter.upsert('abc', { data: 'hello' }, 1);
    vi.advanceTimersByTime(2000);
    expect(await adapter.find('abc')).toBeUndefined();
    vi.useRealTimers();
  });
  it('flushAll clears all entries', async () => {
    await adapter.upsert('a', { x: 1 }, 3600);
    await adapter.upsert('b', { x: 2 }, 3600);
    MemoryAdapter.flushAll();
    expect(await adapter.find('a')).toBeUndefined();
    expect(await adapter.find('b')).toBeUndefined();
  });
});
