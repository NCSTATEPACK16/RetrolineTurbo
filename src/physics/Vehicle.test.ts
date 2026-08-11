import { describe, it, expect } from 'vitest';
import { Vehicle, createCommand, type Command } from './Vehicle.js';
import { STEP_S, GEAR_MAX_KMH, SKID_GRIP, SKID_RECOVERY_STEPS } from '../constants.js';
import type { PlayerState } from '../types/engine.js';

const ROAD = 2000;

/** Run `n` fixed steps with a mutator applied to a pre-allocated command. */
function run(v: Vehicle, n: number, set: (c: Command) => void, curvature = 0): void {
  const cmd = createCommand();
  for (let i = 0; i < n; i++) {
    cmd.throttle = 0; cmd.brake = 0; cmd.steer = 0;
    cmd.handbrake = false; cmd.gearUp = false; cmd.gearDown = false; cmd.nitro = false;
    set(cmd);
    v.step(cmd, curvature, STEP_S);
  }
}

function shiftUp(v: Vehicle): void {
  const cmd = createCommand();
  cmd.gearUp = true;
  v.step(cmd, 0, STEP_S);
}

describe('Vehicle transmission + top speed', () => {
  it('starts in Low gear at rest, implementing PlayerState', () => {
    const v = new Vehicle(ROAD);
    expect(v.gear).toBe(1);
    expect(v.speed).toBe(0);
    expect(v.z).toBe(0);
    expect(v.x).toBe(0);
  });

  it('Low gear caps near 120 km/h under full throttle', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 60, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBeLessThanOrEqual(GEAR_MAX_KMH[0]);
    expect(v.speedKmh).toBeGreaterThan(GEAR_MAX_KMH[0] * 0.95);
  });

  it('High gear caps at 290 km/h under full throttle', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    shiftUp(v);
    expect(v.gear).toBe(2);
    run(v, 60 * 120, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBeLessThanOrEqual(GEAR_MAX_KMH[1]);
    expect(v.speedKmh).toBeGreaterThan(GEAR_MAX_KMH[1] * 0.95);
  });

  it('gearDown above the Low cap decays speed toward the Low cap', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    shiftUp(v);
    run(v, 60 * 60, (c) => { c.throttle = 1; });
    const cmd = createCommand();
    cmd.gearDown = true;
    v.step(cmd, 0, STEP_S);
    expect(v.gear).toBe(1);
    const before = v.speedKmh;
    run(v, 60 * 5, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBeLessThan(before);
  });

  it('brakes decelerate to a stop', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 10, (c) => { c.throttle = 1; });
    run(v, 60 * 10, (c) => { c.brake = 1; });
    expect(v.speedKmh).toBe(0);
  });
});

describe('Vehicle skid + recovery (PRD: grip −60%)', () => {
  /** Drive to High-gear speed above the skid threshold, on a straight. */
  function fastVehicle(): Vehicle {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    shiftUp(v);
    run(v, 60 * 60, (c) => { c.throttle = 1; });
    return v;
  }

  it('does not skid below the curve threshold', () => {
    const v = fastVehicle();
    run(v, 10, (c) => { c.throttle = 1; }, 0.2);
    expect(v.skidding).toBe(false);
  });

  it('triggers a skid on sharp curvature at high speed, and cuts steering to 40%', () => {
    const gripped = fastVehicle();
    const x0 = gripped.x;
    run(gripped, 1, (c) => { c.steer = 1; }, 0);
    const grippedDx = gripped.x - x0;

    const skidder = fastVehicle();
    run(skidder, 1, (c) => { c.throttle = 1; }, 0.6); // trigger
    expect(skidder.skidding).toBe(true);
    const x1 = skidder.x;
    run(skidder, 1, (c) => { c.steer = 1; }, 0);
    const skidDx = skidder.x - x1;
    expect(skidDx / grippedDx).toBeCloseTo(SKID_GRIP, 1);
  });

  it('recovers after sustained throttle-release + counter-steer, not while accelerating', () => {
    const v = fastVehicle();
    run(v, 1, (c) => { c.throttle = 1; }, 0.6);
    expect(v.skidding).toBe(true);
    run(v, SKID_RECOVERY_STEPS + 2, (c) => { c.throttle = 1; c.steer = 1; }, 0);
    expect(v.skidding).toBe(true); // throttle held → no recovery
    run(v, SKID_RECOVERY_STEPS + 2, (c) => { c.steer = 1; }, 0);
    expect(v.skidding).toBe(false); // released + counter-steer → recovered
  });

  it('bleeds speed while skidding', () => {
    const v = fastVehicle();
    run(v, 1, (c) => { c.throttle = 1; }, 0.6);
    const before = v.speedKmh;
    run(v, 60, () => {}, 0);
    expect(v.speedKmh).toBeLessThan(before);
  });
});

describe('Vehicle off-road drag (PRD: μ = 0.85)', () => {
  it('follows the branch road: no bleed when roadCenterX tracks the diverged road', () => {
    const mk = (): Vehicle => {
      const v = new Vehicle(ROAD);
      run(v, 60 * 10, (c) => { c.throttle = 1; });
      v.translate(0, 5000); // parked on a fully diverged branch road centre
      return v;
    };
    const onBranch = mk();
    const centreRef = mk();
    const before = onBranch.speedKmh;
    const cmd = createCommand();
    for (let i = 0; i < 60; i++) {
      cmd.throttle = 0; cmd.brake = 0; cmd.steer = 0;
      onBranch.step(cmd, 0, STEP_S, 5000); // branch-aware: on the road
      centreRef.step(cmd, 0, STEP_S, 0); // centre-relative: reads as off-road
    }
    expect(onBranch.speedKmh / before).toBeGreaterThan(centreRef.speedKmh / before);
  });

  it('bleeds speed off-road faster than the same coast on-road', () => {
    const on = new Vehicle(ROAD);
    run(on, 60 * 10, (c) => { c.throttle = 1; });
    const off = new Vehicle(ROAD);
    run(off, 60 * 10, (c) => { c.throttle = 1; });
    run(off, 60 * 3, (c) => { c.steer = 1; }); // drive off the shoulder
    expect(Math.abs(off.x)).toBeGreaterThan(ROAD);

    const onBefore = on.speedKmh;
    const offBefore = off.speedKmh;
    run(on, 60, () => {});
    run(off, 60, () => {});
    expect(off.speedKmh / offBefore).toBeLessThan(on.speedKmh / onBefore);
  });
});

describe('Vehicle centrifugal + collision response + determinism', () => {
  it('curvature pushes the car laterally opposite the curve at speed', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    const x0 = v.x;
    run(v, 60, (c) => { c.throttle = 1; }, 0.3);
    expect(v.x).toBeLessThan(x0); // positive curve → pushed negative-x
  });

  it('applyCollision scales speed and shoves laterally', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 10, (c) => { c.throttle = 1; });
    const s = v.speedKmh;
    v.applyCollision(0.6, -150);
    expect(v.speedKmh).toBeCloseTo(s * 0.6);
    expect(v.x).toBeCloseTo(-150);
  });

  it('identical input scripts produce identical state (hard rule 3)', () => {
    const script = (v: Vehicle): void => {
      run(v, 600, (c) => { c.throttle = 1; }, 0.1);
      const cmd = createCommand(); cmd.gearUp = true; v.step(cmd, 0.1, STEP_S);
      run(v, 600, (c) => { c.throttle = 0.7; c.steer = 0.4; }, -0.5);
      run(v, 300, (c) => { c.brake = 0.5; }, 0);
    };
    const a = new Vehicle(ROAD); script(a);
    const b = new Vehicle(ROAD); script(b);
    expect(a.z).toBe(b.z);
    expect(a.x).toBe(b.x);
    expect(a.speedKmh).toBe(b.speedKmh);
    expect(a.gear).toBe(b.gear);
    expect(a.skidding).toBe(b.skidding);
  });

  it('translate shifts the world frame without disturbing determinism', () => {
    // Keep both cars on the road throughout: off-road drag reads |x|, so a
    // shift that crosses the shoulder legitimately changes the trajectory.
    const a = new Vehicle(ROAD);
    const b = new Vehicle(ROAD);
    run(a, 300, (c) => { c.throttle = 1; c.steer = 0.1; });
    run(b, 300, (c) => { c.throttle = 1; c.steer = 0.1; });
    b.translate(-5000, -100); // scene hand-off shift on b only
    const az0 = a.z, ax0 = a.x;
    const bz0 = b.z, bx0 = b.x;
    run(a, 300, (c) => { c.throttle = 1; c.steer = -0.2; });
    run(b, 300, (c) => { c.throttle = 1; c.steer = -0.2; });
    expect(Math.abs(a.x)).toBeLessThan(ROAD); // premise: both stayed on-road
    expect(Math.abs(b.x)).toBeLessThan(ROAD);
    expect(b.z - bz0).toBeCloseTo(a.z - az0, 9); // identical deltas after the shift
    expect(b.x - bx0).toBeCloseTo(a.x - ax0, 9);
    expect(b.speedKmh).toBe(a.speedKmh);
  });

  it('reset returns to the initial state', () => {
    const v = new Vehicle(ROAD);
    run(v, 120, (c) => { c.throttle = 1; c.steer = 0.5; });
    v.reset();
    expect(v.z).toBe(0); expect(v.x).toBe(0); expect(v.speedKmh).toBe(0);
    expect(v.gear).toBe(1); expect(v.skidding).toBe(false);
  });
});

describe('PlayerState steer + skid view', () => {
  it('exposes steer and skid state through the read-only PlayerState view', () => {
    const v = new Vehicle(ROAD);
    const state: PlayerState = v; // must typecheck
    expect(typeof state.steer).toBe('number');
    expect(state.steer).toBeGreaterThanOrEqual(-1);
    expect(state.steer).toBeLessThanOrEqual(1);
    expect(typeof state.skidding).toBe('boolean');
  });

  it('reports the steer the driver actually applied', () => {
    const v = new Vehicle(ROAD);
    run(v, 10, (c) => { c.throttle = 1; c.steer = 0.75; });
    expect(v.steer).toBeCloseTo(0.75, 5);
    run(v, 10, (c) => { c.throttle = 1; c.steer = -1; });
    expect(v.steer).toBe(-1);
  });

  it('clamps out-of-range steer, because the sprite selector indexes on it', () => {
    const v = new Vehicle(ROAD);
    run(v, 5, (c) => { c.steer = 4; });
    expect(v.steer).toBe(1);
    run(v, 5, (c) => { c.steer = -4; });
    expect(v.steer).toBe(-1);
  });

  it('holds the last steer across a translate, which only shifts world space', () => {
    const v = new Vehicle(ROAD);
    run(v, 5, (c) => { c.throttle = 1; c.steer = 0.5; });
    v.translate(100, 10);
    expect(v.steer).toBeCloseTo(0.5, 5);
  });
});
