import { parseMusicManifest, type MusicTrack } from './musicManifest.js';

/**
 * The only music code that touches fetch. Mirrors `loadAtlases.ts` deliberately,
 * including the failure it was written for: Vite and Netlify answer a missing
 * manifest with **200 and index.html**, so `res.ok` is true and only the JSON
 * parse reveals it — which `parseMusicManifest` absorbs into an empty list.
 *
 * Never rejects. No manifest, no network, a garbled file, or a repo with no
 * baked soundtrack all resolve to `[]`, and the game runs silent.
 */
export async function loadMusic(base = '/assets/music/'): Promise<MusicTrack[]> {
  try {
    const res = await fetch(`${base}manifest.json`);
    if (!res.ok) return [];
    return parseMusicManifest(await res.json());
  } catch {
    return []; // offline, headless, 404, malformed JSON — silence it is
  }
}
