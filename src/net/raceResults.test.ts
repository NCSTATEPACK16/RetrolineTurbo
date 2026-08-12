import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { user: { id: 'user-1' } };

vi.mock('./supabase.js', () => ({ supabase: { from: vi.fn() }, ensureAnonSession: vi.fn() }));

describe('recordRaceResult', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('inserts a race_results row for the current user', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase!.from).mockReturnValue({ insert } as any);
    const { recordRaceResult } = await import('./raceResults.js');
    await recordRaceResult({ trackId: 'route-7', route: '0-1', timeMs: 123456.7 });
    expect(supabase!.from).toHaveBeenCalledWith('race_results');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1', track_id: 'route-7', route: '0-1', time_ms: 123457, credits_earned: 0,
    });
  });

  it('no-ops when there is no session', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(null);
    const { recordRaceResult } = await import('./raceResults.js');
    await recordRaceResult({ trackId: 'route-7', route: '0-1', timeMs: 1000 });
    expect(supabase!.from).not.toHaveBeenCalled();
  });
});
