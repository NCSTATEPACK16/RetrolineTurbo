import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { user: { id: 'user-1' } };

function makeQuery(result: { data: unknown; error: { message: string } | null }) {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.limit = vi.fn(() => Promise.resolve(result));
  return q;
}

vi.mock('./supabase.js', () => ({ supabase: { from: vi.fn() }, ensureAnonSession: vi.fn() }));

describe('fetchLeaderboard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns the fastest times first, flagging the current user', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    vi.mocked(supabase!.from).mockReturnValue(makeQuery({
      data: [{ time_ms: 90000, user_id: 'user-1' }, { time_ms: 95000, user_id: 'user-2' }],
      error: null,
    }));
    const { fetchLeaderboard } = await import('./leaderboard.js');
    await expect(fetchLeaderboard('route-7')).resolves.toEqual([
      { timeMs: 90000, isYou: true },
      { timeMs: 95000, isYou: false },
    ]);
  });

  it('returns [] when supabase is unconfigured', async () => {
    vi.doMock('./supabase.js', () => ({ supabase: null, ensureAnonSession: vi.fn() }));
    const { fetchLeaderboard } = await import('./leaderboard.js');
    await expect(fetchLeaderboard('route-7')).resolves.toEqual([]);
  });
});
