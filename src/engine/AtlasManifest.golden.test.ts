import { describe, expect, it } from 'vitest';

import doc from '../../public/assets/sprites/cars.json' with { type: 'json' };
import { LADDER } from '../math/ladder.js';
import { parseAtlasManifest } from './AtlasManifest.js';
import { buildCarFrameSet } from './CarFrameSet.js';

/**
 * Golden test against the real baked atlas.
 *
 * The bake pipeline (scripts/pack_atlas.py) and the runtime loader agree on a
 * schema that neither one owns. Without a test over the actual committed output
 * they can drift silently: the packer keeps emitting, the parser keeps dropping
 * what it does not recognise, and the only symptom is an invisible car.
 */
describe('baked cars.json', () => {
  const raw = doc as unknown as { frames: unknown[] };

  it('is accepted by the runtime parser with no frames dropped', () => {
    const meta = parseAtlasManifest(doc);
    expect(meta).not.toBeNull();
    expect(meta!.frames.length).toBe(raw.frames.length);
  });

  it('fits the iOS-safe cap', () => {
    const meta = parseAtlasManifest(doc)!;
    expect(meta.width).toBeLessThanOrEqual(2048);
    expect(meta.height).toBeLessThanOrEqual(2048);
  });

  it('covers every ladder step for each colour and steering angle', () => {
    const meta = parseAtlasManifest(doc)!;
    const bodies = meta.frames.filter((f) => f.car === 'sports');
    for (const color of ['red', 'blue']) {
      for (let angle = 0; angle < 3; angle++) {
        const steps = bodies
          .filter((f) => f.color === color && f.angle === angle)
          .map((f) => f.step)
          .sort((a, b) => a - b);
        expect(steps).toEqual([...LADDER.keys()]);
      }
    }
  });

  it('sizes the straight-ahead body frames to the ladder widths exactly', () => {
    const meta = parseAtlasManifest(doc)!;
    for (const f of meta.frames) {
      if (f.car === 'sports' && f.angle === 0) expect(f.w).toBe(LADDER[f.step]);
    }
  });

  it('gives every frame in-bounds pixel coordinates', () => {
    const meta = parseAtlasManifest(doc)!;
    for (const f of meta.frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(meta.width);
      expect(f.y + f.h).toBeLessThanOrEqual(meta.height);
    }
  });

  it('carries the overlay anchors the renderer composes against', () => {
    const meta = parseAtlasManifest(doc)!;
    const body = meta.frames.find((f) => f.car === 'sports' && f.angle === 2)!;
    for (const name of ['wheelFL', 'wheelFR', 'wheelBL', 'wheelBR', 'brake', 'exhaust']) {
      const pt = body.anchors[name];
      expect(pt, `missing anchor ${name}`).toBeDefined();
      expect(pt![0]).toBeGreaterThanOrEqual(0);
      expect(pt![0]).toBeLessThanOrEqual(1);
      expect(pt![1]).toBeGreaterThanOrEqual(0);
      expect(pt![1]).toBeLessThanOrEqual(1);
    }
  });

  it('resolves into a dense CarFrameSet with no holes', () => {
    const meta = parseAtlasManifest(doc)!;
    const set = buildCarFrameSet(meta.frames.filter((f) => f.car === 'sports'));
    expect(set.colors).toBe(2);
    expect(set.angles).toBe(3);
    for (let c = 0; c < set.colors; c++) {
      for (let a = 0; a < set.angles; a++) {
        for (let s = 0; s < LADDER.length; s++) {
          expect(set.frame(c, a, s).w, `hole at ${c}/${a}/${s}`).toBeGreaterThan(1);
        }
      }
    }
  });
});
