import { describe, it, expect } from 'vitest';
import { drawText, textWidth } from './text.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { FONT_COLORS } from '../assets/spriteManifest.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('drawText', () => {
  it('draws one sprite per visible glyph, none for spaces', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'gear up', 0, 0);
    expect(b.sprites.length).toBe(6); // 'gearup' — the space advances silently
  });

  it('advances the pen x monotonically', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'abc', 10, 5);
    const xs = b.sprites.map((s) => s.dx);
    expect(xs[0]).toBe(10);
    expect(xs[1]).toBeGreaterThan(xs[0]!);
    expect(xs[2]).toBeGreaterThan(xs[1]!);
  });

  it('renders minus signs for negative numbers', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, '-2.5', 0, 0);
    expect(b.sprites.length).toBe(4); // - 2 . 5
  });

  it('mixes digits, letters and punctuation in one string', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'lap 1:23.4', 0, 0);
    expect(b.sprites.length).toBe(9); // l a p 1 : 2 3 . 4
  });

  it('draws the default white glyph when no colour is given', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'a', 0, 0);
    const f = atlas.frame('glyph_a');
    expect(b.sprites[0]!.sx).toBe(f.x);
    expect(b.sprites[0]!.sy).toBe(f.y);
  });

  it('draws letters from the requested colour variant', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'a', 0, 0, 2, 'magenta');
    const f = atlas.frame('glyph_a_magenta');
    expect(b.sprites[0]!.sx).toBe(f.x);
    expect(b.sprites[0]!.sy).toBe(f.y);
  });

  it('colours digits and punctuation too', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, '1:', 0, 0, 2, 'red');
    expect(b.sprites[0]!.sx).toBe(atlas.frame('digit_1_red').x);
    expect(b.sprites[1]!.sx).toBe(atlas.frame('glyph_colon_red').x);
  });

  it('packs a full glyph set for every palette colour', () => {
    for (const color of Object.keys(FONT_COLORS)) {
      if (color === 'white') continue; // white keeps the unsuffixed names
      expect(() => atlas.frame(`glyph_z_${color}`)).not.toThrow();
      expect(() => atlas.frame(`digit_0_${color}`)).not.toThrow();
    }
  });

  it('keeps glyph advance identical across colours', () => {
    const plain = new RecordingBackend();
    const tinted = new RecordingBackend();
    drawText(plain, atlas, 'abc', 0, 0);
    drawText(tinted, atlas, 'abc', 0, 0, 2, 'cyan');
    expect(tinted.sprites.map((s) => s.dx)).toEqual(plain.sprites.map((s) => s.dx));
  });
});

describe('textWidth', () => {
  it('matches drawText\'s advance for a digit run', () => {
    // Each glyph advances (f.w + 1) * scale, trailing gap included.
    const w = atlas.frame('digit_0').w;
    expect(textWidth(atlas, '300', 2)).toBe(3 * (w + 1) * 2);
  });

  it('advances 4 * scale for a space', () => {
    expect(textWidth(atlas, ' ', 3)).toBe(12);
    expect(textWidth(atlas, 'a a', 1) - textWidth(atlas, 'aa', 1)).toBe(4);
  });

  it('advances unknown characters exactly like a space, without throwing', () => {
    expect(() => textWidth(atlas, '#', 2)).not.toThrow();
    expect(textWidth(atlas, '#', 2)).toBe(textWidth(atlas, ' ', 2));
  });

  it('right-aligning by it keeps the drawn glyphs inside the anchor', () => {
    const b = new RecordingBackend();
    const text = '300';
    const right = 474;
    drawText(b, atlas, text, right - textWidth(atlas, text, 2), 0, 2);
    expect(Math.max(...b.sprites.map((s) => s.dx + s.dw))).toBeLessThanOrEqual(right);
  });
});
