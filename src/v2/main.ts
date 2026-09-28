import { createLoop } from '../physics/loop.js';
import { emptyInput, type InputFrame } from './sim/input.js';
import { buildSimTrack } from './sim/track.js';
import { hashWorld } from './sim/world.js';
import { buildRacingLine } from './sim/racingLine.js';
import { createSession, stepSession, type Session } from './sim/session.js';
import { DEFAULT_FIELD } from './sim/field.js';
import { InputRecording } from './sim/replay.js';
import { JUNIOR } from './sim/assist.js';
import { parseTrackFile } from './track/schema.js';
import sunsetBeach from './track/circuits/sunset-beach.json';
import { Keyboard, LEFT_KEYS, RIGHT_KEYS } from './input/keyboard.js';
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
/** Local players (1, or 2 for split-screen); the menus own this setting later. */
let players = 1;
/** CPUs then the humans (null), who start at the back, Mario Kart-style. */
let field: (typeof DEFAULT_FIELD[number] | null)[] = [];
/** Car index of each local player, player 1 first. */
let humans: number[] = [];
let names: string[] = [];
function setPlayers(n: number): void {
  players = n;
  field = [...DEFAULT_FIELD.slice(0, 8 - n), ...Array<null>(n).fill(null)];
  humans = field.flatMap((f, i) => (f === null ? [i] : []));
  names = field.map((f, i) => (f !== null ? `CPU ${i + 1}` : n === 1 ? 'YOU' : `P${humans.indexOf(i) + 1}`));
}
setPlayers(1);

let seed = 1;
const junior = [false, false]; // Junior assist per player; the menus own this setting later
let pure = false; // Pure mode (no items); the menus own this setting later
let session: Session;
let recording: InputRecording;
function newRace(): void {
  session = createSession({ track, grid: circuit.layout.grid, line, field, seed: seed++, itemRows: circuit.layout.itemBoxes, pure });
  humans.forEach((car, k) => { session.world.assist[car] = junior[k] ? JUNIOR : 0; });
  recording = new InputRecording();
  view.setPlayers(humans);
  view.race.bindItems(session.race.items);
  hud.reset();
  overlay.names = names;
}

const kbFrame = emptyInput();
const padFrame = emptyInput();
const keyboard = new Keyboard();

const canvas = document.getElementById('v2') as HTMLCanvasElement;
const view: View = new View(canvas, document.getElementById('crt')!, track, circuit.layout, field.length, humans);
const hud = new Hud(document.getElementById('hud') as HTMLCanvasElement, view.race.center, view.race.carColors);
view.onResize = () => hud.resize(view.width, view.height, view.scale);
view.onResize();
const overlay = new RaceOverlay(document.getElementById('stage')!, names);
newRace();
window.addEventListener('resize', () => view.resize());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') view.crt.enabled = !view.crt.enabled; // settings screen owns this later
  if (import.meta.env.DEV && e.code === 'KeyP') view.pixels.paletteEnabled = !view.pixels.paletteEnabled;
  if (e.code === 'Enter' && session.race.phase === 'finished') newRace();
  if (session.race.phase !== 'racing') {
    if (e.code === 'KeyI') {
      pure = !pure;
      newRace();
    }
    if (e.code === 'Digit1' || e.code === 'Digit2') {
      setPlayers(e.code === 'Digit1' ? 1 : 2);
      newRace();
    }
  }
  const k = e.code === 'KeyJ' ? 0 : e.code === 'KeyK' ? 1 : -1;
  if (k >= 0 && k < players) {
    junior[k] = !junior[k];
    session.world.assist[humans[k]!] = junior[k] ? JUNIOR : 0;
  }
});

/** One player's input: their keyboard half (the whole board when solo) merged with their gamepad. */
function sampleInput(k: number, out: InputFrame): void {
  keyboard.sample(kbFrame, players === 1 ? undefined : k === 0 ? LEFT_KEYS : RIGHT_KEYS);
  const pad = readPad(k);
  if (pad) mergeInputs(kbFrame, mapGamepad(pad, padFrame), out);
  else Object.assign(out, kbFrame);
}

let lastFrame = performance.now();
/** Hit-stop: a big knock to a player freezes the whole game for a few ticks. */
let hitStop = 0;
const loop = createLoop({
  update() {
    if (hitStop > 0) {
      hitStop--;
      return;
    }
    for (let k = 0; k < humans.length; k++) sampleInput(k, session.inputs[humans[k]!]!);
    recording.push(session.inputs[humans[0]!]!);
    stepSession(session);
    for (const car of humans) {
      if (JUICE.hitStop && session.world.impact[car]! >= JUICE.hitStopImpact) hitStop = JUICE.hitStopTicks;
    }
  },
  render(alpha) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    view.render(session.prev, session.world, alpha, dt);
    hud.clear();
    for (let k = 0; k < humans.length; k++) {
      hud.draw(session.race, session.world, view.race.center, humans[k]!, view.rects[k]!, junior[k]!, dt);
    }
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
        Object.assign(session.world.params[humans[0]!]!, car.statsToParams(car.DEFAULT_STATS, gearbox.manual, session.world.tuning));
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
    get humans() { return humans; }, get player() { return humans[0]!; }, track, view, hash: () => hashWorld(session.world),
  };
}
