import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { glyphFrameName, type FontColor } from '../assets/spriteManifest.js';

/** Atlas frame name for a drawable character, or null for a plain advance. */
function frameName(ch: string): string | null {
  if (ch === ' ') return null;
  if (ch >= '0' && ch <= '9') return `digit_${ch}`;
  if (ch === ':' || ch === '.') return 'glyph_colon';
  if (ch === '-') return 'glyph_minus';
  const lower = ch.toLowerCase();
  if (lower >= 'a' && lower <= 'z') return `glyph_${lower}`;
  return null; // unknown chars advance silently (no throw in a render path)
}

/** Draw `text` with the 3×5 bitmap font, top-left at (x, y), integer scale.
 * `color` selects a pre-baked palette glyph set — advance is colour-independent. */
export function drawText(
  backend: RenderBackend, atlas: SpriteAtlas, text: string, x: number, y: number, scale = 2,
  color: FontColor = 'white',
): void {
  let cx = x;
  for (const ch of text) {
    const name = frameName(ch);
    if (name !== null) {
      const f = atlas.frame(glyphFrameName(name, color));
      backend.drawSprite(atlas.image, f.x, f.y, f.w, f.h, cx, y, f.w * scale, f.h * scale, 9999);
      cx += (f.w + 1) * scale;
    } else {
      cx += 4 * scale;
    }
  }
}

/**
 * Rendered width of `text` at `scale`. Mirrors drawText's advance, including the
 * trailing 1px inter-glyph gap after the final character — so right-aligning to
 * this leaves a `scale`-pixel optical margin, which is what we want against the
 * screen edge anyway.
 */
export function textWidth(atlas: SpriteAtlas, text: string, scale = 2): number {
  let w = 0;
  for (const ch of text) {
    const name = frameName(ch);
    w += name !== null ? (atlas.frame(glyphFrameName(name)).w + 1) * scale : 4 * scale;
  }
  return w;
}
