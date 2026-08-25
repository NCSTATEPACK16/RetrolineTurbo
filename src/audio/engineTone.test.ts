import { describe, it, expect } from 'vitest';
import { computeEngineTone, squealGain, type EngineToneParams } from './engineTone.js';

const GEAR_MAX_KMH = [90, 150, 220, 290] as const;
const PARAMS: EngineToneParams = {
  fBase: [90, 78, 68, 60], fRange: 260, filterMinHz: 400, filterMaxHz: 4000,
};

describe('computeEngineTone', () => {
  it('is fBase/filterMin at a dead stop in first gear', () => {
    const tone = computeEngineTone(0, 1, GEAR_MAX_KMH, PARAMS);
    expect(tone.frequency).toBe(PARAMS.fBase[0]);
    expect(tone.cutoff).toBe(PARAMS.filterMinHz);
  });

  it('reaches fBase + fRange / filterMax at the first gear cap', () => {
    const tone = computeEngineTone(GEAR_MAX_KMH[0], 1, GEAR_MAX_KMH, PARAMS);
    expect(tone.frequency).toBeCloseTo(PARAMS.fBase[0]! + PARAMS.fRange, 5);
    expect(tone.cutoff).toBeCloseTo(PARAMS.filterMaxHz, 5);
  });

  it('uses the current gear base, not the first, once shifted up', () => {
    // Every gear has its own base, so each upshift reads as a pitch drop.
    for (let gear = 1; gear <= 4; gear++) {
      expect(computeEngineTone(0, gear, GEAR_MAX_KMH, PARAMS).frequency)
        .toBe(PARAMS.fBase[gear - 1]);
    }
  });

  it('drops pitch on every upshift', () => {
    for (let gear = 1; gear < 4; gear++) {
      const here = computeEngineTone(0, gear, GEAR_MAX_KMH, PARAMS).frequency;
      const next = computeEngineTone(0, gear + 1, GEAR_MAX_KMH, PARAMS).frequency;
      expect(next).toBeLessThan(here);
    }
  });

  it('is monotonically increasing with speed within a gear', () => {
    const low = computeEngineTone(50, 2, GEAR_MAX_KMH, PARAMS);
    const high = computeEngineTone(140, 2, GEAR_MAX_KMH, PARAMS);
    expect(high.frequency).toBeGreaterThan(low.frequency);
    expect(high.cutoff).toBeGreaterThan(low.cutoff);
  });

  it('clamps out-of-range speed rather than extrapolating past the gear ceiling', () => {
    const over = computeEngineTone(GEAR_MAX_KMH[1] * 2, 2, GEAR_MAX_KMH, PARAMS);
    expect(over.frequency).toBeCloseTo(PARAMS.fBase[1]! + PARAMS.fRange, 5);
    const under = computeEngineTone(-50, 1, GEAR_MAX_KMH, PARAMS);
    expect(under.frequency).toBe(PARAMS.fBase[0]);
  });

  it('falls back to the first gear base for an out-of-range gear index', () => {
    expect(computeEngineTone(0, 99, GEAR_MAX_KMH, PARAMS).frequency).toBe(PARAMS.fBase[0]);
  });
});

describe('squealGain', () => {
  it('is silent whenever not skidding, regardless of magnitude', () => {
    expect(squealGain(false, 1, 0.35)).toBe(0);
    expect(squealGain(false, 0.5, 0.35)).toBe(0);
  });

  it('scales linearly with magnitude while skidding', () => {
    expect(squealGain(true, 1, 0.35)).toBeCloseTo(0.35, 5);
    expect(squealGain(true, 0.5, 0.35)).toBeCloseTo(0.175, 5);
    expect(squealGain(true, 0, 0.35)).toBe(0);
  });

  it('clamps an out-of-range magnitude rather than trusting the caller', () => {
    expect(squealGain(true, 1.5, 0.35)).toBeCloseTo(0.35, 5);
    expect(squealGain(true, -0.5, 0.35)).toBe(0);
  });
});
