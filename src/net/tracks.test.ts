import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrackFile } from '../track/schema.js';

const mockSession = { user: { id: 'user-1' } };
const sampleFile = { trackId: 't1', segmentLength: 200, roadWidth: 2000, lanes: 3, sections: [] } as unknown as TrackFile;

vi.mock('./supabase.js', () => ({ supabase: { from: vi.fn() }, ensureAnonSession: vi.fn() }));

describe('publishTrack', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('inserts a public tracks row authored by the current user', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase!.from).mockReturnValue({ insert } as any);
    const { publishTrack } = await import('./tracks.js');
    await expect(publishTrack('my track', sampleFile)).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith({
      author_id: 'user-1', name: 'my track', data: sampleFile, is_public: true,
    });
  });

  it('returns false when there is no session', async () => {
    const { ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(null);
    const { publishTrack } = await import('./tracks.js');
    await expect(publishTrack('my track', sampleFile)).resolves.toBe(false);
  });
});
