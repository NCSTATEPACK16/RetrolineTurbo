import { describe, it, expect } from 'vitest';
import { Traffic, type TrafficCar } from './Traffic.js';

const mk = (over: Partial<TrafficCar> = {}): TrafficCar => ({ z: 0, offset: 0, speed: 100, sprite: 'car0', variant: 0, ...over });

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
  it('rescope shifts cars with the player and wraps into the new track length', () => {
    const t = new Traffic([mk({ z: 125_000 }), mk({ z: 500 })], 130_000);
    t.rescope(-122_000, 130_000); // scene hand-off: same shift the vehicle got
    expect(t.cars[0]!.z).toBe(3000);
    expect(t.cars[1]!.z).toBe(8500); // 500 − 122000 wraps into the new scene
    t.update(1);
    expect(t.cars[0]!.z).toBe(3100); // wrap length updated (no early wrap)
  });

  it('returns no overtakes on the first call — it only takes a baseline', () => {
    const t = new Traffic([mk({ z: 100 })], 10000);
    expect(t.countOvertakes(500)).toBe(0); // car already behind at boot: not a pass
  });

  it('counts a car that falls from ahead of the player to behind it', () => {
    const t = new Traffic([mk({ z: 600 })], 10000);
    t.countOvertakes(500);
    expect(t.countOvertakes(700)).toBe(1);
  });

  it('does not count the same car twice while it stays behind', () => {
    const t = new Traffic([mk({ z: 600 })], 10000);
    t.countOvertakes(500);
    t.countOvertakes(700);
    expect(t.countOvertakes(900)).toBe(0);
  });

  it('ignores the sign flip when a car wraps past the end of the track', () => {
    const t = new Traffic([mk({ z: 9900 })], 10000);
    t.countOvertakes(500); // delta +9400: car far ahead
    t.cars[0]!.z = 100; // wrapped to the start — now "behind", but never passed
    expect(t.countOvertakes(500)).toBe(0);
  });

  it('counts each of several cars passed in the same step', () => {
    const t = new Traffic([mk({ z: 600 }), mk({ z: 650 }), mk({ z: 5000 })], 10000);
    t.countOvertakes(500);
    expect(t.countOvertakes(700)).toBe(2);
  });

  it('is deterministic across identical update scripts', () => {
    const script = (t: Traffic) => { for (let i = 0; i < 100; i++) t.update(1 / 60); };
    const a = new Traffic([mk({ z: 0, speed: 137 })], 10000); script(a);
    const b = new Traffic([mk({ z: 0, speed: 137 })], 10000); script(b);
    expect(a.cars[0]!.z).toBe(b.cars[0]!.z);
  });
});
