import { describe, it, expect } from 'vitest';
import { bandMerges, MIN_BAND_ROWS } from './roadBanding.js';

describe('bandMerges', () => {
  it('merges when a whole rumble group is shorter than the minimum rows', () => {
    // 5 segments x 0.2 rows = 1.0 row total, under MIN_BAND_ROWS (2).
    expect(bandMerges(0.2, 5)).toBe(true);
  });

  it('alternates when the group is comfortably tall', () => {
    expect(bandMerges(4, 5)).toBe(false); // 20 rows
  });

  it('is exact at the boundary: merging starts strictly below the threshold', () => {
    const atThreshold = MIN_BAND_ROWS / 5;
    expect(bandMerges(atThreshold, 5)).toBe(false);
    expect(bandMerges(atThreshold - 1e-9, 5)).toBe(true);
  });

  it('is monotonic in segment height', () => {
    let sawMerge = false;
    for (let h = 0.01; h < 5; h += 0.01) {
      const merged = bandMerges(h, 5);
      if (!merged) sawMerge = true;
      // once it stops merging it must never merge again as height grows
      if (sawMerge) expect(bandMerges(h, 5)).toBe(false);
    }
  });

  it('never throws or divides by zero on degenerate input', () => {
    expect(bandMerges(0, 0)).toBe(true);
    expect(bandMerges(-5, 5)).toBe(true);
    expect(bandMerges(NaN, 5)).toBe(true);
    expect(bandMerges(Infinity, 5)).toBe(false);
  });
});
