import { describe, it, expect } from 'vitest';
import {
  SPRITE_MANIFEST, FONT_COLORS, NEW_PROPS, DIGIT_ROWS, LETTER_ROWS, STAR_ROWS, STAR_UNLIT,
  glyphFrameName, maskOps, type DrawOp,
} from './spriteManifest.js';

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
 * Verbatim copies of the two hardcoded expanders `maskOps` replaced, kept here
 * as the oracle. 228 glyph frames and 2 star faces are already baked into
 * ui.png against their output; a generalisation that shifted a single pixel
 * would be invisible in review and obvious only on screen.
 */
function legacyMaskOps(rows: number[], hex: string): DrawOp[] {
  const ops: DrawOp[] = [];
  rows.forEach((mask, ry) => {
    for (let c = 0; c < 3; c++) if (mask & (0b100 >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: hex });
  });
  return ops;
}

function legacyStarOps(hex: string): DrawOp[] {
  const ops: DrawOp[] = [];
  STAR_ROWS.forEach((mask, ry) => {
    for (let c = 0; c < 7; c++) if (mask & (0b1000000 >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: hex });
  });
  return ops;
}

describe('generalised maskOps', () => {
  it('reproduces the 3-column letter output bit for bit', () => {
    for (const [ch, rows] of Object.entries(LETTER_ROWS)) {
      expect(maskOps(rows, '#ffffff', 3), ch).toEqual(legacyMaskOps(rows, '#ffffff'));
    }
  });

  it('reproduces the 3-column digit output bit for bit', () => {
    for (const [d, rows] of Object.entries(DIGIT_ROWS)) {
      expect(maskOps(rows, '#ffffff', 3), d).toEqual(legacyMaskOps(rows, '#ffffff'));
    }
  });

  it('defaults to 3 columns, so every existing call site is unchanged', () => {
    const rows = LETTER_ROWS['a']!;
    expect(maskOps(rows, '#ffffff')).toEqual(maskOps(rows, '#ffffff', 3));
  });

  it('reproduces the 7-column star face it absorbed', () => {
    expect(maskOps(STAR_ROWS, FONT_COLORS.gold, 7)).toEqual(legacyStarOps(FONT_COLORS.gold));
    expect(maskOps(STAR_ROWS, STAR_UNLIT, 7)).toEqual(legacyStarOps(STAR_UNLIT));
  });

  it('handles an 8-column mask, which is what a wider face would need', () => {
    const ops = maskOps([0b10000001, 0, 0, 0, 0], '#ffffff', 8);
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.rx)).toEqual([0, 7]);
  });
});

describe('prop registration', () => {
  it('registers every new prop name in the manifest', () => {
    const names = new Set(SPRITE_MANIFEST.map((e) => e.name));
    for (const n of NEW_PROPS) expect(names.has(n), n).toBe(true);
  });

  it('names the props the TX-1 handoff still lists unchecked', () => {
    // Pinned by name: NEW_PROPS is what src/track/schema.ts validates track JSON
    // against, so silently shrinking the list would silently break tracks.
    expect([...NEW_PROPS]).toEqual(
      ['lamp_post', 'median_post', 'grandstand', 'palm', 'billboard_sponsor'],
    );
  });

  it('anchors every new prop at base centre so it stands on the road plane', () => {
    for (const n of NEW_PROPS) {
      const e = entry(n)!;
      expect(e.anchorX, `${n}.anchorX`).toBe(Math.floor(e.w / 2));
      expect(e.anchorY, `${n}.anchorY`).toBe(e.h);
    }
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
