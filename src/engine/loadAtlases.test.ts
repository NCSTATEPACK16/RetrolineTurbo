import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadAtlases } from './loadAtlases.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadAtlases', () => {
  it('resolves to no atlases when nothing is reachable', async () => {
    await expect(loadAtlases('/assets/')).resolves.toEqual(new Map());
  });

  it('resolves rather than rejecting for an unreachable absolute base', async () => {
    await expect(loadAtlases('https://example.invalid/nope/')).resolves.toEqual(new Map());
  });

  it('never rejects — the render loop must not die on a bad asset', async () => {
    await expect(loadAtlases('::::not a url::::')).resolves.toBeInstanceOf(Map);
  });

  it('degrades when an SPA fallback answers 200 with HTML instead of 404', async () => {
    // The real miss path in both Vite dev and Netlify: a missing
    // /assets/sprites/cars.json is answered with index.html at status 200, so
    // `res.ok` is true and only the JSON parse reveals the miss.
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => JSON.parse('<!doctype html>'),
    }));
    await expect(loadAtlases('/assets/')).resolves.toEqual(new Map());
  });

  it('loads an atlas whose manifest parses, without a DOM', async () => {
    // Headless: `Image` is undefined, so loadImage returns null and the atlas is
    // dropped. Proves the manifest leg runs and the image leg fails closed.
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        id: 'cars', file: 'sprites/cars.png', width: 64, height: 64, frames: [],
      }),
    }));
    await expect(loadAtlases('/assets/')).resolves.toEqual(new Map());
  });
});
