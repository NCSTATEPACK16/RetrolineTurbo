import { describe, it, expect } from 'vitest';
import { computeEngineTone, squealGain, type EngineToneParams } from './engineTone.js';

const GEAR_MAX_KMH = [120, 290] as const;
const PARAMS: EngineToneParams = {
  fBaseLow: 90, fBaseHigh: 60, fRange: 260, filterMinHz: 400, filterMaxHz: 4000,
};

describe('computeEngineTone', () => {
  it('is fBase/filterMin at a dead stop in Low gear', () => {
    const tone = computeEngineTone(0, 1, GEAR_MAX_KMH, PARAMS);
    expect(tone.frequency).toBe(PARAMS.fBaseLow);
    expect(tone.cutoff).toBe(PARAMS.filterMinHz);
  });

  it('reaches fBase + fRange / filterMax at the Low gear cap', () => {
    const tone = computeEngineTone(GEAR_MAX_KMH[0], 1, GEAR_MAX_KMH, PARAMS);
    expect(tone.frequency).toBeCloseTo(PARAMS.fBaseLow + PARAMS.fRange, 5);
    expect(tone.cutoff).toBeCloseTo(PARAMS.filterMaxHz, 5);
  });

  it('uses the High-gear base, not Low, once shifted up', () => {
    const idle = computeEngineTone(0, 2, GEAR_MAX_KMH, PARAMS);
    expect(idle.frequency).toBe(PARAMS.fBaseHigh);
  });

  it('is monotonically increasing with speed within a gear', () => {
    const low = computeEngineTone(50, 2, GEAR_MAX_KMH, PARAMS);
    const high = computeEngineTone(150, 2, GEAR_MAX_KMH, PARAMS);
    expect(high.frequency).toBeGreaterThan(low.frequency);
    expect(high.cutoff).toBeGreaterThan(low.cutoff);
  });

  it('clamps out-of-range speed rather than extrapolating past the gear ceiling', () => {
    const over = computeEngineTone(GEAR_MAX_KMH[1] * 2, 2, GEAR_MAX_KMH, PARAMS);
    expect(over.frequency).toBeCloseTo(PARAMS.fBaseHigh + PARAMS.fRange, 5);
    const under = computeEngineTone(-50, 1, GEAR_MAX_KMH, PARAMS);
    expect(under.frequency).toBe(PARAMS.fBaseLow);
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
