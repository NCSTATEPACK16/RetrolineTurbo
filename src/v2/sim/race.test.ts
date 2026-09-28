import { describe, it, expect } from 'vitest';
import { Button, emptyInput, quantiseSteer, type InputFrame } from './input.js';
import { buildSimTrack } from './track.js';
import { createWorld, DT, type SimWorld } from './world.js';
import { createRace, stepRace, gridSlot, lapOf, results, RACE, type RaceState } from './race.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

const circuit = parseTrackFile(sunset);
const track = buildSimTrack(circuit.def);
const grid = circuit.layout.grid;

function setup(cars = 1, laps = 3): { world: SimWorld; race: RaceState; inputs: InputFrame[]; scratch: InputFrame[] } {
  const world = createWorld(cars);
  const race = createRace(world, track, grid, Array.from({ length: cars }, (_, i) => i), [true], laps);
  const inputs = Array.from({ length: cars }, () => emptyInput());
  const scratch = Array.from({ length: cars }, () => emptyInput());
  return { world, race, inputs, scratch };
}

/** Steer toward the centre line: good enough to lap Sunset Beach. */
function autopilot(world: SimWorld, i: number, out: InputFrame): void {
  out.steer = quantiseSteer(Math.max(-1, Math.min(1, -world.cars[i]!.x / 2)));
  out.buttons = Button.Throttle;
}

const secondsToTicks = (s: number) => Math.round(s / DT);

describe('grid', () => {
  it('lines eight cars up behind the start line in distinct slots on the road', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const { s, x } = gridSlot(track, grid, k);
      expect(s).toBeGreaterThan(track.length - 60);
      expect(Math.abs(x)).toBeLessThan(track.halfWidth);
      seen.add(`${s.toFixed(1)}:${x.toFixed(1)}`);
    }
    expect(seen.size).toBe(8);
    expect(gridSlot(track, grid, 0).s).toBeGreaterThan(gridSlot(track, grid, 7).s); // pole is furthest forward
  });
});

describe('countdown and rocket start', () => {
  it('holds everyone on the grid until GO', () => {
    const { world, race, inputs, scratch } = setup();
    inputs[0]!.buttons = Button.Throttle;
    const s0 = world.cars[0]!.s;
    for (let t = 0; t < race.countdownTicks - 1; t++) stepRace(race, world, track, inputs, scratch);
    expect(race.phase).toBe('countdown');
    expect(world.cars[0]!.s).toBe(s0);
    stepRace(race, world, track, inputs, scratch);
    expect(race.phase).toBe('racing');
  });

  const startWith = (holdFromSecondsBeforeGo: number | null) => {
    const { world, race, inputs, scratch } = setup();
    for (let t = 0; t < race.countdownTicks; t++) {
      const left = (race.countdownTicks - t) * DT;
      inputs[0]!.buttons = holdFromSecondsBeforeGo !== null && left <= holdFromSecondsBeforeGo ? Button.Throttle : 0;
      stepRace(race, world, track, inputs, scratch);
    }
    return { world, race };
  };

  it('rewards throttle timed just before GO with a rocket boost', () => {
    const { world } = startWith(0.3);
    expect(world.cars[0]!.boostTime).toBeCloseTo(RACE.rocketBoost, 5);
  });

  it('bogs the engine if you rev from too early', () => {
    const { race, world } = startWith(2);
    expect(world.cars[0]!.boostTime).toBe(0);
    expect(race.racers[0]!.stall).toBeGreaterThan(0);
  });

  it('a normal start gets neither', () => {
    const { race, world } = startWith(null);
    expect(world.cars[0]!.boostTime).toBe(0);
    expect(race.racers[0]!.stall).toBe(0);
  });

  it('a rocket start is ahead of a bogged start after three seconds', () => {
    const go = (hold: number) => {
      const { world, race } = startWith(hold);
      const { inputs, scratch } = setup();
      for (let t = 0; t < secondsToTicks(3); t++) {
        autopilot(world, 0, inputs[0]!);
        stepRace(race, world, track, inputs, scratch);
      }
      return world.cars[0]!.s;
    };
    expect(go(0.3)).toBeGreaterThan(go(2) + 10);
  });
});

describe('laps and finishing', () => {
  it('counts laps via checkpoints and finishes after three', () => {
    const { world, race, inputs, scratch } = setup();
    for (let t = 0; t < secondsToTicks(60 * 5) && race.phase !== 'finished'; t++) {
      autopilot(world, 0, inputs[0]!);
      stepRace(race, world, track, inputs, scratch);
    }
    expect(race.phase).toBe('finished');
    expect(lapOf(race.racers[0]!)).toBe(3);
    const [row] = results(race);
    expect(row!.timeSeconds).toBeGreaterThan(100);
  });

  it('gives no lap credit for reversing over the line and driving forward again', () => {
    const { world, race, inputs, scratch } = setup();
    const run = (seconds: number, buttons: number) => {
      for (let t = 0; t < secondsToTicks(seconds); t++) {
        inputs[0]!.steer = 0;
        inputs[0]!.buttons = buttons;
        stepRace(race, world, track, inputs, scratch);
      }
    };
    run(RACE.countdownSeconds, 0);
    run(4, Button.Throttle); // cross the line: lap 0 begins
    const progressAfterStart = race.racers[0]!.progress;
    world.cars[0]!.speed = 0;
    run(60, Button.Brake); // reverse back over the line (and on round) the wrong way
    run(40, Button.Throttle);
    expect(race.racers[0]!.progress).toBeLessThan(progressAfterStart + RACE.checkpoints);
    expect(lapOf(race.racers[0]!)).toBe(0);
  });
});

describe('wrong way and respawn', () => {
  it('flags wrong way after a second of reversing', () => {
    const { world, race, inputs, scratch } = setup();
    for (let t = 0; t < race.countdownTicks; t++) stepRace(race, world, track, inputs, scratch);
    inputs[0]!.buttons = Button.Brake;
    for (let t = 0; t < secondsToTicks(4); t++) stepRace(race, world, track, inputs, scratch);
    expect(world.cars[0]!.speed).toBeLessThan(0);
    expect(race.racers[0]!.wrongWay).toBeGreaterThan(RACE.wrongWaySeconds);
  });

  it('respawns a car that is stuck with the throttle down', () => {
    const { world, race, inputs, scratch } = setup();
    world.params[0]!.accel = 0; // a car that cannot move
    world.cars[0]!.x = 12;
    inputs[0]!.buttons = Button.Throttle;
    for (let t = 0; t < race.countdownTicks + secondsToTicks(RACE.stuckSeconds + 0.1); t++) stepRace(race, world, track, inputs, scratch);
    expect(world.cars[0]!.x).toBe(0);
    expect(race.racers[0]!.ghost).toBeGreaterThan(0);
  });
});

describe('positions', () => {
  it('ranks by distance covered and keeps the order array a permutation', () => {
    const { world, race, inputs, scratch } = setup(4);
    for (let t = 0; t < race.countdownTicks; t++) stepRace(race, world, track, inputs, scratch);
    // Only car 2 drives: it should lead.
    for (let t = 0; t < secondsToTicks(10); t++) {
      autopilot(world, 2, inputs[2]!);
      stepRace(race, world, track, inputs, scratch);
    }
    expect(race.racers[2]!.position).toBe(1);
    expect([...race.order].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('two local players', () => {
  it('start at the back and keep their own assist settings', async () => {
    const { createSession, stepSession, gridSlots } = await import('./session.js');
    const { buildRacingLine } = await import('./racingLine.js');
    const { DEFAULT_FIELD } = await import('./field.js');
    const { JUNIOR } = await import('./assist.js');
    const field = [...DEFAULT_FIELD.slice(0, 6), null, null];
    expect(gridSlots(field).slice(6)).toEqual([6, 7]);
    const track = buildSimTrack({ name: 'straight', halfWidth: 9, sections: [{ length: 3000, curvature: 0 }] });
    const s = createSession({ track, grid: { rows: 4, columns: 2, rowGap: 8, columnGap: 6 }, line: buildRacingLine(track), field });
    s.world.assist[6] = JUNIOR; // player 1 on Junior (auto-accelerate), player 2 not
    const start = [s.world.cars[6]!.s, s.world.cars[7]!.s];
    for (let t = 0; t < 60 * 6; t++) stepSession(s); // no input from either human
    const moved = (car: number, from: number): number => (s.world.cars[car]!.s - from + track.length) % track.length;
    expect(moved(6, start[0]!)).toBeGreaterThan(20);
    expect(moved(7, start[1]!)).toBeLessThan(1);
  });
});
