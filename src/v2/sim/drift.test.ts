import { describe, it, expect } from 'vitest';
import { DEFAULT_STATS, DRIVE_TUNING, driftTier, statsToParams, tierBoost } from './car.js';
import { Button, STEER_MAX, type InputFrame } from './input.js';
import { buildSimTrack } from './track.js';
import { createWorld, stepWorld, type SimWorld } from './world.js';

const bend = buildSimTrack({ name: 'bend', halfWidth: 9, sections: [{ length: 4000, curvature: 0.004 }] });
/** A proper corner: a moderate steer into the drift holds the road here for seconds. */
const corner = buildSimTrack({ name: 'corner', halfWidth: 9, sections: [{ length: 4000, curvature: 0.012 }] });
const T = DRIVE_TUNING;

function cruising(miniTurbo = 5): SimWorld {
  const w = createWorld(1, [statsToParams({ ...DEFAULT_STATS, miniTurbo })]);
  w.cars[0]!.speed = 30;
  return w;
}
const frame = (steer: number, buttons: number): InputFrame => ({ steer: Math.round(steer * STEER_MAX), buttons });
const run = (w: SimWorld, input: InputFrame, seconds: number, track = bend) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepWorld(w, track, [input]);
};

describe('hop-drift', () => {
  it('tapping drift while steering hops into a drift toward that side', () => {
    const w = cruising();
    run(w, frame(0.8, Button.Throttle | Button.Drift), 1 / 60);
    expect(w.cars[0]!.drift).toBe(1);
    expect(w.cars[0]!.hop).toBeGreaterThan(0);
    const l = cruising();
    run(l, frame(-0.8, Button.Throttle | Button.Drift), 1 / 60);
    expect(l.cars[0]!.drift).toBe(-1);
  });

  it('hopping without steering is just a hop', () => {
    const w = cruising();
    run(w, frame(0, Button.Throttle | Button.Drift), 0.1);
    expect(w.cars[0]!.drift).toBe(0);
  });

  it('cannot drift from a crawl', () => {
    const w = cruising();
    w.cars[0]!.speed = 5;
    run(w, frame(1, Button.Throttle | Button.Drift), 0.1);
    expect(w.cars[0]!.drift).toBe(0);
  });

  it('charges faster when steering into the drift', () => {
    const hard = cruising();
    run(hard, frame(1, Button.Throttle | Button.Drift), 1);
    const soft = cruising();
    run(soft, frame(1, Button.Throttle | Button.Drift), 1 / 60);
    run(soft, frame(-0.5, Button.Throttle | Button.Drift), 1);
    expect(hard.cars[0]!.driftCharge).toBeGreaterThan(soft.cars[0]!.driftCharge * 1.5);
  });

  it.each([
    [0.5, 0], [1.0, 1], [2.0, 2], [3.0, 3],
  ])('holding %ss reaches tier %i and the release boosts accordingly', (seconds, tier) => {
    const w = cruising();
    run(w, frame(1, Button.Throttle | Button.Drift), 1 / 60, corner);
    run(w, frame(0.3, Button.Throttle | Button.Drift), seconds - 1 / 60, corner);
    expect(Math.abs(w.cars[0]!.x)).toBeLessThan(9); // still on the road
    expect(driftTier(w.cars[0]!.driftCharge)).toBe(tier);
    run(w, frame(0, Button.Throttle), 1 / 60, corner);
    expect(w.cars[0]!.drift).toBe(0);
    expect(w.cars[0]!.boostTime).toBeCloseTo(Math.max(0, tierBoost(tier) * w.params[0]!.miniTurbo - 1 / 60), 2);
  });

  it('braking out of a drift throws the charge away', () => {
    const w = cruising();
    run(w, frame(1, Button.Throttle | Button.Drift), 1 / 60, corner);
    run(w, frame(0.3, Button.Throttle | Button.Drift), 2, corner);
    run(w, frame(0.3, Button.Drift | Button.Brake), 1 / 60, corner);
    expect(w.cars[0]!.drift).toBe(0);
    expect(w.cars[0]!.boostTime).toBe(0);
  });

  it('a better mini-turbo stat boosts for longer', () => {
    const lo = cruising(2);
    const hi = cruising(9);
    for (const w of [lo, hi]) {
      run(w, frame(1, Button.Throttle | Button.Drift), 1 / 60, corner);
      run(w, frame(0.3, Button.Throttle | Button.Drift), 3, corner);
      run(w, frame(0, Button.Throttle), 1 / 60, corner);
    }
    expect(hi.cars[0]!.boostTime).toBeGreaterThan(lo.cars[0]!.boostTime);
  });

  it('a boost takes you past normal top speed, then settles back', () => {
    const w = cruising();
    w.cars[0]!.speed = w.params[0]!.topSpeed;
    w.cars[0]!.boostTime = 1.5;
    run(w, frame(0, Button.Throttle), 1.4);
    expect(w.cars[0]!.speed).toBeGreaterThan(w.params[0]!.topSpeed * 1.05);
    run(w, frame(0, Button.Throttle), 4);
    expect(w.cars[0]!.speed).toBeLessThan(w.params[0]!.topSpeed * 1.01);
  });

  it('holds a tighter line through a bend than steering alone', () => {
    const drift = cruising();
    run(drift, frame(0.5, Button.Throttle | Button.Drift), 3);
    const grip = cruising();
    run(grip, frame(0.5, Button.Throttle), 3);
    // Positive curvature pushes cars left (negative x); the drifting car stays further inside.
    expect(drift.cars[0]!.x).toBeGreaterThan(grip.cars[0]!.x);
  });

  it('tiers are ordered', () => {
    expect(T.tierBlue).toBeLessThan(T.tierOrange);
    expect(T.tierOrange).toBeLessThan(T.tierPurple);
    expect(tierBoost(1)).toBeLessThan(tierBoost(2));
    expect(tierBoost(2)).toBeLessThan(tierBoost(3));
  });
});
