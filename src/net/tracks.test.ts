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

describe('browsePublicTracks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('lists public tracks, most-played first', async () => {
    const { supabase } = await import('./supabase.js');
    const q: any = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.limit = vi.fn(() => Promise.resolve({
      data: [{ id: 'a', name: 'Alpha', plays: 10 }],
      error: null,
    }));
    vi.mocked(supabase!.from).mockReturnValue(q);
    const { browsePublicTracks } = await import('./tracks.js');
    await expect(browsePublicTracks()).resolves.toEqual([{ id: 'a', name: 'Alpha', plays: 10 }]);
    expect(q.eq).toHaveBeenCalledWith('is_public', true);
  });
});

describe('fetchTrack', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns the track data and bumps its play count', async () => {
    const { supabase } = await import('./supabase.js');
    const selectQ: any = {};
    selectQ.select = vi.fn(() => selectQ);
    selectQ.eq = vi.fn(() => selectQ);
    selectQ.maybeSingle = vi.fn(() => Promise.resolve({ data: { data: sampleFile, plays: 4 }, error: null }));
    const updateQ: any = {};
    updateQ.update = vi.fn(() => updateQ);
    updateQ.eq = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase!.from).mockReturnValueOnce(selectQ).mockReturnValueOnce(updateQ);
    const { fetchTrack } = await import('./tracks.js');
    await expect(fetchTrack('id-1')).resolves.toEqual(sampleFile);
    await Promise.resolve(); // let the fire-and-forget bump settle
    expect(updateQ.update).toHaveBeenCalledWith({ plays: 5 });
  });

  it('returns null when the row is missing', async () => {
    const { supabase } = await import('./supabase.js');
    const q: any = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    vi.mocked(supabase!.from).mockReturnValue(q);
    const { fetchTrack } = await import('./tracks.js');
    await expect(fetchTrack('missing')).resolves.toBeNull();
  });
});

// Run last: vi.doMock's override of the module-level `supabase` binding is not
// undone by vi.resetModules(), so any test after this one would otherwise see
// `supabase === null` too.
describe('unconfigured supabase (no client)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('./supabase.js', () => ({ supabase: null, ensureAnonSession: vi.fn() }));
  });

  it('browsePublicTracks returns []', async () => {
    const { browsePublicTracks } = await import('./tracks.js');
    await expect(browsePublicTracks()).resolves.toEqual([]);
  });

  it('fetchTrack returns null', async () => {
    const { fetchTrack } = await import('./tracks.js');
    await expect(fetchTrack('id-1')).resolves.toBeNull();
  });
});
