import { describe, it, expect } from 'vitest';
import { Button, type InputFrame } from '../sim/input.js';
import { buildSimTrack } from '../sim/track.js';
import { createWorld, copyWorld, stepWorld } from '../sim/world.js';
import * as THREE from 'three';
import { RaceScene } from '../view/View.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

/**
 * Headless benchmark scene (issue v2-02). A frame's CPU work is one or more
 * sim steps plus one scene sync; the GPU draw is measured in the browser.
 * Budgets are deliberately loose for shared CI runners: they catch
 * order-of-magnitude regressions (an accidental O(n^2), per-frame allocation
 * storms), not single-digit percentages.
 */
const CARS = 8;
const SIM_STEP_BUDGET_MS = 0.25;
const SYNC_BUDGET_MS = 0.5;

function timeIt(iterations: number, fn: (i: number) => void): number {
  for (let i = 0; i < 200; i++) fn(i); // warm the JIT
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  return (performance.now() - t0) / iterations;
}

describe('v2 performance budget', () => {
  const circuit = parseTrackFile(sunset);
  const track = buildSimTrack(circuit.def);
  const input: InputFrame = { steer: 40, buttons: Button.Throttle };
  const inputs = Array.from({ length: CARS }, () => input);

  it(`sim step with ${CARS} cars stays under ${SIM_STEP_BUDGET_MS}ms`, () => {
    const world = createWorld(CARS);
    const ms = timeIt(60 * 60, () => stepWorld(world, track, inputs));
    console.info(`[budget] sim step x${CARS}: ${(ms * 1000).toFixed(1)}us`);
    expect(ms).toBeLessThan(SIM_STEP_BUDGET_MS);
  });

  it(`scene sync with ${CARS} cars stays under ${SYNC_BUDGET_MS}ms`, () => {
    const prev = createWorld(CARS);
    const curr = createWorld(CARS);
    const race = new RaceScene(track, circuit.layout, CARS, { props: new THREE.Texture(), horizon: new THREE.Texture() });
    const ms = timeIt(60 * 20, (i) => {
      copyWorld(prev, curr);
      stepWorld(curr, track, inputs);
      race.sync(prev, curr, (i % 10) / 10, 1 / 60);
    });
    console.info(`[budget] scene sync x${CARS}: ${(ms * 1000).toFixed(1)}us`);
    expect(ms).toBeLessThan(SYNC_BUDGET_MS);
  });
});
