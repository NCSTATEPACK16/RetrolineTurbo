import { describe, it, expect } from 'vitest';
import { buildSimTrack, wrapS, sectionIndexAt, curvatureAt, arcDelta } from './track.js';

const track = buildSimTrack({
  name: 't', halfWidth: 8,
  sections: [{ length: 100, curvature: 0 }, { length: 50, curvature: 0.02 }, { length: 100, curvature: -0.01 }],
});

describe('v2 sim track', () => {
  it('measures total length and section starts', () => {
    expect(track.length).toBe(250);
    expect(Array.from(track.starts)).toEqual([0, 100, 150]);
  });

  it('finds the section at an arc length', () => {
    expect(sectionIndexAt(track, 0)).toBe(0);
    expect(sectionIndexAt(track, 99.9)).toBe(0);
    expect(sectionIndexAt(track, 100)).toBe(1);
    expect(sectionIndexAt(track, 249)).toBe(2);
    expect(curvatureAt(track, 120)).toBe(0.02);
  });

  it('wraps arc length onto the loop', () => {
    expect(wrapS(track, 260)).toBe(10);
    expect(wrapS(track, -10)).toBe(240);
    expect(wrapS(track, 510)).toBe(10);
  });

  it('takes the short way round for arc deltas across the start line', () => {
    expect(arcDelta(track, 240, 10)).toBe(20);
    expect(arcDelta(track, 10, 240)).toBe(-20);
  });

  it('rejects empty or zero-length tracks', () => {
    expect(() => buildSimTrack({ name: 'x', halfWidth: 8, sections: [] })).toThrow(/no sections/);
    expect(() => buildSimTrack({ name: 'x', halfWidth: 8, sections: [{ length: 0, curvature: 0 }] })).toThrow(/non-positive/);
  });
});
