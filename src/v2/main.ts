import { createLoop } from '../physics/loop.js';
import { emptyInput } from './sim/input.js';
import { buildSimTrack } from './sim/track.js';
import { hashWorld } from './sim/world.js';
import { buildRacingLine } from './sim/racingLine.js';
import { createSession, stepSession, type Session } from './sim/session.js';
import { DEFAULT_FIELD } from './sim/field.js';
import { InputRecording } from './sim/replay.js';
import { JUNIOR } from './sim/assist.js';
import { parseTrackFile } from './track/schema.js';
import sunsetBeach from './track/circuits/sunset-beach.json';
import { Keyboard } from './input/keyboard.js';
import { mapGamepad, mergeInputs, readPad } from './input/gamepad.js';
import { View } from './view/View.js';
import { JUICE } from './view/Juice.js';
import { RaceOverlay } from './ui/raceOverlay.js';
import { Hud } from './view/hud/Hud.js';

/**
 * v2 entry: the one place the sim and the view meet. Each fixed step samples
 * the player's input, records it, and advances the shared race session (the
 * same code the headless balance sims run); each frame the view blends the
 * two snapshots.
 */
const circuit = parseTrackFile(sunsetBeach);
const track = buildSimTrack(circuit.def);
const line = buildRacingLine(track, circuit.layout.racingLine);
/** Seven CPUs then you (null = human). You start at the back, Mario Kart-style. */
const FIELD = [...DEFAULT_FIELD, null];
const PLAYER = FIELD.length - 1;
const NAMES = FIELD.map((f, i) => (f === null ? 'YOU' : `CPU ${i + 1}`));

let seed = 1;
let junior = false; // Junior assist for the player; the menus own this setting later
let pure = false; // Pure mode (no items); the menus own this setting later
let session: Session;
let recording: InputRecording;
function newRace(): void {
  session = createSession({ track, grid: circuit.layout.grid, line, field: FIELD, seed: seed++, itemRows: circuit.layout.itemBoxes, pure });
  session.world.assist[PLAYER] = junior ? JUNIOR : 0;
  recording = new InputRecording();
  view.race.bindItems(session.race.items);
}

const kbFrame = emptyInput();
const padFrame = emptyInput();
const keyboard = new Keyboard();

const canvas = document.getElementById('v2') as HTMLCanvasElement;
const view: View = new View(canvas, document.getElementById('crt')!, track, circuit.layout, FIELD.length, PLAYER);
const hud = new Hud(document.getElementById('hud') as HTMLCanvasElement, view.race.center, view.race.carColors);
view.onResize = () => hud.resize(view.width, view.height, view.scale);
view.onResize();
newRace();
const overlay = new RaceOverlay(document.getElementById('stage')!, NAMES);
window.addEventListener('resize', () => view.resize());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') view.crt.enabled = !view.crt.enabled; // settings screen owns this later
  if (import.meta.env.DEV && e.code === 'KeyP') view.pixels.paletteEnabled = !view.pixels.paletteEnabled;
  if (e.code === 'Enter' && session.race.phase === 'finished') newRace();
  if (e.code === 'KeyI' && session.race.phase !== 'racing') {
    pure = !pure;
    newRace();
  }
  if (e.code === 'KeyJ') {
    junior = !junior;
    session.world.assist[PLAYER] = junior ? JUNIOR : 0;
  }
});

let lastFrame = performance.now();
/** Hit-stop: a big knock to the player freezes the whole game for a few ticks. */
let hitStop = 0;
const loop = createLoop({
  update() {
    if (hitStop > 0) {
      hitStop--;
      return;
    }
    const input = session.inputs[PLAYER]!;
    keyboard.sample(kbFrame);
    const pad = readPad(0);
    if (pad) mergeInputs(kbFrame, mapGamepad(pad, padFrame), input);
    else Object.assign(input, kbFrame);
    recording.push(input);
    stepSession(session);
    if (JUICE.hitStop && session.world.impact[PLAYER]! >= JUICE.hitStopImpact) hitStop = JUICE.hitStopTicks;
  },
  render(alpha) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    view.render(session.prev, session.world, alpha, dt);
    hud.clear();
    hud.draw(session.race, session.world, view.race.center, PLAYER, { x: 0, y: 0, w: view.width, h: view.height }, junior, dt);
    overlay.update(session.race);
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
        Object.assign(session.world.params[PLAYER]!, car.statsToParams(car.DEFAULT_STATS, gearbox.manual, session.world.tuning));
      };
      new TuningOverlay([
        { title: 'gearbox', target: gearbox },
        { title: 'drive', target: car.DRIVE_TUNING as unknown as Record<string, number> },
        { title: 'camera', target: chase.CHASE_TUNING as unknown as Record<string, number> },
        { title: 'juice', target: JUICE },
      ], rebuild);
    },
  );
  // Debug handle for manual checks and browser-driven verification.
  (window as unknown as { __v2: unknown }).__v2 = {
    get session() { return session; },
    get world() { return session.world; },
    get race() { return session.race; },
    player: PLAYER, track, view, hash: () => hashWorld(session.world),
  };
}
