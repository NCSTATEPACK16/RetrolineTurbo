import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('supabase edge module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not throw on import when env vars are unset', async () => {
    await expect(import('./supabase.js')).resolves.toBeDefined();
  });

  it('exports a null client and ensureAnonSession resolves null', async () => {
    const mod = await import('./supabase.js');
    expect(mod.supabase).toBeNull();
    await expect(mod.ensureAnonSession()).resolves.toBeNull();
  });
});
