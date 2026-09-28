import { describe, it, expect } from 'vitest';
import { Button, emptyInput, type InputFrame } from './input.js';
import { buildSimTrack } from './track.js';
import { createWorld, type SimWorld } from './world.js';
import { createRace, stepRace, type RaceState } from './race.js';
import { Item, ITEMS, ODDS, createItems, rollItem, strike } from './items.js';
import { Assist } from './assist.js';
import { createSession, stepSession } from './session.js';
import { buildRacingLine } from './racingLine.js';
import { DEFAULT_FIELD } from './field.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

const circuit = parseTrackFile(sunset);
const track = buildSimTrack(circuit.def);
const rows = circuit.layout.itemBoxes;

function racing(n = 2, items = true): { w: SimWorld; race: RaceState; inputs: InputFrame[]; scratch: InputFrame[] } {
  const w = createWorld(n);
  const race = createRace(w, track, circuit.layout.grid, Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, () => false), {
    laps: 3, items, itemRows: rows, seed: 9,
  });
  const inputs = Array.from({ length: n }, () => emptyInput());
  const scratch = Array.from({ length: n }, () => emptyInput());
  for (let t = 0; t < race.countdownTicks; t++) stepRace(race, w, track, inputs, scratch);
  return { w, race, inputs, scratch };
}
const tick = (r: ReturnType<typeof racing>, n = 1) => {
  for (let t = 0; t < n; t++) stepRace(r.race, r.w, track, r.inputs, r.scratch);
};

describe('item odds', () => {
  const st = createItems(track, rows, 8, true, 42);
  const tally = (pos: number) => {
    const c = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 20000; k++) c[rollItem(st, pos)]!++;
    return c;
  };

  it('never hands the leader the catch-up Seeker', () => {
    expect(tally(1)[Item.Seeker]).toBe(0);
  });

  it('gives stragglers far more Seekers and boosts than the leader', () => {
    const lead = tally(1), last = tally(8);
    expect(last[Item.Seeker]).toBeGreaterThan(2000);
    expect(last[Item.Boost]!).toBeGreaterThan(lead[Item.Boost]! * 2);
    expect(lead[Item.Oil]!).toBeGreaterThan(last[Item.Oil]!);
  });

  it('matches the weight table within sampling error', () => {
    const got = tally(4);
    const w = ODDS[3]!;
    const total = w.reduce((a, b) => a + b, 0);
    w.forEach((weight, i) => expect(got[i + 1]! / 20000).toBeCloseTo(weight / total, 1));
  });
});

describe('boxes', () => {
  it('a car driving through a box collects an item, and the box respawns after a few seconds', () => {
    const r = racing(1);
    const box = r.race.items.boxes[0]!;
    Object.assign(r.w.cars[0]!, { s: box.s - 1, x: box.x, speed: 20 });
    tick(r, 10);
    expect(r.race.items.held[0]).not.toBe(Item.None);
    expect(box.respawn).toBeGreaterThan(0);
    tick(r, Math.ceil(ITEMS.boxRespawn * 60) + 2);
    expect(box.respawn).toBeLessThanOrEqual(0);
  });

  it('Pure mode has no boxes and no items', () => {
    const r = racing(1, false);
    expect(r.race.items.boxes).toHaveLength(0);
    expect(r.race.items.enabled).toBe(false);
  });
});

describe('item effects', () => {
  const use = (r: ReturnType<typeof racing>, i: number, item: number) => {
    r.race.items.held[i] = item;
    r.inputs[i]!.buttons |= Button.Item;
    tick(r);
    r.inputs[i]!.buttons &= ~Button.Item;
  };

  it('Boost fires a boost', () => {
    const r = racing(1);
    use(r, 0, Item.Boost);
    expect(r.w.cars[0]!.boostTime).toBeGreaterThan(ITEMS.boostTime - 0.1);
    expect(r.race.items.held[0]).toBe(Item.None);
  });

  it('an Oil Slick dropped behind spins out the car that hits it', () => {
    const r = racing(2);
    Object.assign(r.w.cars[0]!, { s: 500, x: 0, speed: 0 });
    Object.assign(r.w.cars[1]!, { s: 480, x: 0, speed: 30 });
    use(r, 0, Item.Oil);
    r.w.cars[0]!.s = 900; // leader drives away
    let spun = false;
    for (let t = 0; t < 60; t++) {
      tick(r);
      if (r.race.items.spin[1]! > 0) spun = true;
    }
    expect(spun).toBe(true);
    expect(r.race.items.hits[1]).toBe(1);
    expect(r.w.cars[1]!.speed).toBeLessThan(25);
  });

  it('a spinning car has no control until it recovers', () => {
    const r = racing(1);
    r.w.cars[0]!.speed = 30;
    strike(r.race.items, r.w, 0);
    r.inputs[0]!.buttons = Button.Throttle;
    r.inputs[0]!.steer = 127;
    const x0 = r.w.cars[0]!.x;
    tick(r, 30);
    expect(r.w.cars[0]!.x).toBeCloseTo(x0, 1);
    tick(r, 90);
    expect(r.w.cars[0]!.x).toBeGreaterThan(x0 + 1); // control is back
  });

  it('Junior players wobble instead of spinning', () => {
    const r = racing(1);
    r.w.assist[0] = Assist.NoSpin;
    r.w.cars[0]!.speed = 30;
    strike(r.race.items, r.w, 0);
    expect(r.race.items.spin[0]).toBe(0);
    expect(r.w.cars[0]!.speed).toBeCloseTo(30 * ITEMS.wobbleSpeedKeep, 5);
  });

  it('a Shield soaks one hit', () => {
    const r = racing(1);
    use(r, 0, Item.Shield);
    r.w.cars[0]!.speed = 30;
    strike(r.race.items, r.w, 0);
    expect(r.race.items.spin[0]).toBe(0);
    expect(r.w.cars[0]!.speed).toBe(30);
    strike(r.race.items, r.w, 0);
    expect(r.race.items.spin[0]).toBeGreaterThan(0);
  });

  it('the Draft Magnet reels you toward the car ahead', () => {
    const plain = racing(2), magnet = racing(2);
    for (const r of [plain, magnet]) {
      Object.assign(r.w.cars[0]!, { s: 1600, x: 0, speed: 30 });
      Object.assign(r.w.cars[1]!, { s: 1640, x: 3, speed: 30 });
      r.inputs[0]!.buttons = Button.Throttle;
    }
    use(magnet, 0, Item.Magnet);
    tick(plain, 90);
    tick(magnet, 89);
    expect(magnet.w.cars[0]!.s).toBeGreaterThan(plain.w.cars[0]!.s + 3);
  });

  it('the Seeker travels to the leader and spins them; it fizzles if you lead', () => {
    const r = racing(2);
    Object.assign(r.w.cars[0]!, { s: 900, x: 0, speed: 30 });
    Object.assign(r.w.cars[1]!, { s: 600, x: 0, speed: 30 });
    r.race.racers[0]!.progress = 3; r.race.racers[0]!.sector = 3;
    r.race.racers[1]!.progress = 2; r.race.racers[1]!.sector = 2;
    tick(r); // re-rank
    use(r, 1, Item.Seeker);
    let hit = false;
    for (let t = 0; t < 60 * 8 && !hit; t++) {
      tick(r);
      hit = r.race.items.hits[0]! > 0;
    }
    expect(hit).toBe(true);

    const solo = racing(1);
    use(solo, 0, Item.Seeker);
    expect(solo.race.items.seekers.every((s) => !s.active)).toBe(true);
  });
});

describe('CPUs and items', () => {
  it('CPUs collect and use items during a race', () => {
    const line = buildRacingLine(track);
    const s = createSession({ track, grid: circuit.layout.grid, line, field: DEFAULT_FIELD, itemRows: rows, seed: 3 });
    let used = 0;
    let prevHeld = Array.from(s.race.items.held);
    for (let t = 0; t < 60 * 120; t++) {
      stepSession(s);
      s.race.items.held.forEach((h, i) => { if (prevHeld[i] !== 0 && h === 0) used++; });
      prevHeld = Array.from(s.race.items.held);
    }
    expect(used).toBeGreaterThan(5);
  });
});
