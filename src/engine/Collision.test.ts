import { describe, it, expect } from 'vitest';
import { isOffRoad, hitCar, responseDelta } from './Collision.js';
import type { TrafficCar } from './Traffic.js';
import type { PlayerState } from '../types/engine.js';

const cfg = { roadWidth: 2000, segmentLength: 200, carHalfWidthPx: 900 };
const player: PlayerState = { z: 1000, x: 0, speed: 100, gear: 1 };

describe('Collision', () => {
  it('flags off-road past the road half-width', () => {
    expect(isOffRoad(2100, 2000)).toBe(true);
    expect(isOffRoad(-100, 2000)).toBe(false);
  });
  it('detects a car overlapping in z and lateral offset', () => {
    const cars: TrafficCar[] = [{ z: 1010, offset: 0, speed: 50, sprite: 'car0' }];
    expect(hitCar(player, cars, cfg)).toBe(cars[0]);
  });
  it('misses a car in a different lane', () => {
    const cars: TrafficCar[] = [{ z: 1010, offset: 0.9, speed: 50, sprite: 'car0' }];
    expect(hitCar(player, cars, cfg)).toBeNull();
  });
  it('misses a car far away in z', () => {
    const cars: TrafficCar[] = [{ z: 5000, offset: 0, speed: 50, sprite: 'car0' }];
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
