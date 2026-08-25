import { describe, it, expect } from 'vitest';
import { applyTuning, resolveTuning, DEFAULT_TUNING } from './tuning.js';
import { DEFAULT_VEHICLE_PARAMS, Vehicle, createCommand } from './Vehicle.js';
import {
  TORQUE_SHAPE, BOG_FACTOR, SKID_CURVE_THRESHOLD, STEER_RATE_PER_S, MU_OFFROAD,
} from '../constants.js';

describe('applyTuning', () => {
  it('returns the base params unchanged when there are no overrides', () => {
    expect(applyTuning(DEFAULT_VEHICLE_PARAMS, {})).toEqual(DEFAULT_VEHICLE_PARAMS);
  });

  it('overrides only the named field', () => {
    const out = applyTuning(DEFAULT_VEHICLE_PARAMS, { centrifugal: 999 });
    expect(out.centrifugal).toBe(999);
    expect(out.gearMaxKmh).toEqual(DEFAULT_VEHICLE_PARAMS.gearMaxKmh);
  });

  it('never mutates the base object', () => {
    const before = { ...DEFAULT_VEHICLE_PARAMS };
    applyTuning(DEFAULT_VEHICLE_PARAMS, { centrifugal: 1 });
    expect(DEFAULT_VEHICLE_PARAMS).toEqual(before);
  });
});

describe('resolveTuning', () => {
  it('fills every unset field from the shipped constant', () => {
    expect(resolveTuning({})).toEqual({
      torqueShape: TORQUE_SHAPE,
      bogFactor: BOG_FACTOR,
      skidCurveThreshold: SKID_CURVE_THRESHOLD,
      steerRatePerS: STEER_RATE_PER_S,
      muOffroad: MU_OFFROAD,
    });
  });

  it('is the identity on DEFAULT_TUNING — an empty override is the stock car', () => {
    expect(resolveTuning({})).toEqual(DEFAULT_TUNING);
  });

  it('keeps an override of 0, which ?? must not swallow', () => {
    // The bug a `||` here would introduce: bogFactor 0 is a meaningful setting
    // (no torque at all below the band) and must survive.
    expect(resolveTuning({ bogFactor: 0 }).bogFactor).toBe(0);
    expect(resolveTuning({ skidCurveThreshold: 0 }).skidCurveThreshold).toBe(0);
  });

  it('overrides only the named field', () => {
    const out = resolveTuning({ muOffroad: 0.5 });
    expect(out.muOffroad).toBe(0.5);
    expect(out.torqueShape).toBe(TORQUE_SHAPE);
  });
});

describe('Vehicle tunables', () => {
  const ROAD = 2000;
  const run = (v: Vehicle, steps: number, fill: (c: ReturnType<typeof createCommand>) => void,
    curvature = 0): void => {
    const cmd = createCommand();
    for (let i = 0; i < steps; i++) {
      Object.assign(cmd, createCommand());
      fill(cmd);
      v.step(cmd, curvature);
    }
  };

  it('an empty override drives identically to the stock car', () => {
    const stock = new Vehicle(ROAD);
    const tuned = new Vehicle(ROAD, DEFAULT_VEHICLE_PARAMS, {});
    run(stock, 300, (c) => { c.throttle = 1; c.steer = 0.5; }, 0.002);
    run(tuned, 300, (c) => { c.throttle = 1; c.steer = 0.5; }, 0.002);
    expect(tuned.speedKmh).toBe(stock.speedKmh);
    expect(tuned.x).toBe(stock.x);
    expect(tuned.z).toBe(stock.z);
  });

  it('bogFactor 0 kills acceleration below the band floor', () => {
    // Gear 2 floors at 70 km/h; from rest, a zero bog factor means no torque.
    const v = new Vehicle(ROAD, DEFAULT_VEHICLE_PARAMS, { bogFactor: 0 });
    run(v, 60, (c) => { c.throttle = 1; c.gearUp = true; });
    run(v, 120, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBe(0);
  });

  it('steerRatePerS changes how fast steering commits', () => {
    const slow = new Vehicle(ROAD, DEFAULT_VEHICLE_PARAMS, { steerRatePerS: 0.5 });
    const fast = new Vehicle(ROAD, DEFAULT_VEHICLE_PARAMS, { steerRatePerS: 100 });
    run(slow, 60, (c) => { c.throttle = 1; c.steer = 1; });
    run(fast, 60, (c) => { c.throttle = 1; c.steer = 1; });
    expect(Math.abs(fast.x)).toBeGreaterThan(Math.abs(slow.x));
  });

  it('setTunables swaps the surface live without resetting the car', () => {
    const v = new Vehicle(ROAD);
    run(v, 120, (c) => { c.throttle = 1; });
    const speedBefore = v.speedKmh;
    const zBefore = v.z;
    v.setTunables(DEFAULT_VEHICLE_PARAMS, { centrifugal: 4000 });
    expect(v.speedKmh).toBe(speedBefore); // the whole point: no reset mid-drive
    expect(v.z).toBe(zBefore);
  });

  it('setTunables centrifugal takes effect on the next step', () => {
    // Measured against a stock control car in the same state, not a magic
    // number: the per-step shove is a few tenths of a world unit at first-gear
    // speed, so an absolute threshold would only encode today's constants.
    const shove = (override?: number): number => {
      const v = new Vehicle(ROAD);
      run(v, 300, (c) => { c.throttle = 1; }, 0.002);
      const xBefore = v.x;
      if (override !== undefined) v.setTunables(DEFAULT_VEHICLE_PARAMS, { centrifugal: override });
      run(v, 1, (c) => { c.throttle = 1; }, 0.002);
      return Math.abs(v.x - xBefore);
    };
    // 100x the stock centrifugal should shove ~100x as hard on the very next step.
    expect(shove(60_000)).toBeGreaterThan(shove() * 50);
  });
});
