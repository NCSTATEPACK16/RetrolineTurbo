import { describe, it, expect } from 'vitest';
import { isOffRoad, hitCar, responseDelta, shoveSign, ContactLatch } from './Collision.js';
import type { TrafficCar } from './Traffic.js';
import type { PlayerState } from '../types/engine.js';
import { CAR_COLLIDE_HALF_WIDTH } from '../constants.js';

const cfg = { roadWidth: 2000, segmentLength: 200, carHalfWidthPx: CAR_COLLIDE_HALF_WIDTH };
const player: PlayerState = {
  z: 1000, x: 0, speed: 100, gear: 1, steer: 0, skidding: false, skidMagnitude: 0, braking: false,
};

describe('Collision', () => {
  it('flags off-road past the road half-width', () => {
    expect(isOffRoad(2100, 2000)).toBe(true);
    expect(isOffRoad(-100, 2000)).toBe(false);
  });
  it('detects a car overlapping in z and lateral offset', () => {
    const cars: TrafficCar[] = [{ z: 1010, offset: 0, speed: 50, sprite: 'car0', variant: 0 }];
    expect(hitCar(player, cars, cfg)).toBe(cars[0]);
  });
  it('misses a car in a different lane', () => {
    const cars: TrafficCar[] = [{ z: 1010, offset: 0.9, speed: 50, sprite: 'car0', variant: 0 }];
    expect(hitCar(player, cars, cfg)).toBeNull();
  });
  it('misses a car far away in z', () => {
    const cars: TrafficCar[] = [{ z: 5000, offset: 0, speed: 50, sprite: 'car0', variant: 0 }];
    expect(hitCar(player, cars, cfg)).toBeNull();
  });
  it('response slows and does not push when only off-road', () => {
    const d = responseDelta({ offRoad: true, hit: false });
    expect(d.speedFactor).toBeLessThan(1);
    expect(d.xPush).toBe(0);
  });
  it('response slows harder and pushes on a car hit', () => {
    const d = responseDelta({ offRoad: false, hit: true });
    expect(d.speedFactor).toBeLessThan(0.9);
    expect(Math.abs(d.xPush)).toBeGreaterThan(0);
  });
});

describe('Collision geometry + contact latch (bug: unavoidable, repeating hits)', () => {
  it('leaves a passable gap between adjacent lanes', () => {
    // A hitbox wider than the lane spacing makes traffic impossible to thread:
    // every car in the neighbouring lane registers as a hit from dead centre.
    const cars: TrafficCar[] = [{ z: 1010, offset: 0.4, speed: 50, sprite: 'car0', variant: 0 }];
    expect(hitCar(player, cars, cfg)).toBeNull();
  });

  it('still hits a car squarely in the player lane', () => {
    const cars: TrafficCar[] = [{ z: 1010, offset: 0.1, speed: 50, sprite: 'car0', variant: 0 }];
    expect(hitCar(player, cars, cfg)).toBe(cars[0]);
  });

  it('shoves the player away from the car it hit, not toward the road centre', () => {
    expect(shoveSign(300, -500)).toBe(1);  // car on our left -> pushed right
    expect(shoveSign(300, 900)).toBe(-1);  // car on our right -> pushed left
  });

  it('splits an exact overlap deterministically instead of returning 0', () => {
    expect(Math.abs(shoveSign(100, 100))).toBe(1);
  });

  it('fires once per contact, not once per step while overlapping', () => {
    const latch = new ContactLatch();
    const car: TrafficCar = { z: 1010, offset: 0, speed: 50, sprite: 'car0', variant: 0 };
    expect(latch.enter(car)).toBe(true);  // first frame of contact
    expect(latch.enter(car)).toBe(false); // still touching the same car
    expect(latch.enter(car)).toBe(false);
    latch.enter(null);                    // separated
    expect(latch.enter(car)).toBe(true);  // a genuine second bump
  });

  it('treats a different car as a new contact', () => {
    const latch = new ContactLatch();
    const a: TrafficCar = { z: 1010, offset: 0, speed: 50, sprite: 'car0', variant: 0 };
    const b: TrafficCar = { z: 1020, offset: 0.1, speed: 50, sprite: 'car1', variant: 1 };
    expect(latch.enter(a)).toBe(true);
    expect(latch.enter(b)).toBe(true);
  });
});
