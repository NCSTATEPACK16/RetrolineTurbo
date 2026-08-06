import { describe, it, expect } from 'vitest';
import { packAtlas } from './packAtlas.js';
import { SPRITE_MANIFEST } from './spriteManifest.js';

describe('packAtlas', () => {
  it('produces a frame for every manifest entry', () => {
    const { frames } = packAtlas(SPRITE_MANIFEST, 256);
    for (const e of SPRITE_MANIFEST) expect(frames[e.name]).toBeDefined();
  });

  it('never places two frames overlapping', () => {
    const { frames } = packAtlas(SPRITE_MANIFEST, 256);
    const rects = Object.values(frames);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!;
        const disjoint = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(disjoint).toBe(true);
      }
  });

  it('carries anchors through from the manifest', () => {
    const { frames } = packAtlas(SPRITE_MANIFEST, 256);
    const tree = SPRITE_MANIFEST.find((e) => e.name === 'tree')!;
    expect(frames['tree']!.anchorX).toBe(tree.anchorX);
    expect(frames['tree']!.anchorY).toBe(tree.anchorY);
  });

  it('includes the full look-lock set (scenery, 4 cars, player, digits)', () => {
    const names = SPRITE_MANIFEST.map((e) => e.name);
    for (const n of ['tree', 'bush', 'rock', 'sign', 'billboard',
                     'car0', 'car1', 'car2', 'car3', 'player',
                     'digit_0', 'digit_9', 'glyph_colon'])
      expect(names).toContain(n);
  });

  it('includes the a–z letter glyphs for menu text', () => {
    const names = SPRITE_MANIFEST.map((e) => e.name);
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') expect(names).toContain(`glyph_${ch}`);
  });
});
