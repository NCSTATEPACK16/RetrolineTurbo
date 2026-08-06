import { SPRITE_MANIFEST } from './spriteManifest.js';
import { packAtlas } from './packAtlas.js';
import type { FrameTable } from '../types/engine.js';

/** Draw the whole manifest into one offscreen canvas. Edge asset production —
 * the only place besides Canvas2DBackend allowed to touch a ctx. Deterministic:
 * same manifest ⇒ same pixels. Called once at boot; result handed to SpriteAtlas. */
export function generateAtlas(atlasWidth = 256): { image: HTMLCanvasElement; frames: FrameTable } {
  const { frames, width, height } = packAtlas(SPRITE_MANIFEST, atlasWidth);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('generateAtlas: 2D context unavailable');
  ctx.imageSmoothingEnabled = false;
  for (const e of SPRITE_MANIFEST) {
    const f = frames[e.name]!;
    for (const op of e.ops) {
      ctx.fillStyle = op.color;
      ctx.fillRect(f.x + op.rx, f.y + op.ry, op.rw, op.rh);
    }
  }
  return { image: canvas, frames };
}
