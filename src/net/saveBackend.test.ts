import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase.js', () => ({ supabase: null, ensureAnonSession: vi.fn() }));
vi.mock('./SupabaseBackend.js', () => ({ SupabaseBackend: class {} }));

describe('chooseSaveBackend', () => {
  beforeEach(() => vi.resetModules());

  it('falls back to LocalStorageSaveBackend when supabase is unconfigured', async () => {
    const { chooseSaveBackend } = await import('./saveBackend.js');
    const { LocalStorageSaveBackend } = await import('../economy/save.js');
    expect(chooseSaveBackend()).toBeInstanceOf(LocalStorageSaveBackend);
  });
});

describe('chooseSaveBackend with a configured client', () => {
  beforeEach(() => vi.resetModules());

  it('picks SupabaseBackend when supabase is configured', async () => {
    vi.doMock('./supabase.js', () => ({ supabase: {}, ensureAnonSession: vi.fn() }));
    const { chooseSaveBackend } = await import('./saveBackend.js');
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    expect(chooseSaveBackend()).toBeInstanceOf(SupabaseBackend);
  });
});
