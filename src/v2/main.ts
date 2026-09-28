import { createLoop } from '../physics/loop.js';
import { emptyInput, type InputFrame } from './sim/input.js';
import { buildSimTrack } from './sim/track.js';
import { createWorld, copyWorld, hashWorld, type SimWorld } from './sim/world.js';
import { createRace, stepRace, type RaceState } from './sim/race.js';
import { InputRecording } from './sim/replay.js';
import { parseTrackFile } from './track/schema.js';
import sunsetBeach from './track/circuits/sunset-beach.json';
import { Keyboard } from './input/keyboard.js';
import { mapGamepad, mergeInputs, readPad } from './input/gamepad.js';
import { View } from './view/View.js';
import { RaceOverlay } from './ui/raceOverlay.js';

/**
 * v2 entry: the one place the sim and the view meet. Each fixed step samples
 * input, records it, snapshots the previous state, and advances the race; each
 * frame the view blends the two snapshots.
 */
const circuit = parseTrackFile(sunsetBeach);
const track = buildSimTrack(circuit.def);
const CARS = 1;
const PLAYER = 0;
const NAMES = ['YOU'];

interface Session { curr: SimWorld; prev: SimWorld; race: RaceState; recording: InputRecording }

function newSession(): Session {
  const curr = createWorld(CARS);
  const race = createRace(curr, track, circuit.layout.grid, [CARS - 1], [true]);
  const prev = createWorld(CARS);
  copyWorld(prev, curr);
  return { curr, prev, race, recording: new InputRecording() };
}

let session = newSession();
const input = emptyInput();
const inputs: InputFrame[] = [input];
const scratch: InputFrame[] = [emptyInput()];
const kbFrame = emptyInput();
const padFrame = emptyInput();
const keyboard = new Keyboard();

const canvas = document.getElementById('v2') as HTMLCanvasElement;
const view = new View(canvas, document.getElementById('crt')!, track, circuit.layout, CARS);
const overlay = new RaceOverlay(document.getElementById('stage')!, NAMES);
window.addEventListener('resize', () => view.resize());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') view.crt.enabled = !view.crt.enabled; // settings screen owns this later
  if (import.meta.env.DEV && e.code === 'KeyP') view.pixels.paletteEnabled = !view.pixels.paletteEnabled;
  if (e.code === 'Enter' && session.race.phase === 'finished') session = newSession();
});

let lastFrame = performance.now();
const loop = createLoop({
  update() {
    keyboard.sample(kbFrame);
    const pad = readPad(0);
    if (pad) mergeInputs(kbFrame, mapGamepad(pad, padFrame), input);
    else Object.assign(input, kbFrame);
    session.recording.push(input);
    copyWorld(session.prev, session.curr);
    stepRace(session.race, session.curr, track, inputs, scratch);
  },
  render(alpha) {
    const now = performance.now();
    view.render(session.prev, session.curr, alpha, Math.min(0.1, (now - lastFrame) / 1000));
    overlay.update(session.race, PLAYER);
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
        Object.assign(session.curr.params[PLAYER]!, car.statsToParams(car.DEFAULT_STATS, gearbox.manual, session.curr.tuning));
      };
      new TuningOverlay([
        { title: 'gearbox', target: gearbox },
        { title: 'drive', target: session.curr.tuning as unknown as Record<string, number> },
        { title: 'camera', target: chase.CHASE_TUNING as unknown as Record<string, number> },
      ], rebuild);
    },
  );
  // Debug handle for manual checks and browser-driven verification.
  (window as unknown as { __v2: unknown }).__v2 = {
    get world() { return session.curr; },
    get race() { return session.race; },
    track, view, hash: () => hashWorld(session.curr),
  };
}
