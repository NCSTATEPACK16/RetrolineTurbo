import { parseAtlasManifest, type AtlasMeta } from './AtlasManifest.js';

/** Atlases by lifecycle (research §5b). `effects` is droppable on low-end. */
export const ATLAS_IDS = ['cars', 'props', 'ui', 'effects'] as const;

export interface LoadedAtlas { meta: AtlasMeta; image: CanvasImageSource }

/**
 * The only atlas code that touches fetch/Image.
 *
 * Never rejects. Vitest runs `environment: 'node'` with no DOM, so the
 * `typeof Image` guard is what keeps the suite headless; the try/catch is what
 * keeps an offline or 404'd CDN from killing the game.
 */
async function loadImage(url: string): Promise<CanvasImageSource | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = (): void => { resolve(img); };
    img.onerror = (): void => { resolve(null); };
    img.src = url;
  });
}

async function loadOne(base: string, id: string): Promise<[string, LoadedAtlas] | null> {
  try {
    const res = await fetch(`${base}sprites/${id}.json`);
    if (!res.ok) return null;
    const meta = parseAtlasManifest(await res.json());
    if (!meta) return null;
    const image = await loadImage(`${base}${meta.file}`);
    return image ? [id, { meta, image }] : null;
  } catch {
    return null; // offline, headless, 404, malformed JSON — procedural art it is
  }
}

export async function loadAtlases(base = '/assets/'): Promise<Map<string, LoadedAtlas>> {
  const out = new Map<string, LoadedAtlas>();
  try {
    const results = await Promise.all(ATLAS_IDS.map((id) => loadOne(base, id)));
    for (const r of results) if (r) out.set(r[0], r[1]);
  } catch {
    // total by contract
  }
  return out;
}
