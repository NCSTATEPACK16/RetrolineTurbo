import { describe, it, expect } from 'vitest';
import { buildCarFrameSet } from './CarFrameSet.js';
import type { AtlasFrameMeta } from './AtlasManifest.js';

function meta(color: string, angle: number, step: number, x: number): AtlasFrameMeta {
  return {
    id: `gt_${color}_a${angle}_s${step}`, x, y: 0, w: 120 - step * 10, h: 72,
    car: 'gt', color, angle, step,
    anchors: { wheelBL: [0.18, 0.92] },
  };
}

const frames = ['red', 'blue'].flatMap((c) =>
  [0, 1, 2].flatMap((a) => [0, 1, 2].map((s) => meta(c, a, s, a * 100 + s * 10))),
);

describe('CarFrameSet', () => {
  it('reports the dimensions it was built with', () => {
    const set = buildCarFrameSet(frames);
    expect(set.colors).toBe(2);
    expect(set.angles).toBe(3);
  });

  it('resolves by integer index to the frame the string id names', () => {
    const set = buildCarFrameSet(frames);
    const f = set.frame(set.colorIndex('blue'), 2, 1);
    expect(f.x).toBe(2 * 100 + 1 * 10);
    expect(f.w).toBe(110);
  });

  it('clamps out-of-range indices instead of throwing', () => {
    const set = buildCarFrameSet(frames);
    expect(() => set.frame(99, 99, 99)).not.toThrow();
    expect(() => set.frame(-1, -1, -1)).not.toThrow();
    expect(set.frame(-1, -1, -1)).toEqual(set.frame(0, 0, 0));
  });

  it('exposes anchors without allocating', () => {
    const set = buildCarFrameSet(frames);
    const out: [number, number] = [0, 0];
    expect(set.anchor(0, 'wheelBL', out)).toBe(true);
    expect(out).toEqual([0.18, 0.92]);
    expect(set.anchor(0, 'nope', out)).toBe(false);
  });

  it('returns an empty set for no frames rather than throwing', () => {
    const set = buildCarFrameSet([]);
    expect(set.colors).toBe(0);
    expect(() => set.frame(0, 0, 0)).not.toThrow();
  });
});
