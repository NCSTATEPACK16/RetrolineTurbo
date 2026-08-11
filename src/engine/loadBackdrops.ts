import { parseBackdropManifest, type Backdrop, type BackdropMeta } from './Backdrop.js';

/**
 * Loading edge for the pre-rendered horizon plates (`public/assets/backgrounds/`,
 * produced by `scripts/prep_backgrounds.py`). Kept out of the engine core: it is
 * the only backdrop code that touches fetch/Image.
 *
 * Never rejects. A missing manifest, a failed decode, or a headless environment
 * all resolve to whatever loaded successfully — the renderer falls back to the
 * flat colour bands for anything absent, so the game always boots.
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

export async function loadBackdrops(base = '/assets/'): Promise<Map<string, Backdrop>> {
  const plates = new Map<string, Backdrop>();
  let metas: BackdropMeta[] = [];
  try {
    const res = await fetch(`${base}backgrounds/manifest.json`);
    if (!res.ok) return plates;
    metas = parseBackdropManifest(await res.json());
  } catch {
    return plates; // no manifest reachable (offline, headless, 404) — bands it is
  }

  await Promise.all(metas.map(async (m) => {
    const image = await loadImage(`${base}${m.file}`);
    if (image) plates.set(m.id, { image, width: m.width, height: m.height, skyColor: m.skyColor });
  }));
  return plates;
}
