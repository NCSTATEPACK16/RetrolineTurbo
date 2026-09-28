import { createLoop } from '../physics/loop.js';
import { emptyInput } from './sim/input.js';
import { buildSimTrack } from './sim/track.js';
import { createWorld, copyWorld, stepWorld, hashWorld } from './sim/world.js';
import { InputRecording } from './sim/replay.js';
import { parseTrackFile } from './track/schema.js';
import sunsetBeach from './track/circuits/sunset-beach.json';
import { Keyboard } from './input/keyboard.js';
import { View } from './view/View.js';

/**
 * v2 entry: the one place the sim and the view meet. Each fixed step samples
 * input, records it, snapshots the previous state, and advances the sim; each
 * frame the view blends the two snapshots.
 */
const circuit = parseTrackFile(sunsetBeach);
const track = buildSimTrack(circuit.def);
const CARS = 1;
const curr = createWorld(CARS);
const prev = createWorld(CARS);
const input = emptyInput();
const idle = emptyInput();
const recording = new InputRecording();
const keyboard = new Keyboard();

const canvas = document.getElementById('v2') as HTMLCanvasElement;
const view = new View(canvas, track, CARS);
window.addEventListener('resize', () => view.resize());

const loop = createLoop({
  update() {
    keyboard.sample(input);
    recording.push(input);
    copyWorld(prev, curr);
    stepWorld(curr, track, input, idle);
  },
  render(alpha) {
    view.render(prev, curr, alpha);
  },
});
loop.start();

if (import.meta.env.DEV) {
  // Debug handle for manual checks and browser-driven verification.
  (window as unknown as { __v2: unknown }).__v2 = { world: curr, track, recording, hash: () => hashWorld(curr), view };
}
