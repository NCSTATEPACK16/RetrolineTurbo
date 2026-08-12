import { describe, it, expect, vi } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';

vi.mock('../net/leaderboard.js', () => ({ fetchLeaderboard: vi.fn() }));

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('LeaderboardScreen', () => {
  it('is closed by default; toggle opens it and kicks off a fetch', async () => {
    const { fetchLeaderboard } = await import('../net/leaderboard.js');
    vi.mocked(fetchLeaderboard).mockResolvedValue([{ timeMs: 1000, isYou: false }]);
    const { LeaderboardScreen } = await import('./LeaderboardScreen.js');
    const screen = new LeaderboardScreen(atlas);
    expect(screen.open).toBe(false);
    screen.toggle('route-7');
    expect(screen.open).toBe(true);
    expect(fetchLeaderboard).toHaveBeenCalledWith('route-7');
    await screen.lastFetch;
    const backend = new RecordingBackend();
    screen.render(backend);
    expect(backend.quads.length).toBeGreaterThan(0);
    expect(backend.sprites.length).toBeGreaterThan(0);
  });

  it('closes on F3 or Escape while open; passes other keys through when closed', async () => {
    const { fetchLeaderboard } = await import('../net/leaderboard.js');
    vi.mocked(fetchLeaderboard).mockResolvedValue([]);
    const { LeaderboardScreen } = await import('./LeaderboardScreen.js');
    const screen = new LeaderboardScreen(atlas);
    expect(screen.handleKey('KeyW')).toBe(false);
    screen.toggle('route-7');
    expect(screen.handleKey('F3')).toBe(true);
    expect(screen.open).toBe(false);
  });
});
