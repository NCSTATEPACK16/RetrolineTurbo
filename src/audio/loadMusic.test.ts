import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadMusic } from './loadMusic.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadMusic', () => {
  it('resolves to no tracks when nothing is reachable', async () => {
    await expect(loadMusic('/assets/music/')).resolves.toEqual([]);
  });

  it('never rejects — a missing soundtrack must not take the game down', async () => {
    await expect(loadMusic('::::not a url::::')).resolves.toEqual([]);
  });

  it('degrades when an SPA fallback answers 200 with HTML instead of 404', async () => {
    // Same miss path loadAtlases guards: Vite and Netlify serve index.html at
    // status 200 for a missing asset, so res.ok lies and only the parse reveals it.
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => JSON.parse('<!doctype html>'),
    }));
    await expect(loadMusic('/assets/music/')).resolves.toEqual([]);
  });

  it('returns the parsed tracks when the manifest is well-formed', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        tracks: [{ id: 'eyeless', ogg: 'eyeless.ogg', mp3: 'eyeless.mp3', seconds: 211 }],
      }),
    }));
    await expect(loadMusic('/assets/music/')).resolves.toEqual([
      { id: 'eyeless', ogg: 'eyeless.ogg', mp3: 'eyeless.mp3', seconds: 211 },
    ]);
  });

  it('returns [] on a non-ok response', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }));
    await expect(loadMusic('/assets/music/')).resolves.toEqual([]);
  });
});
