import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySaveBackend, LocalStorageSaveBackend } from './save.js';

describe('MemorySaveBackend', () => {
  it('round-trips a value and misses unknown keys', async () => {
    const b = new MemorySaveBackend();
    expect(await b.get('nope')).toBeNull();
    await b.set('k', 'v');
    expect(await b.get('k')).toBe('v');
  });
});

describe('LocalStorageSaveBackend', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
  });

  it('round-trips through localStorage under a namespaced key', async () => {
    const b = new LocalStorageSaveBackend();
    await b.set('bindings', '{"a":1}');
    expect(store.has('retroline:bindings')).toBe(true);
    expect(await b.get('bindings')).toBe('{"a":1}');
  });

  it('misses unknown keys as null', async () => {
    const b = new LocalStorageSaveBackend();
    expect(await b.get('missing')).toBeNull();
  });
});
