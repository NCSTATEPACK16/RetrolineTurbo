import { describe, it, expect } from 'vitest';
import { emptyInput, type InputFrame } from './input.js';
import { buildSimTrack, halfWidthAt, sectionIndexAt } from './track.js';
import { createWorld, type SimWorld } from './world.js';
import { createRace, stepRace, lapOf, type RaceState } from './race.js';
import { buildRacingLine, lineX, LINE } from './racingLine.js';
import { createCpuDriver, driveCpu, DEFAULT_PERSONALITY, type Personality } from './ai.js';
import { resolveBumps, CAR_LENGTH, CAR_WIDTH } from './bump.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

const circuit = parseTrackFile(sunset);
const track = buildSimTrack(circuit.def);
const line = buildRacingLine(track);

describe('racing line', () => {
  it('stays on the road everywhere', () => {
    for (let s = 0; s < track.length; s += 3) {
      expect(Math.abs(lineX(line, track, s))).toBeLessThanOrEqual(halfWidthAt(track, s) - LINE.margin + 0.1) // samples interpolate across width changes;
    }
  });

  it('runs down the middle of long straights', () => {
    expect(Math.abs(lineX(line, track, 150))).toBeLessThan(0.5); // mid start straight
  });

  it('clips the inside of corners: right-handers to the right, left-handers to the left', () => {
    const hairpin = track.starts[8]! + 55; // 180-degree right-hander, just past its middle
    expect(lineX(line, track, hairpin)).toBeGreaterThan(3);
    const left = track.starts[10]! + 60; // 90-degree left-hander
    expect(lineX(line, track, left)).toBeLessThan(-3);
  });

  it('can be overridden by an authored line', () => {
    const custom = buildRacingLine(track, [{ s: 0, x: 2 }, { s: 1000, x: -2 }]);
    expect(lineX(custom, track, 0)).toBeCloseTo(2, 3);
    expect(lineX(custom, track, 500)).toBeCloseTo(0, 1);
  });
});

function race(cpuBrains: Personality[], seconds: number): { world: SimWorld; race: RaceState } {
  const n = cpuBrains.length;
  const drivers = cpuBrains.map((p, i) => createCpuDriver(p, i + 1));
  const world = createWorld(n);
  const r = createRace(world, track, circuit.layout.grid, cpuBrains.map((_, i) => i), cpuBrains.map(() => false), 3);
  const inputs: InputFrame[] = cpuBrains.map(() => emptyInput());
  const scratch: InputFrame[] = cpuBrains.map(() => emptyInput());
  for (let t = 0; t < seconds * 60 && r.racers.some((x) => x.finishTick < 0); t++) {
    for (let i = 0; i < n; i++) driveCpu(world, i, drivers[i]!, line, track, [], inputs[i]!);
    stepRace(r, world, track, inputs, scratch);
  }
  return { world, race: r };
}

describe('CPU racers', () => {
  it('a lone CPU laps Sunset Beach cleanly and quickly, staying on the tarmac', () => {
    const n = 1;
    const world = createWorld(n);
    const r = createRace(world, track, circuit.layout.grid, [0], [false], 3);
    const inputs = [emptyInput()];
    const scratch = [emptyInput()];
    let offroadTicks = 0;
    const driver = createCpuDriver({ ...DEFAULT_PERSONALITY, mistakeRate: 0 }, 1);
    for (let t = 0; t < 60 * 300 && r.racers[0]!.finishTick < 0; t++) {
      driveCpu(world, 0, driver, line, track, [], inputs[0]!);
      stepRace(r, world, track, inputs, scratch);
      if (Math.abs(world.cars[0]!.x) > halfWidthAt(track, world.cars[0]!.s)) offroadTicks++;
    }
    expect(r.racers[0]!.finishTick).toBeGreaterThan(0);
    const lapTime = (r.racers[0]!.finishTick - r.countdownTicks) / 60 / 3;
    expect(lapTime).toBeLessThan(80); // ~2.3 km at a racing pace
    expect(offroadTicks / r.tick).toBeLessThan(0.02);
  });

  it('seven CPUs all finish three laps without getting stuck', () => {
    const brains = Array.from({ length: 7 }, (_, i) => ({ ...DEFAULT_PERSONALITY, laneOffset: ((i % 3) - 1) * 1.6 }));
    const { race: r } = race(brains, 60 * 6);
    for (const x of r.racers) {
      expect(x.finishTick).toBeGreaterThan(0);
      expect(lapOf(x)).toBe(3);
    }
  });
});

describe('race position across the lap boundary', () => {
  it('a car just past the line on lap 2 is ahead of one just short of it on lap 1', () => {
    const world = createWorld(2);
    const r = createRace(world, track, circuit.layout.grid, [0, 1], [false, false], 3);
    const inputs = [emptyInput(), emptyInput()];
    const scratch = [emptyInput(), emptyInput()];
    for (let t = 0; t < r.countdownTicks; t++) stepRace(r, world, track, inputs, scratch);
    // Car 0: completed lap 1, 5 m past the line. Car 1: 5 m short of completing lap 1.
    world.cars[0]!.s = 5; r.racers[0]!.progress = 8; r.racers[0]!.sector = 0;
    world.cars[1]!.s = track.length - 5; r.racers[1]!.progress = 7; r.racers[1]!.sector = 7;
    stepRace(r, world, track, inputs, scratch);
    expect(r.racers[0]!.position).toBe(1);
    expect(r.racers[1]!.position).toBe(2);
    expect(sectionIndexAt(track, world.cars[1]!.s)).toBeGreaterThan(0);
  });
});

describe('bumping', () => {
  const two = (a: Partial<{ s: number; x: number; speed: number }>, b: Partial<{ s: number; x: number; speed: number }>) => {
    const w = createWorld(2);
    Object.assign(w.cars[0]!, a);
    Object.assign(w.cars[1]!, b);
    return w;
  };

  it('a rear-ender slows the chaser and pushes the leader, conserving momentum', () => {
    const w = two({ s: 100, x: 0, speed: 30 }, { s: 102, x: 0, speed: 20 });
    const before = w.cars[0]!.speed * w.params[0]!.mass + w.cars[1]!.speed * w.params[1]!.mass;
    expect(resolveBumps(w, track)).toBe(1);
    expect(w.cars[0]!.speed).toBeLessThan(30);
    expect(w.cars[1]!.speed).toBeGreaterThan(20);
    const after = w.cars[0]!.speed * w.params[0]!.mass + w.cars[1]!.speed * w.params[1]!.mass;
    expect(after).toBeCloseTo(before, 6);
    expect(Math.abs(w.cars[1]!.s - w.cars[0]!.s)).toBeGreaterThanOrEqual(CAR_LENGTH - 1e-9);
  });

  it('a side swipe shoves the lighter car further', () => {
    const w = two({ s: 100, x: 0, speed: 30 }, { s: 100.5, x: 1, speed: 30 });
    w.params[0]!.mass = 2; // heavy
    w.params[1]!.mass = 0.8;
    resolveBumps(w, track);
    expect(Math.abs(w.cars[1]!.x - 1)).toBeGreaterThan(Math.abs(w.cars[0]!.x));
    expect(w.cars[1]!.x - w.cars[0]!.x).toBeGreaterThanOrEqual(CAR_WIDTH);
  });

  it('detects contact across the start line', () => {
    const w = two({ s: track.length - 1, x: 0, speed: 30 }, { s: 1, x: 0, speed: 20 });
    expect(resolveBumps(w, track)).toBe(1);
    expect(w.cars[1]!.speed).toBeGreaterThan(20);
  });

  it('ignores cars that are apart, and ghosts', () => {
    expect(resolveBumps(two({ s: 100, x: 0 }, { s: 110, x: 0 }), track)).toBe(0);
    expect(resolveBumps(two({ s: 100, x: 0 }, { s: 101, x: 0 }), track, (i) => i === 1)).toBe(0);
  });
});
