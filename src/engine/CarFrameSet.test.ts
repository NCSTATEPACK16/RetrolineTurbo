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

describe('CarFrameSet sparse ladders', () => {
  // Props bake every other rung — a tree is seen briefly across a narrow
  // distance range, so 12 steps would be atlas spent on frames nobody sees.
  const SPARSE = [0, 2, 4, 6, 8, 10];
  const sparse = buildCarFrameSet(
    SPARSE.map((s) => meta('std', 0, s, s * 10)),
  );

  it('lands on a step that actually exists for every rung of the dense ladder', () => {
    for (let want = 0; want < 12; want++) {
      expect(SPARSE, `want=${want}`).toContain(sparse.nearestStep(0, 0, want));
    }
  });

  it('picks an immediate neighbour rather than any old present step', () => {
    expect([2, 4]).toContain(sparse.nearestStep(0, 0, 3));
    expect(sparse.nearestStep(0, 0, 2)).toBe(2); // exact hits stay put
    expect(sparse.nearestStep(0, 0, 8)).toBe(8);
  });

  it('clamps past both ends of the baked range', () => {
    expect(sparse.nearestStep(0, 0, -5)).toBe(0);
    expect(sparse.nearestStep(0, 0, 99)).toBe(10);
  });

  it('resolves to a real frame, never the 1x1 empty one', () => {
    for (let want = 0; want < 12; want++) {
      const f = sparse.frame(0, 0, sparse.nearestStep(0, 0, want));
      expect(f.w, `want=${want}`).toBeGreaterThan(1);
    }
  });

  it('is a no-op on a dense ladder', () => {
    const set = buildCarFrameSet(frames);
    for (let want = 0; want < 3; want++) expect(set.nearestStep(0, 0, want)).toBe(want);
  });

  it('returns the requested step unchanged when the set is empty', () => {
    // Nothing to snap to; the caller's own clamping in frame() takes over.
    expect(() => buildCarFrameSet([]).nearestStep(0, 0, 4)).not.toThrow();
  });
});
