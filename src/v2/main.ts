import { createLoop } from '../physics/loop.js';
import { emptyInput, type InputFrame } from './sim/input.js';
import { buildSimTrack, type SimTrack } from './sim/track.js';
import { hashWorld } from './sim/world.js';
import { buildRacingLine, type RacingLine } from './sim/racingLine.js';
import { createSession, stepSession, type Session } from './sim/session.js';
import { REFERENCE_PLAYER } from './sim/field.js';
import { ROSTER, lineUp, type Driver } from './sim/roster.js';
import { generateName } from './sim/names.js';
import { InputRecording } from './sim/replay.js';
import { JUNIOR } from './sim/assist.js';
import { classParams, ENGINE_CLASSES, type EngineClass } from './sim/classes.js';
import { createCup, cupOver, recordRace, SUNSET_CUP, type CupState } from './sim/cup.js';
import { results } from './sim/race.js';
import { createCpuDriver, type Personality } from './sim/ai.js';
import { parseTrackFile, type Circuit, type TrackFileV2 } from './track/schema.js';
import { mirrorTrackFile } from './track/mirror.js';
import sunsetBeach from './track/circuits/sunset-beach.json';
import { Keyboard, LEFT_KEYS, RIGHT_KEYS } from './input/keyboard.js';
import { mapGamepad, mergeInputs, readPad } from './input/gamepad.js';
import { View } from './view/View.js';
import { JUICE } from './view/Juice.js';
import { RaceOverlay } from './ui/raceOverlay.js';
import { Menu, PadNav, keyNav, type MenuNav } from './ui/menu.js';
import { Hud } from './view/hud/Hud.js';
import { loadCarKit, DEFAULT_LOOKS, type CarLook } from './view/carKit.js';
import { Garage } from './ui/garage.js';
import { DEFAULT_STATS, statsToParams } from './sim/car.js';
import { buildStats, PAINTS, PART_BY_ID } from './sim/parts.js';
import { awardCup, parseProfile, raceCredits } from './sim/economy.js';
import { standings } from './sim/cup.js';

/**
 * v2 entry: the one place the sim and the view meet, plus the flow between
 * screens (menu → race → results → cup table → trophy). Each fixed step
 * samples the players' input and advances the shared race session (the same
 * code the headless balance sims run); each frame the view blends the two
 * snapshots. Behind the menu, the CPUs race each other as an attract mode.
 */
const CIRCUITS: Record<string, TrackFileV2> = { 'sunset-beach': sunsetBeach as TrackFileV2 };
interface Loaded { circuit: Circuit; track: SimTrack; line: RacingLine }
const loaded = new Map<string, Loaded>();
function load(id: string, mirror: boolean): Loaded {
  const key = `${id}${mirror ? ':mirror' : ''}`;
  let l = loaded.get(key);
  if (!l) {
    const file = CIRCUITS[id]!;
    const circuit = parseTrackFile(mirror ? mirrorTrackFile(file) : file);
    const track = buildSimTrack(circuit.def);
    l = { circuit, track, line: buildRacingLine(track, circuit.layout.racingLine) };
    loaded.set(key, l);
  }
  return l;
}

type Mode = 'gp' | 'quick' | 'versus';
const MODES: readonly Mode[] = ['gp', 'quick', 'versus'];
/** Menu choices; persisted per browser as a convenience. */
const settings = {
  mode: 'gp' as Mode, cls: 100 as EngineClass, mirror: false, items: true, junior: [false, false],
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('rt2.settings') ?? '{}'));
} catch { /* private mode or bad data: defaults */ }
const saveSettings = (): void => {
  try { localStorage.setItem('rt2.settings', JSON.stringify(settings)); } catch { /* ignore */ }
};

/** The player's garage and wallet; per browser until online saves land (net/). */
const profile = (() => {
  try { return parseProfile(JSON.parse(localStorage.getItem('rt2.profile') ?? 'null')); } catch { return parseProfile(null); }
})();
const saveProfile = (): void => {
  try { localStorage.setItem('rt2.profile', JSON.stringify(profile)); } catch { /* ignore */ }
};
const paintHex = (): string => PAINTS.find((p) => p.id === profile.build.paint)?.color ?? PAINTS[0]!.color;

type Screen = 'menu' | 'garage' | 'race' | 'results' | 'standings' | 'trophy';
let screen: Screen = 'menu';
let cup: CupState | null = null;
let current: Loaded = load('sunset-beach', false);

/** Car index of each local player, player 1 first (none in attract mode). */
let humans: number[] = [];
let field: (Personality | null)[] = [];
let names: string[] = [];
/** The roster driver in each CPU car (null for players). */
let drivers: (Driver | null)[] = [];
/** CPUs from the roster (all eight behind the menu), then the players at the back. */
function setField(players: number, cpus: readonly Driver[] = ROSTER): void {
  drivers = [...cpus.slice(0, 8 - players), ...Array<null>(players).fill(null)];
  field = drivers.map((d) => d?.personality ?? null);
  humans = field.flatMap((f, i) => (f === null ? [i] : []));
  names = drivers.map((d, i) => d?.name ?? (humans.indexOf(i) === 0 ? profile.name : 'Player 2'));
}

let seed = 1;
let session: Session;
let recording: InputRecording;
/** Start a race on `current` with the current field. */
function newRace(): void {
  // Player 1 drives their garage build; everyone else a stock car (player 2 borrows the stock car too).
  // CPUs' parts are their look; their stats stay stock so the gated balance holds (feel pass may revisit).
  const mine = humans[0];
  const params = field.map((_, i) => statsToParams(i === mine ? buildStats(profile.build) : DEFAULT_STATS));
  const rivalCar = cup && mine !== undefined ? drivers.findIndex((d) => d?.id === cup!.def.rival) : -1;
  session = createSession({
    track: current.track, grid: current.circuit.layout.grid, line: current.line, field, seed: seed++, params,
    itemRows: current.circuit.layout.itemBoxes, coins: current.circuit.layout.coins,
    pure: !settings.items, engineClass: screen === 'menu' ? 100 : settings.cls,
    ...(rivalCar >= 0 && mine !== undefined ? { rival: { car: rivalCar, of: mine } } : {}),
  });
  humans.forEach((car, k) => { session.world.assist[car] = settings.junior[k] ? JUNIOR : 0; });
  recording = new InputRecording();
  // Paint per car: player 1's garage paint; drivers their own (second choice if player 1 wears it).
  const p1 = paintHex();
  const paints = drivers.map((d, i) => (d ? (mine !== undefined && d.paint === p1 ? d.altPaint : d.paint) : i === mine ? p1 : undefined));
  view.setPlayers(humans.length ? humans : [0], paints);
  view.setLooks(drivers.map((d, i): CarLook => d?.car ?? (i === mine ? profile.build : DEFAULT_LOOKS[0]!)));
  hud.setDrivers(drivers.map((d) => d?.id ?? 'player'));
  view.race.bindItems(session.race.items, session.race.coins);
  hud.reset();
  overlay.names = names;
}

/** Point the view (and HUD mini-map) at another circuit layout. */
function useCircuit(l: Loaded): void {
  if (l === current) return;
  current = l;
  view.setTrack(l.track, l.circuit.layout);
  hud.setTrack(view.race.center);
}

const kbFrame = emptyInput();
const padFrame = emptyInput();
const keyboard = new Keyboard();
setField(0);

const stage = document.getElementById('stage')!;
const canvas = document.getElementById('v2') as HTMLCanvasElement;
const view: View = new View(canvas, document.getElementById('crt')!, current.track, current.circuit.layout, field.length, [0]);
const hud = new Hud(document.getElementById('hud') as HTMLCanvasElement, view.race.center, view.race.carColors);
view.onResize = () => hud.resize(view.width, view.height, view.scale);
view.onResize();
const overlay = new RaceOverlay(stage, names);
const menu = new Menu(stage);
newRace();
const garage = new Garage(stage, profile);
garage.onChange = saveProfile;
garage.onDone = () => {
  garage.hide();
  screen = 'menu';
  showMenu();
};
loadCarKit().then((kit) => {
  view.setKit(kit);
  garage.setKit(kit);
}, (e: unknown) => console.warn('car kit failed to load; using stand-in cars', e));

const onOff = ['OFF', 'ON'] as const;
function openMenu(): void {
  screen = 'menu';
  cup = null;
  overlay.hide();
  useCircuit(load('sunset-beach', false));
  setField(0);
  newRace();
  showMenu();
}
function showMenu(): void {
  menu.show('Retroline Turbo', '2.0', [
    { icon: '🏁', label: 'Mode', values: ['Grand Prix', 'Quick Race', 'Versus 2P'], get: () => MODES.indexOf(settings.mode), set: (i) => { settings.mode = MODES[i]!; } },
    { icon: '⚙️', label: 'Class', values: ['★ 50cc', '★★ 100cc', '★★★ 150cc'], get: () => ENGINE_CLASSES.indexOf(settings.cls), set: (i) => { settings.cls = ENGINE_CLASSES[i]!; } },
    { icon: '🪞', label: 'Mirror', values: onOff, get: () => +settings.mirror, set: (i) => { settings.mirror = i === 1; } },
    { icon: '🎁', label: 'Items', values: onOff, get: () => +settings.items, set: (i) => { settings.items = i === 1; } },
    { icon: '🧒', label: 'Junior P1', values: onOff, get: () => +settings.junior[0]!, set: (i) => { settings.junior[0] = i === 1; } },
    { icon: '🧒', label: 'Junior P2', values: onOff, get: () => +settings.junior[1]!, set: (i) => { settings.junior[1] = i === 1; }, visible: () => settings.mode === 'versus' },
    { icon: '🙂', label: 'Name', get values() { return [profile.name]; }, get: () => 0, set: () => { profile.name = generateName(Date.now() >>> 0); saveProfile(); } },
    { icon: '🔧', label: 'Garage', values: [`💰 ${profile.credits}  ▶`], get: () => 0, set: () => {}, action: openGarage },
  ], 'GO!', 'Arrows / WASD / pad to choose · Enter or A to race · Esc for this menu');
}
function openGarage(): void {
  saveSettings();
  menu.hide();
  screen = 'garage';
  garage.show();
}
menu.onGo = () => {
  saveSettings();
  menu.hide();
  const players = settings.mode === 'versus' ? 2 : 1;
  // The line-up is picked once per cup (the points table follows the same drivers); the cup's rival always races.
  setField(players, lineUp(8 - players, seed * 7 + 3, settings.mode === 'gp' ? SUNSET_CUP.rival : undefined));
  cup = settings.mode === 'gp' ? createCup(SUNSET_CUP, field.length) : null;
  startRound();
};
openMenu();

/** Start the next race: the cup's next round, or a one-off on Sunset Beach. */
function startRound(): void {
  const id = cup ? cup.def.rounds[cup.round]!.track : 'sunset-beach';
  screen = 'race';
  overlay.hide();
  useCircuit(load(id, settings.mirror));
  newRace();
}

const OK_HINT = '\n\nEnter / A ▶ ';
/** Race over: record it and show the results. */
function finishRace(): void {
  screen = 'results';
  if (cup) recordRace(cup, results(session.race));
  // Credits for every local player go into the shared garage wallet.
  let earned = 0;
  for (const h of humans) earned += raceCredits(session.race.racers[h]!.position, session.race.coins.collected[h]!, settings.cls);
  profile.credits += earned;
  saveProfile();
  // Past the flag, the players' cars drive themselves on a cool-down lap behind the results.
  humans.forEach((h, k) => { session.drivers[h] = createCpuDriver(REFERENCE_PLAYER, 101 + k); });
  overlay.show(overlay.raceText(session.race, cup) + `\n\n💰 +${earned}` + OK_HINT + (cup ? 'Cup points' : 'Race again   Esc ▶ Menu'));
}

/** Advance the between-race screens. */
function proceed(): void {
  if (screen === 'results') {
    if (!cup) return startRound();
    screen = 'standings';
    overlay.show(overlay.standingsText(cup) + OK_HINT + (cupOver(cup) ? 'Trophy' : 'Next race'));
  } else if (screen === 'standings' && cup) {
    if (!cupOver(cup)) return startRound();
    screen = 'trophy';
    const place = standings(cup).find((s) => s.car === humans[0])!.place;
    const unlocked = awardCup(profile, cup.def.name, settings.cls, place);
    saveProfile();
    const news = unlocked.length ? `\n\nNEW PARTS: ${unlocked.map((id) => PART_BY_ID.get(id)!.name).join(', ')}` : '';
    overlay.show(humans.map((h) => overlay.trophyText(cup!, h)).join('\n') + news + OK_HINT + 'Menu');
  } else if (screen === 'trophy') openMenu();
}

function nav(n: MenuNav): void {
  if (screen === 'menu') menu.nav(n);
  else if (screen === 'garage') garage.nav(n);
  else if (screen === 'race') { if (n === 'back') openMenu(); }
  else if (n === 'ok') proceed();
  else if (n === 'back') openMenu();
}

window.addEventListener('resize', () => view.resize());
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') view.crt.enabled = !view.crt.enabled; // settings screen owns this later
  if (import.meta.env.DEV && e.code === 'KeyP') view.pixels.paletteEnabled = !view.pixels.paletteEnabled;
  if (e.repeat && screen !== 'menu') return;
  // In a race only Esc means anything here; driving keys go through the Keyboard sampler.
  const n = keyNav(e.code);
  if (!n || (screen === 'race' && n !== 'back')) return;
  if (screen === 'garage' && e.repeat && n === 'ok') return;
  e.preventDefault();
  nav(n);
});
const padNav = new PadNav();

/** One player's input: their keyboard half (the whole board when solo) merged with their gamepad. */
function sampleInput(k: number, out: InputFrame): void {
  keyboard.sample(kbFrame, humans.length === 1 ? undefined : k === 0 ? LEFT_KEYS : RIGHT_KEYS);
  const pad = readPad(k);
  if (pad) mergeInputs(kbFrame, mapGamepad(pad, padFrame), out);
  else Object.assign(out, kbFrame);
}

let lastFrame = performance.now();
/** Hit-stop: a big knock to a player freezes the whole game for a few ticks. */
let hitStop = 0;
function update(): void {
  if (hitStop > 0) {
    hitStop--;
    return;
  }
  if (screen === 'race') {
    for (let k = 0; k < humans.length; k++) sampleInput(k, session.inputs[humans[k]!]!);
    recording.push(session.inputs[humans[0]!]!);
  }
  stepSession(session);
  if (screen === 'race') {
    for (const car of humans) {
      if (JUICE.hitStop && session.world.impact[car]! >= JUICE.hitStopImpact) hitStop = JUICE.hitStopTicks;
    }
    if (session.race.phase === 'finished') finishRace();
  } else if (screen === 'menu' && session.race.phase === 'finished') newRace(); // attract mode loops
}
const loop = createLoop({
  update,
  render(alpha) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    const pn = screen === 'race' ? null : padNav.poll(readPad(0), dt);
    if (pn) nav(pn);
    view.render(session.prev, session.world, alpha, dt);
    garage.frame(dt);
    hud.clear();
    if (screen === 'race') {
      for (let k = 0; k < humans.length; k++) {
        hud.draw(session.race, session.world, view.race.center, humans[k]!, view.rects[k]!, settings.junior[k]!, dt);
      }
    }
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
        Object.assign(session.world.params[humans[0]!]!, classParams(car.statsToParams(car.DEFAULT_STATS, gearbox.manual, session.world.tuning), settings.cls));
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
    get humans() { return humans; }, get player() { return humans[0]!; }, get cup() { return cup; }, get screen() { return screen; },
    settings, view, menu, hud, hash: () => hashWorld(session.world),
    /** Run `ticks` fixed steps now (drives the game while the tab is hidden). */
    advance(ticks: number) { for (let i = 0; i < ticks; i++) update(); },
  };
}
