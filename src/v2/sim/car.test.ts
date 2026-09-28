import { describe, it, expect } from 'vitest';
import { DEFAULT_STATS, STAT_KEYS, statsToParams, type CarStats } from './car.js';
import { Button, type InputFrame } from './input.js';
import { buildSimTrack } from './track.js';
import { createWorld, stepWorld, type SimWorld } from './world.js';

const straight = buildSimTrack({ name: 'drag strip', halfWidth: 9, sections: [{ length: 5000, curvature: 0 }] });
const with_ = (k: keyof CarStats, v: number): CarStats => ({ ...DEFAULT_STATS, [k]: v });

describe('stats to params', () => {
  it('maps every stat in the direction its name promises', () => {
    const lo = (k: keyof CarStats) => statsToParams(with_(k, 2));
    const hi = (k: keyof CarStats) => statsToParams(with_(k, 9));
    expect(hi('speed').topSpeed).toBeGreaterThan(lo('speed').topSpeed);
    expect(hi('accel').accel).toBeGreaterThan(lo('accel').accel);
    expect(hi('handling').lateralSpeed).toBeGreaterThan(lo('handling').lateralSpeed);
    expect(hi('handling').centrifugal).toBeLessThan(lo('handling').centrifugal);
    expect(hi('weight').mass).toBeGreaterThan(lo('weight').mass);
    expect(hi('weight').accel).toBeLessThan(lo('weight').accel); // heavy cars are slower off the line
    expect(hi('offroad').offroadCap).toBeGreaterThan(lo('offroad').offroadCap);
    expect(hi('miniTurbo').miniTurbo).toBeGreaterThan(lo('miniTurbo').miniTurbo);
  });

  it('clamps stats to 1..10', () => {
    for (const k of STAT_KEYS) {
      expect(statsToParams(with_(k, 99))).toEqual(statsToParams(with_(k, 10)));
      expect(statsToParams(with_(k, -3))).toEqual(statsToParams(with_(k, 1)));
    }
  });

  it('keeps every parameter physically sane across the whole stat range', () => {
    for (const v of [1, 10]) {
      const p = statsToParams({ speed: v, accel: v, handling: v, weight: v, offroad: v, miniTurbo: v });
      expect(p.topSpeed).toBeGreaterThan(30);
      expect(p.accel).toBeGreaterThan(5);
      expect(p.centrifugal).toBeGreaterThan(0);
      expect(p.offroadCap).toBeLessThan(1);
    }
  });
});

/** Distance-to-time on a straight drag strip. `shift` decides manual upshifts. */
function timeTo(metres: number, manual: boolean, shift?: (w: SimWorld) => boolean): { t: number; world: SimWorld } {
  const w = createWorld(1, [statsToParams(DEFAULT_STATS, manual)]);
  const input: InputFrame = { steer: 0, buttons: Button.Throttle };
  let ticks = 0;
  while (w.cars[0]!.s < metres && ticks < 60 * 120) {
    input.buttons = Button.Throttle | (shift?.(w) ? Button.ShiftUp : 0);
    stepWorld(w, straight, [input]);
    ticks++;
  }
  return { t: ticks / 60, world: w };
}

describe('gearbox', () => {
  it('automatic climbs through all five gears', () => {
    const { world } = timeTo(1500, false);
    expect(world.cars[0]!.gear).toBe(4);
  });

  it('automatic drops gears when you brake', () => {
    const w = createWorld(1);
    const go: InputFrame = { steer: 0, buttons: Button.Throttle };
    for (let i = 0; i < 60 * 20; i++) stepWorld(w, straight, [go]);
    const brake: InputFrame = { steer: 0, buttons: Button.Brake };
    for (let i = 0; i < 60; i++) stepWorld(w, straight, [brake]);
    expect(w.cars[0]!.gear).toBeLessThan(2);
  });

  it('manual never shifting stays on the first-gear limiter', () => {
    const { world } = timeTo(300, true, () => false);
    expect(world.cars[0]!.gear).toBe(0);
    expect(world.cars[0]!.rpm).toBe(1);
  });

  it("well-timed manual shifts beat the automatic by about 3% over a 400 m sprint", () => {
    const auto = timeTo(400, false).t;
    // Tap up in the sweet spot; release between taps so each is a fresh press.
    let held = false;
    const perfect = timeTo(400, true, (w) => {
      const want = w.cars[0]!.rpm >= 0.93 && !held;
      held = want;
      return want;
    }).t;
    const gain = (auto - perfect) / auto;
    expect(gain).toBeGreaterThan(0.015);
    expect(gain).toBeLessThan(0.05);
  });

  it('badly timed manual shifts are slower than the automatic', () => {
    const auto = timeTo(400, false).t;
    let held = false;
    const early = timeTo(400, true, (w) => {
      const want = w.cars[0]!.rpm >= 0.6 && !held;
      held = want;
      return want;
    }).t;
    expect(early).toBeGreaterThan(auto);
  });
});

describe('off-road', () => {
  it('bleeds speed down to the off-road cap and recovers back on the tarmac', () => {
    const w = createWorld(1);
    const go: InputFrame = { steer: 0, buttons: Button.Throttle };
    for (let i = 0; i < 60 * 25; i++) stepWorld(w, straight, [go]);
    const car = w.cars[0]!;
    const p = w.params[0]!;
    expect(car.speed).toBeGreaterThan(p.offroadCap * p.topSpeed * 1.5);

    car.x = 12; // onto the verge
    for (let i = 0; i < 60 * 3; i++) stepWorld(w, straight, [go]);
    expect(car.speed).toBeLessThan(p.offroadCap * p.topSpeed * 1.05);

    car.x = 0; // back on the road
    for (let i = 0; i < 60 * 10; i++) stepWorld(w, straight, [go]);
    expect(car.speed).toBeGreaterThan(p.offroadCap * p.topSpeed * 1.5);
  });

  it('a better off-road stat holds more speed on the grass', () => {
    const run = (offroad: number) => {
      const w = createWorld(1, [statsToParams(with_('offroad', offroad))]);
      w.cars[0]!.x = 12;
      const go: InputFrame = { steer: 0, buttons: Button.Throttle };
      for (let i = 0; i < 60 * 10; i++) stepWorld(w, straight, [go]);
      return w.cars[0]!.speed;
    };
    expect(run(9)).toBeGreaterThan(run(2));
  });
});
