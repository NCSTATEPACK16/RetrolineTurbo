import { describe, it, expect } from 'vitest';
import { gearTorque, gearAccel, shouldUpshift, type GearTable } from './gearbox.js';
import { BOG_FACTOR } from '../constants.js';

/** The shipped 4-speed table. Kept local so a constants retune during the feel
 * pass fails loudly here rather than silently changing what these tests mean. */
const T: GearTable = {
  maxKmh: [90, 150, 220, 290],
  minKmh: [0, 70, 120, 180],
  accelKmhS: [95, 62, 38, 26],
};

describe('gearTorque', () => {
  it('is full torque at the bottom of a gear band', () => {
    expect(gearTorque(70, 1, T)).toBeCloseTo(1, 9);
  });

  it('decays to exactly zero at the gear ceiling (preserves the asymptote)', () => {
    expect(gearTorque(150, 1, T)).toBe(0);
    expect(gearTorque(290, 3, T)).toBe(0);
  });

  it('never goes negative above the ceiling', () => {
    expect(gearTorque(400, 3, T)).toBe(0);
  });

  it('clamps to 1 below the band rather than exceeding full torque', () => {
    expect(gearTorque(0, 3, T)).toBe(1);
  });

  it('is monotonically decreasing within a gear', () => {
    let prev = Infinity;
    for (let k = 70; k <= 150; k += 5) {
      const t = gearTorque(k, 1, T);
      expect(t).toBeLessThanOrEqual(prev);
      prev = t;
    }
  });
});

describe('gearAccel', () => {
  it('applies the bog penalty below the band', () => {
    // 50 km/h is below gear 2's 70 km/h floor -> full torque * BOG_FACTOR
    expect(gearAccel(50, 1, T)).toBeCloseTo(62 * BOG_FACTOR, 6);
  });

  it('does not bog at exactly the band floor', () => {
    expect(gearAccel(70, 1, T)).toBeCloseTo(62, 6);
  });

  it('is zero at the ceiling, so the speed cap still holds', () => {
    expect(gearAccel(290, 3, T)).toBe(0);
  });
});

describe('shouldUpshift', () => {
  // The derived result from the spec: because the next gear is bogged below its
  // floor and un-bogged at it, the crossover lands exactly on that floor.
  it.each([
    [0, 70],
    [1, 120],
    [2, 180],
  ])('gear index %i upshifts exactly at %i km/h', (g, expected) => {
    expect(shouldUpshift(expected - 0.01, g, T)).toBe(false);
    expect(shouldUpshift(expected, g, T)).toBe(true);
  });

  it('is false in top gear — there is nothing to shift into', () => {
    expect(shouldUpshift(250, 3, T)).toBe(false);
  });

  it('keeps a usable margin at every shift point', () => {
    // Guards the spec's numeric correction: top-gear accel of 22 gave the 3->4
    // shift a +0.07 margin, which would make the HUD light flicker on rounding.
    for (const [g, at] of [[0, 70], [1, 120], [2, 180]] as const) {
      const gain = gearAccel(at, g + 1, T) - gearAccel(at, g, T);
      expect(gain).toBeGreaterThan(1);
    }
  });
});
