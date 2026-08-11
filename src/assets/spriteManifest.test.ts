import { describe, it, expect } from 'vitest';
import { SPRITE_MANIFEST, FONT_COLORS, glyphFrameName } from './spriteManifest.js';

const entry = (name: string) => SPRITE_MANIFEST.find((e) => e.name === name);

describe('sprite manifest', () => {
  it('packs a lit and an unlit star for the passed-cars gauge', () => {
    expect(entry('star_on')).toBeDefined();
    expect(entry('star_off')).toBeDefined();
  });

  it('draws the lit star in the gold palette colour', () => {
    const star = entry('star_on')!;
    expect(star.ops.every((op) => op.color === FONT_COLORS.gold)).toBe(true);
  });

  it('gives the lit and unlit stars identical geometry', () => {
    const on = entry('star_on')!, off = entry('star_off')!;
    expect([off.w, off.h]).toEqual([on.w, on.h]);
    expect(off.ops.length).toBe(on.ops.length);
  });

  it('names white glyphs without a suffix and coloured glyphs with one', () => {
    expect(glyphFrameName('glyph_a')).toBe('glyph_a');
    expect(glyphFrameName('glyph_a', 'gold')).toBe('glyph_a_gold');
  });
});

/**
 * The 2x2 virtual grid (research §1b) is what makes 480x270 read as 16-bit:
 * effective art resolution ~240x135 while the framebuffer stays 480x270.
 * A discipline that is not mechanised decays, so it is a test.
 */
const GRID_EXEMPT = (name: string): boolean =>
  name.startsWith('glyph_') || name.startsWith('digit_') || name === 'star_on' || name === 'star_off';

describe('2x2 virtual grid', () => {
  it('exempts only the 3x5 font and the 7x7 stars', () => {
    // NB: do NOT write this as "filter by GRID_EXEMPT, then assert the results
    // satisfy GRID_EXEMPT" — that is a tautology that passes for any predicate.
    // Pin the count and the shapes instead, so widening the exemption fails here.
    const exempt = SPRITE_MANIFEST.filter((e) => GRID_EXEMPT(e.name));
    expect(exempt).toHaveLength(230); // 6 colours x 38 glyphs + star_on + star_off
    for (const e of exempt) {
      const shape = `${e.w}x${e.h}`;
      expect(shape, e.name).toMatch(/^(3x5|7x7)$/);
    }
  });

  it('authors every scenery and vehicle sprite on the 2x2 grid', () => {
    for (const e of SPRITE_MANIFEST) {
      if (GRID_EXEMPT(e.name)) continue;
      expect(e.w % 2, `${e.name}.w`).toBe(0);
      expect(e.h % 2, `${e.name}.h`).toBe(0);
      for (const [i, op] of e.ops.entries()) {
        expect(op.rx % 2, `${e.name} op${i}.rx`).toBe(0);
        expect(op.ry % 2, `${e.name} op${i}.ry`).toBe(0);
        expect(op.rw % 2, `${e.name} op${i}.rw`).toBe(0);
        expect(op.rh % 2, `${e.name} op${i}.rh`).toBe(0);
      }
    }
  });
});
