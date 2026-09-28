import { describe, it, expect } from 'vitest';
import { Button, emptyInput, quantiseSteer, type InputFrame } from './input.js';
import { buildSimTrack } from './track.js';
import { createWorld, copyWorld, stepWorld, hashWorld } from './world.js';
import { InputRecording } from './replay.js';
import { TRACER_OVAL } from '../track/tracer.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

const track = buildSimTrack(TRACER_OVAL);
const idle = emptyInput();
/** Car 0 gets `first`; the rest idle. */
const inputs = (n: number, first: InputFrame): InputFrame[] => [first, ...Array.from({ length: n - 1 }, () => idle)];

/** Seeded xorshift so the "random driver" is reproducible. */
function scriptedInput(seed: number): (tick: number, out: InputFrame) => void {
  let x = seed >>> 0 || 1;
  return (_tick, out) => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    out.steer = quantiseSteer(((x % 2001) - 1000) / 1000);
    out.buttons = (x & 7) === 0 ? Button.Brake : Button.Throttle;
  };
}

function run(seed: number, steps: number): number {
  const w = createWorld(4);
  const drive = scriptedInput(seed);
  const input = emptyInput();
  for (let t = 0; t < steps; t++) {
    drive(t, input);
    stepWorld(w, track, inputs(4, input));
  }
  return hashWorld(w);
}

describe('v2 sim determinism', () => {
  it('same inputs give an identical state hash after 10,000 steps', () => {
    expect(run(42, 10_000)).toBe(run(42, 10_000));
  });

  it('different inputs give a different hash', () => {
    expect(run(42, 10_000)).not.toBe(run(43, 10_000));
  });

  it('a recorded input stream replays to the same state', () => {
    const live = createWorld(1);
    const rec = new InputRecording(16); // small capacity forces growth
    const drive = scriptedInput(7);
    const input = emptyInput();
    for (let t = 0; t < 5_000; t++) {
      drive(t, input);
      rec.push(input);
      stepWorld(live, track, [input]);
    }

    const replay = createWorld(1);
    const frame = emptyInput();
    for (let t = 0; t < rec.length; t++) stepWorld(replay, track, [rec.read(t, frame)]);
    expect(hashWorld(replay)).toBe(hashWorld(live));
  });
});

describe('v2 tracer car', () => {
  it('holding throttle drives forward, approaches top speed, and completes laps', () => {
    const w = createWorld(1);
    const input: InputFrame = { steer: 0, buttons: Button.Throttle };
    // Keep it on the road through the bends by counter-steering the centrifugal push.
    for (let t = 0; t < 60 * 90; t++) {
      const car = w.cars[0]!;
      input.steer = quantiseSteer(Math.max(-1, Math.min(1, -car.x / 3)));
      stepWorld(w, track, [input]);
    }
    const car = w.cars[0]!;
    expect(car.speed).toBeGreaterThan(w.params[0]!.topSpeed * 0.8);
    expect(car.lap).toBeGreaterThanOrEqual(1);
    expect(car.s).toBeGreaterThanOrEqual(0);
    expect(car.s).toBeLessThan(track.length);
  });

  it('copyWorld snapshots state without sharing references', () => {
    const a = createWorld(2);
    const b = createWorld(2);
    stepWorld(a, track, inputs(2, { steer: 50, buttons: Button.Throttle }));
    copyWorld(b, a);
    expect(hashWorld(b)).toBe(hashWorld(a));
    stepWorld(a, track, inputs(2, { steer: 50, buttons: Button.Throttle }));
    expect(hashWorld(b)).not.toBe(hashWorld(a));
  });
});

describe('v2 sim on Sunset Beach', () => {
  it('a simple centre-seeking driver completes continuous laps', () => {
    const beach = buildSimTrack(parseTrackFile(sunset).def);
    const w = createWorld(1);
    const input: InputFrame = { steer: 0, buttons: Button.Throttle };
    for (let t = 0; t < 60 * 60 * 4; t++) {
      input.steer = quantiseSteer(Math.max(-1, Math.min(1, -w.cars[0]!.x / 2)));
      stepWorld(w, beach, [input]);
    }
    expect(w.cars[0]!.lap).toBeGreaterThanOrEqual(3);
  });
});
