import { describe, it, expect } from 'vitest';
import { emptyLoadout } from '../types/inventory.js';
import { PART_CATALOG, tradeoffMod } from './partCurves.js';
import { BASELINE_METRICS, METRIC_MAX, METRIC_MIN, metricsToParams, resolveMetrics } from './Garage.js';
import { DEFAULT_VEHICLE_PARAMS } from '../physics/Vehicle.js';

describe('resolveMetrics', () => {
  it('an empty loadout is the 50/100 baseline', () => {
    expect(resolveMetrics(emptyLoadout())).toEqual(BASELINE_METRICS);
  });

  it('sums the equipped parts mods', () => {
    const m = resolveMetrics({ ...emptyLoadout(), engine: 'engine-20', wheels: 'wheels-20' });
    expect(m.speed).toBe(50 + 36 + tradeoffMod(20)); // engine primary, wheels trade-off
    expect(m.handling).toBe(50 + tradeoffMod(20)); // engine trade-off
    expect(m.grip).toBe(50 + 36); // wheels primary
    expect(m.accel).toBe(50);
  });

  it('ignores unknown part ids rather than throwing', () => {
    expect(resolveMetrics({ ...emptyLoadout(), engine: 'engine-99' })).toEqual(BASELINE_METRICS);
  });

  it('clamps to the metric bounds', () => {
    const wild = [
      { ...PART_CATALOG[0]!, id: 'x', category: 'engine' as const, speedMod: 500, handlingMod: -500 },
    ];
    const m = resolveMetrics({ ...emptyLoadout(), engine: 'x' }, wild);
    expect(m.speed).toBe(METRIC_MAX);
    expect(m.handling).toBe(METRIC_MIN);
  });
});

describe('metricsToParams', () => {
  it('the baseline reproduces the stock vehicle params', () => {
    const p = metricsToParams(BASELINE_METRICS);
    expect(p.gearMaxKmh[0]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearMaxKmh[0], 9);
    expect(p.gearMaxKmh[1]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearMaxKmh[1], 9);
    expect(p.gearAccelKmhS[0]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearAccelKmhS[0], 9);
    expect(p.gearAccelKmhS[1]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearAccelKmhS[1], 9);
    expect(p.steerMaxWps).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.steerMaxWps, 9);
    expect(p.centrifugal).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.centrifugal, 9);
  });

  it('more speed raises the gear ceilings; more grip lowers centrifugal push', () => {
    const fast = metricsToParams({ ...BASELINE_METRICS, speed: 95 });
    const grippy = metricsToParams({ ...BASELINE_METRICS, grip: 95 });
    expect(fast.gearMaxKmh[1]).toBeGreaterThan(DEFAULT_VEHICLE_PARAMS.gearMaxKmh[1]);
    expect(grippy.centrifugal).toBeLessThan(DEFAULT_VEHICLE_PARAMS.centrifugal);
  });

  it('keeps a maxed car inside a readable envelope', () => {
    expect(metricsToParams({ ...BASELINE_METRICS, speed: METRIC_MAX }).gearMaxKmh[1]).toBeLessThan(400);
  });
});
