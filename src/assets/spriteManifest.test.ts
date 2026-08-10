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
