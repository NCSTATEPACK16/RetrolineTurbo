import { describe, it, expect } from 'vitest';
import { Traffic, type TrafficCar } from './Traffic.js';

const mk = (over: Partial<TrafficCar> = {}): TrafficCar => ({ z: 0, offset: 0, speed: 100, sprite: 'car0', ...over });

describe('Traffic', () => {
  it('advances each car by speed*dt', () => {
    const t = new Traffic([mk({ z: 10, speed: 100 })], 10000);
    t.update(0.5);
    expect(t.cars[0]!.z).toBe(60);
  });
  it('wraps z modulo the track length', () => {
    const t = new Traffic([mk({ z: 9990, speed: 100 })], 10000);
    t.update(1); // 9990 + 100 = 10090 → 90
    expect(t.cars[0]!.z).toBeCloseTo(90);
  });
  it('is deterministic across identical update scripts', () => {
    const script = (t: Traffic) => { for (let i = 0; i < 100; i++) t.update(1 / 60); };
    const a = new Traffic([mk({ z: 0, speed: 137 })], 10000); script(a);
    const b = new Traffic([mk({ z: 0, speed: 137 })], 10000); script(b);
    expect(a.cars[0]!.z).toBe(b.cars[0]!.z);
  });
});
