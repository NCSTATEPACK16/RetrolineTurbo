import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { user: { id: 'user-1' } };

function makeQuery(result: { data: unknown; error: { message: string } | null }) {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  q.upsert = vi.fn(() => Promise.resolve(result));
  return q;
}

vi.mock('./supabase.js', () => ({
  supabase: { from: vi.fn() },
  ensureAnonSession: vi.fn(),
}));

describe('SupabaseBackend', () => {
  beforeEach(() => vi.resetModules());

  it('get() returns null before any set(), when the row does not exist', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    vi.mocked(supabase!.from).mockReturnValue(makeQuery({ data: null, error: null }));
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await expect(backend.get('bindings')).resolves.toBeNull();
  });

  it('get() reads a key out of the loaded settings blob', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    vi.mocked(supabase!.from).mockReturnValue(
      makeQuery({ data: { settings: { bindings: 'stored-value' } }, error: null }),
    );
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await expect(backend.get('bindings')).resolves.toBe('stored-value');
  });

  it('set() upserts the merged settings blob under the session user id', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    const query = makeQuery({ data: { settings: {} }, error: null });
    vi.mocked(supabase!.from).mockReturnValue(query);
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await backend.set('bindings', 'v1');
    expect(query.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', settings: { bindings: 'v1' } },
      { onConflict: 'user_id' },
    );
  });

  it('degrades to a no-op when there is no session (offline/misconfigured)', async () => {
    const { ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(null);
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await expect(backend.get('bindings')).resolves.toBeNull();
    await expect(backend.set('bindings', 'v1')).resolves.toBeUndefined();
  });
});
