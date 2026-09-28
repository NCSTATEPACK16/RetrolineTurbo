import { createLoop } from '../physics/loop.js';
import { emptyInput } from './sim/input.js';
import { buildSimTrack } from './sim/track.js';
import { createWorld, copyWorld, stepWorld, hashWorld } from './sim/world.js';
import { InputRecording } from './sim/replay.js';
import { parseTrackFile } from './track/schema.js';
import sunsetBeach from './track/circuits/sunset-beach.json';
import { Keyboard } from './input/keyboard.js';
import { mapGamepad, mergeInputs, readPad } from './input/gamepad.js';
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
const inputs = [input];
const kbFrame = emptyInput();
const padFrame = emptyInput();
const recording = new InputRecording();
const keyboard = new Keyboard();

const canvas = document.getElementById('v2') as HTMLCanvasElement;
const view = new View(canvas, document.getElementById('crt')!, track, circuit.layout, CARS);
window.addEventListener('resize', () => view.resize());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') view.crt.enabled = !view.crt.enabled; // settings screen owns this later
  if (import.meta.env.DEV && e.code === 'KeyP') view.pixels.paletteEnabled = !view.pixels.paletteEnabled;
});

let lastFrame = performance.now();
const loop = createLoop({
  update() {
    keyboard.sample(kbFrame);
    const pad = readPad(0);
    if (pad) mergeInputs(kbFrame, mapGamepad(pad, padFrame), input);
    else Object.assign(input, kbFrame);
    recording.push(input);
    copyWorld(prev, curr);
    stepWorld(curr, track, inputs);
  },
  render(alpha) {
    const now = performance.now();
    view.render(prev, curr, alpha, Math.min(0.1, (now - lastFrame) / 1000));
    lastFrame = now;
  },
});
loop.start();

if (import.meta.env.DEV) {
  // F8 tuning overlay: edits the live tuning objects; car params are rebuilt from stats on every change.
  void Promise.all([import('./dev/TuningOverlay.js'), import('./sim/car.js'), import('./view/chaseRig.js')]).then(
    ([{ TuningOverlay }, car, chase]) => {
      const gearbox = { manual: false };
      const rebuild = (): void => {
        const p = car.statsToParams(car.DEFAULT_STATS, gearbox.manual, curr.tuning);
        Object.assign(curr.params[0]!, p);
      };
      new TuningOverlay([
        { title: 'gearbox', target: gearbox },
        { title: 'drive', target: curr.tuning as unknown as Record<string, number> },
        { title: 'camera', target: chase.CHASE_TUNING as unknown as Record<string, number> },
      ], rebuild);
    },
  );
  // Debug handle for manual checks and browser-driven verification.
  (window as unknown as { __v2: unknown }).__v2 = { world: curr, track, recording, hash: () => hashWorld(curr), view };
}
