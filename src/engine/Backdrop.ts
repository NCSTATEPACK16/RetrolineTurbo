import { layerOffset } from './Background.js';

/**
 * Pre-rendered horizon plates (Phase 7.5). `scripts/prep_backgrounds.py` turns
 * the source panoramas into 960px-wide plates whose right half mirrors the left,
 * so a plate wraps with no seam and sits at ~1:1 pixels against the framebuffer.
 *
 * Everything here is pure: the loading edge lives in `loadBackdrops.ts`.
 */

/** A loaded plate, ready for the backend to blit. */
export interface Backdrop {
  image: CanvasImageSource;
  width: number;
  height: number;
  skyColor: string; // fills the band above a plate shorter than the horizon
}

/** One `manifest.json` entry — the plate's metadata before its image loads. */
export interface BackdropMeta {
  id: string;
  name: string;
  file: string;
  width: number;
  height: number;
  skyColor: string;
}

/** Backdrop per route stage: out of the city, through the coast, into the desert. */
export const STAGE_BACKDROP_IDS = [
  'city_night', 'city_night', 'coastal_sunset', 'desert_canyon', 'desert_canyon',
] as const;

/** Parallax rate for the horizon plate — slow, since it reads as far away. */
export const BACKDROP_LAYER_SPEED = 0.02;

export function backdropIdForStage(stage: number): string {
  const i = Math.max(0, Math.min(STAGE_BACKDROP_IDS.length - 1, Math.floor(stage)));
  return STAGE_BACKDROP_IDS[i]!;
}

/** Plate scroll offset for the current camera, wrapped into one plate width. */
export function backdropPan(cameraX: number, curvature: number, plateWidth: number): number {
  const raw = layerOffset(cameraX, curvature, BACKDROP_LAYER_SPEED);
  return ((raw % plateWidth) + plateWidth) % plateWidth;
}

/** Left edges of the plate copies needed to cover the screen, written into
 * `out` (caller-owned, so the render path allocates nothing). Returns the count. */
export function backdropTiles(pan: number, plateWidth: number, screenWidth: number, out: number[]): number {
  let n = 0;
  for (let x = pan === 0 ? 0 : -pan; x < screenWidth && n < out.length; x += plateWidth) {
    out[n++] = x; // `pan === 0` guard keeps a signed zero out of the draw call
  }
  return n;
}

function isMeta(v: unknown): v is BackdropMeta {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return typeof m.id === 'string' && typeof m.name === 'string' && typeof m.file === 'string'
    && typeof m.width === 'number' && typeof m.height === 'number' && typeof m.skyColor === 'string';
}

/** Read the prep script's manifest, dropping anything the renderer can't use.
 * Never throws — a missing or malformed manifest just means "no plates". */
export function parseBackdropManifest(doc: unknown): BackdropMeta[] {
  if (typeof doc !== 'object' || doc === null) return [];
  const list = (doc as { backgrounds?: unknown }).backgrounds;
  if (!Array.isArray(list)) return [];
  return list.filter(isMeta);
}
