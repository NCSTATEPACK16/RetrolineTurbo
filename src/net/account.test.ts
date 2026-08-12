import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase.js', () => ({ supabase: { auth: { updateUser: vi.fn(), getUser: vi.fn() } } }));

describe('linkEmail / setPassword / isAccountLinked', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('linkEmail calls updateUser with the email and returns ok', async () => {
    const { supabase } = await import('./supabase.js');
    vi.mocked(supabase!.auth.updateUser).mockResolvedValue({ error: null } as any);
    const { linkEmail } = await import('./account.js');
    await expect(linkEmail('a@b.com')).resolves.toBe('ok');
    expect(supabase!.auth.updateUser).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('linkEmail returns "error" when Supabase rejects it', async () => {
    const { supabase } = await import('./supabase.js');
    vi.mocked(supabase!.auth.updateUser).mockResolvedValue({ error: { message: 'bad' } } as any);
    const { linkEmail } = await import('./account.js');
    await expect(linkEmail('a@b.com')).resolves.toBe('error');
  });

  it('isAccountLinked reflects is_anonymous on the current user', async () => {
    const { supabase } = await import('./supabase.js');
    vi.mocked(supabase!.auth.getUser).mockResolvedValue({ data: { user: { is_anonymous: false } } } as any);
    const { isAccountLinked } = await import('./account.js');
    await expect(isAccountLinked()).resolves.toBe(true);
  });
});

// Run last: vi.doMock's override of the module-level `supabase` binding is not
// undone by vi.resetModules(), so any test after this one would otherwise see
// `supabase === null` too (see src/net/tracks.test.ts for the same pattern).
describe('unconfigured supabase (no client)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('./supabase.js', () => ({ supabase: null }));
  });

  it('linkEmail returns "no-backend"', async () => {
    const { linkEmail } = await import('./account.js');
    await expect(linkEmail('a@b.com')).resolves.toBe('no-backend');
  });

  it('setPassword returns "no-backend"', async () => {
    const { setPassword } = await import('./account.js');
    await expect(setPassword('hunter2')).resolves.toBe('no-backend');
  });

  it('isAccountLinked returns false', async () => {
    const { isAccountLinked } = await import('./account.js');
    await expect(isAccountLinked()).resolves.toBe(false);
  });
});
