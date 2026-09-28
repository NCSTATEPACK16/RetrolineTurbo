import { describe, it, expect } from 'vitest';
import { COINS, coinTopSpeed, createCoins, stepCoins } from './coins.js';
import { buildSimTrack } from './track.js';
import { createWorld } from './world.js';

const track = buildSimTrack({ name: 't', halfWidth: 9, sections: [{ length: 1000, curvature: 0 }] });

describe('coins', () => {
  it('lays coins out along each line, inside the road', () => {
    const w = createWorld(1);
    const st = createCoins(track, [{ s: 100, x: -20, count: 5, spacing: 6 }], w);
    expect(Array.from(st.s)).toEqual([100, 106, 112, 118, 124]);
    for (const x of st.x) expect(Math.abs(x)).toBeLessThan(9);
  });

  it('are picked up by driving through them, then come back', () => {
    const w = createWorld(2);
    const st = createCoins(track, [{ s: 100, x: 0, count: 1, spacing: 1 }], w);
    const spin = new Float64Array(2);
    w.cars[0]!.s = 100; w.cars[0]!.x = 0.5;
    w.cars[1]!.s = 300;
    stepCoins(st, w, track, spin, 1 / 60);
    expect(st.held[0]).toBe(1);
    expect(st.collected[0]).toBe(1);
    expect(st.held[1]).toBe(0);
    expect(st.respawn[0]).toBeGreaterThan(0);
    for (let t = 0; t < COINS.respawn * 60 + 2; t++) { w.cars[0]!.s = 500; stepCoins(st, w, track, spin, 1 / 60); }
    expect(st.respawn[0]).toBe(0);
  });

  it('give a small top-speed buff that stops at the cap and never compounds', () => {
    const w = createWorld(1);
    const base = w.params[0]!.topSpeed;
    const st = createCoins(track, [{ s: 100, x: 0, count: 15, spacing: 3 }], w);
    const spin = new Float64Array(1);
    for (let s = 90; s < 160; s += 0.5) { w.cars[0]!.s = s; stepCoins(st, w, track, spin, 1 / 60); }
    expect(st.held[0]).toBe(COINS.max);
    expect(st.collected[0]).toBe(15);
    expect(w.params[0]!.topSpeed).toBeCloseTo(coinTopSpeed(base, COINS.max), 9);
    expect(w.params[0]!.topSpeed / base).toBeLessThanOrEqual(1 + COINS.speedPerCoin * COINS.max + 1e-12);
  });

  it('a spin-out drops some coins', () => {
    const w = createWorld(1);
    const st = createCoins(track, [], w);
    st.held[0] = 8;
    const spin = new Float64Array([1]);
    stepCoins(st, w, track, spin, 1 / 60);
    stepCoins(st, w, track, spin, 1 / 60); // still spinning: only the first tick costs
    expect(st.held[0]).toBe(8 - COINS.lostOnSpin);
  });
});
