import type { FrameTable } from '../types/engine.js';
import type { SpriteEntry } from './spriteManifest.js';

/** Deterministic shelf packer: rows of frames, wrapping at `atlasWidth`, 1px gutter. */
export function packAtlas(entries: SpriteEntry[], atlasWidth: number): { frames: FrameTable; width: number; height: number } {
  const frames: FrameTable = {};
  const gutter = 1;
  let x = gutter, y = gutter, rowH = 0;
  for (const e of entries) {
    if (x + e.w + gutter > atlasWidth) { x = gutter; y += rowH + gutter; rowH = 0; }
    frames[e.name] = { x, y, w: e.w, h: e.h, anchorX: e.anchorX, anchorY: e.anchorY };
    x += e.w + gutter;
    rowH = Math.max(rowH, e.h);
  }
  return { frames, width: atlasWidth, height: y + rowH + gutter };
}
