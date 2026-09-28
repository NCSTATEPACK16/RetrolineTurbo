import { emptyInput, type InputFrame } from './input.js';
import type { SimTrack } from './track.js';
import { createWorld, copyWorld, type SimWorld } from './world.js';
import { DEFAULT_STATS, statsToParams, type CarParams } from './car.js';
import { CLASS_SPECS, classParams, classPersonality, type EngineClass } from './classes.js';
import { createRace, stepRace, type GridSpec, type RaceState } from './race.js';
import type { RacingLine } from './racingLine.js';
import { createCpuDriver, driveCpu, type CpuDriver, type Personality } from './ai.js';
import { stepRubberBand } from './rubberBand.js';

/**
 * One race, fully assembled: world + previous snapshot, race rules, CPU
 * drivers, rubber-banding. The browser and the headless balance sims both run
 * races through this, so what the tests measure is what players get.
 */
export interface SessionConfig {
  track: SimTrack;
  grid: GridSpec;
  line: RacingLine;
  /** One entry per car: a CPU personality, or null for a human. */
  field: readonly (Personality | null)[];
  params?: readonly CarParams[];
  laps?: number;
  seed?: number;
  /** Fair rubber-banding on (default) or off. */
  band?: boolean;
  /** Item box rows from the track layout; items are on when given, unless `pure`. */
  itemRows?: readonly { s: number; count: number }[];
  /** Pure mode: no items. */
  pure?: boolean;
  /** Coin lines from the track layout. */
  coins?: readonly { s: number; x: number; count: number; spacing: number }[];
  /** Engine class (default 100): scales every car's engine and the CPUs' sharpness. */
  engineClass?: EngineClass;
}

export interface Session {
  readonly cfg: SessionConfig;
  readonly world: SimWorld;
  readonly prev: SimWorld;
  readonly race: RaceState;
  readonly drivers: (CpuDriver | null)[];
  /** Per-car input for this tick. Callers write humans' frames; CPUs fill their own. */
  readonly inputs: InputFrame[];
  readonly scratch: InputFrame[];
}

/** Humans start at the back (Mario Kart-style); CPUs fill the grid from pole in field order. */
export function gridSlots(field: readonly (Personality | null)[]): number[] {
  const slots = new Array<number>(field.length);
  let cpu = 0;
  let human = field.length - field.filter((f) => f === null).length;
  field.forEach((f, i) => { slots[i] = f === null ? human++ : cpu++; });
  return slots;
}

export function createSession(cfg: SessionConfig): Session {
  const n = cfg.field.length;
  const cls = cfg.engineClass ?? 100;
  const params = cfg.field.map((_, i) => classParams(cfg.params?.[i] ?? statsToParams(DEFAULT_STATS), cls));
  const world = createWorld(n, params);
  const race = createRace(world, cfg.track, cfg.grid, gridSlots(cfg.field), cfg.field.map((f) => f === null), {
    laps: cfg.laps ?? 3, items: !cfg.pure, itemRows: cfg.itemRows ?? [], coins: cfg.coins ?? [], seed: cfg.seed ?? 1,
  });
  const prev = createWorld(n, params);
  copyWorld(prev, world);
  const seed = cfg.seed ?? 1;
  const drivers = cfg.field.map((p, i) => (p ? createCpuDriver(classPersonality(p, cls), (seed * 7919 + i * 104729) >>> 0) : null));
  return {
    cfg, world, prev, race, drivers,
    inputs: cfg.field.map(() => emptyInput()), scratch: cfg.field.map(() => emptyInput()),
  };
}

/** Advance one fixed tick. Write human inputs into `session.inputs` first. */
export function stepSession(s: Session): void {
  const { world, cfg } = s;
  for (let i = 0; i < s.drivers.length; i++) {
    const d = s.drivers[i];
    if (d) driveCpu(world, i, d, cfg.line, cfg.track, s.race.items, s.inputs[i]!);
  }
  copyWorld(s.prev, world);
  stepRace(s.race, world, cfg.track, s.inputs, s.scratch);
  if (cfg.band !== false) stepRubberBand(s.race, world, cfg.track, s.drivers, 1 / 60, CLASS_SPECS[cfg.engineClass ?? 100].target);
}
