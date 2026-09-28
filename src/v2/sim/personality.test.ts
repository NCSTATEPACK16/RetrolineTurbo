import { describe, it, expect } from 'vitest';
import { Button, emptyInput, type InputFrame } from './input.js';
import { buildSimTrack } from './track.js';
import { createWorld, stepWorld, type SimWorld } from './world.js';
import { createRace, stepRace } from './race.js';
import { buildRacingLine, lineX } from './racingLine.js';
import { createCpuDriver, driveCpu, DEFAULT_PERSONALITY, type Hazard, type Personality } from './ai.js';
import { resolveBumps } from './bump.js';
import { stepSlipstream, DRAFT } from './slipstream.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

const circuit = parseTrackFile(sunset);
const track = buildSimTrack(circuit.def);
const line = buildRacingLine(track);
const calm: Personality = { ...DEFAULT_PERSONALITY, mistakeRate: 0 };

function soloLapTime(p: Personality, seed = 1): { seconds: number; drifts: number; mistakes: number } {
  const world = createWorld(1);
  const race = createRace(world, track, circuit.layout.grid, [0], [false], 3);
  const d = createCpuDriver(p, seed);
  const inputs = [emptyInput()];
  const scratch = [emptyInput()];
  let drifts = 0;
  for (let t = 0; t < 60 * 400 && race.racers[0]!.finishTick < 0; t++) {
    driveCpu(world, 0, d, line, track, null, inputs[0]!);
    const was = world.cars[0]!.drift;
    stepRace(race, world, track, inputs, scratch);
    if (was === 0 && world.cars[0]!.drift !== 0) drifts++;
  }
  return { seconds: (race.racers[0]!.finishTick - race.countdownTicks) / 60, drifts, mistakes: d.mistakes };
}

describe('personality', () => {
  it('skill makes a driver measurably faster', () => {
    const ace = soloLapTime({ ...calm, skill: 0.95 }).seconds;
    const rookie = soloLapTime({ ...calm, skill: 0.15 }).seconds;
    expect(rookie).toBeGreaterThan(ace * 1.03);
  });

  it('drift-happy drivers drift corners; drift-shy ones do not', () => {
    expect(soloLapTime({ ...calm, driftSkill: 0.9 }).drifts).toBeGreaterThan(6);
    expect(soloLapTime({ ...calm, driftSkill: 0.1 }).drifts).toBe(0);
  });

  it('mistakes happen at the configured rate, deterministically per seed', () => {
    const sloppy = soloLapTime({ ...calm, mistakeRate: 6 }, 7);
    expect(sloppy.mistakes).toBeGreaterThan(3);
    expect(soloLapTime({ ...calm, mistakeRate: 6 }, 7).mistakes).toBe(sloppy.mistakes);
    expect(soloLapTime(calm).mistakes).toBe(0);
  });

  it('mistakes cost time', () => {
    expect(soloLapTime({ ...calm, mistakeRate: 12 }, 3).seconds).toBeGreaterThan(soloLapTime(calm).seconds);
  });
});

/** Two cars on the start straight; car 0 is the CPU under test. */
function duel(setup: (w: SimWorld) => void, seconds: number, cpu: Personality, other: (w: SimWorld, out: InputFrame) => void) {
  const w = createWorld(2);
  setup(w);
  const d = createCpuDriver(cpu, 5);
  const inputs = [emptyInput(), emptyInput()];
  const trace: { x0: number; x1: number; ds: number }[] = [];
  let contacts = 0;
  for (let t = 0; t < seconds * 60; t++) {
    driveCpu(w, 0, d, line, track, null, inputs[0]!);
    other(w, inputs[1]!);
    stepWorld(w, track, inputs);
    contacts += resolveBumps(w, track);
    trace.push({ x0: w.cars[0]!.x, x1: w.cars[1]!.x, ds: w.cars[1]!.s - w.cars[0]!.s });
  }
  return { w, trace, contacts };
}

describe('awareness', () => {
  it('goes round a slower car instead of sitting behind or ramming it', () => {
    const { w, contacts } = duel((w) => {
      Object.assign(w.cars[0]!, { s: 20, x: 0, speed: 30 });
      Object.assign(w.cars[1]!, { s: 45, x: 0, speed: 18 });
      w.params[1]!.topSpeed = 18;
    }, 6, calm, (_w, out) => { out.steer = 0; out.buttons = Button.Throttle; });
    expect(w.cars[0]!.s).toBeGreaterThan(w.cars[1]!.s + 10);
    expect(contacts).toBeLessThan(5);
  });

  it('an aggressive driver moves across to cover a faster car closing from behind', () => {
    const { trace } = duel((w) => {
      Object.assign(w.cars[0]!, { s: 60, x: 0, speed: 26 });
      Object.assign(w.cars[1]!, { s: 50, x: 3, speed: 30 });
      w.params[0]!.topSpeed = 26;
    }, 1.2, { ...calm, aggression: 1 }, (_w, out) => { out.steer = 0; out.buttons = Button.Throttle; });
    expect(trace.at(-1)!.x0).toBeGreaterThan(1);
  });

  it('a mild driver does not block', () => {
    const { trace } = duel((w) => {
      Object.assign(w.cars[0]!, { s: 60, x: 0, speed: 26 });
      Object.assign(w.cars[1]!, { s: 50, x: 3, speed: 30 });
      w.params[0]!.topSpeed = 26;
    }, 1.2, { ...calm, aggression: 0.1 }, (_w, out) => { out.steer = 0; out.buttons = Button.Throttle; });
    expect(Math.abs(trace.at(-1)!.x0)).toBeLessThan(0.6);
  });

  it('steers round a hazard on its line', () => {
    const w = createWorld(1);
    Object.assign(w.cars[0]!, { s: 60, x: 0, speed: 30 });
    const hazards: Hazard[] = [{ active: true, s: 150, x: lineX(line, track, 150), radius: 1.2, life: 99 }];
    const d = createCpuDriver(calm, 2);
    const input = [emptyInput()];
    let closest = Infinity;
    for (let t = 0; t < 60 * 5; t++) {
      driveCpu(w, 0, d, line, track, { hazards }, input[0]!);
      stepWorld(w, track, input);
      const car = w.cars[0]!;
      if (Math.abs(car.s - 150) < 2.1) closest = Math.min(closest, Math.abs(car.x - hazards[0]!.x));
    }
    expect(closest).toBeGreaterThan(hazards[0]!.radius + 0.9);
  });
});

describe('slipstream', () => {
  const tow = (offset: number, seconds: number) => {
    const w = createWorld(2);
    Object.assign(w.cars[0]!, { s: 40, x: offset, speed: 30 });
    Object.assign(w.cars[1]!, { s: 52, x: 0, speed: 30 });
    const draft = new Float64Array(2);
    const go: InputFrame = { steer: 0, buttons: Button.Throttle };
    let boosted = false;
    for (let t = 0; t < seconds * 60; t++) {
      stepWorld(w, track, [go, go]);
      stepSlipstream(w, track, draft);
      if (w.cars[0]!.boostTime > 0) boosted = true;
      w.cars[1]!.s = w.cars[0]!.s + 12; // hold the tow at a fixed gap
    }
    return { boosted, draft: draft[0]! };
  };

  it('builds a charge in the wake and fires a boost', () => {
    expect(tow(0, DRAFT.fillSeconds + 0.1).boosted).toBe(true);
  });

  it('gets nothing a lane over', () => {
    const r = tow(3, 3);
    expect(r.boosted).toBe(false);
    expect(r.draft).toBe(0);
  });
});
