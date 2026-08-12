import { describe, it, expect, vi } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { DEFAULT_TRACK_FILE } from '../track/tracks.js';

vi.mock('../net/tracks.js', () => ({ browsePublicTracks: vi.fn(), fetchTrack: vi.fn() }));

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('TrackBrowserScreen', () => {
  it('is closed by default; toggle opens it and lists public tracks', async () => {
    const { browsePublicTracks } = await import('../net/tracks.js');
    vi.mocked(browsePublicTracks).mockResolvedValue([{ id: 'a', name: 'Alpha', plays: 3 }]);
    const { TrackBrowserScreen } = await import('./TrackBrowserScreen.js');
    const screen = new TrackBrowserScreen(atlas, () => true);
    expect(screen.open).toBe(false);
    expect(screen.handleKey('KeyW')).toBe(false);
    screen.toggle();
    expect(screen.open).toBe(true);
    await screen.lastFetch;
  });

  it('Enter loads the selected track through onTrackChange', async () => {
    const { browsePublicTracks, fetchTrack } = await import('../net/tracks.js');
    vi.mocked(browsePublicTracks).mockResolvedValue([{ id: 'a', name: 'Alpha', plays: 3 }]);
    vi.mocked(fetchTrack).mockResolvedValue(DEFAULT_TRACK_FILE);
    const onTrackChange = vi.fn(() => true);
    const { TrackBrowserScreen } = await import('./TrackBrowserScreen.js');
    const screen = new TrackBrowserScreen(atlas, onTrackChange);
    screen.toggle();
    await screen.lastFetch;
    screen.handleKey('Enter');
    await screen.lastLoad;
    expect(onTrackChange).toHaveBeenCalled();
  });

  it('closes on F4 or Escape', async () => {
    const { browsePublicTracks } = await import('../net/tracks.js');
    vi.mocked(browsePublicTracks).mockResolvedValue([]);
    const { TrackBrowserScreen } = await import('./TrackBrowserScreen.js');
    const screen = new TrackBrowserScreen(atlas, () => true);
    screen.toggle();
    expect(screen.handleKey('F4')).toBe(true);
    expect(screen.open).toBe(false);
  });
});
