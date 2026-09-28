import { DEFAULT_STATS, STAT_KEYS, clampStat, type CarStats } from './car.js';

/**
 * Part catalogue v2 (PRD section 8, Mario Kart 8 model). Every part's stat
 * changes sum to zero: a strength is always paid for with a weakness, so no
 * build is strictly best (parts.test.ts checks every combination) and every
 * build is as strong in total as the CPUs' stock cars. The free starter parts
 * are all-rounders (no changes), so a new player's car is exactly the stock car
 * the balance gates are measured with. Speed tends to be worth more than the
 * other stats in practice; the feel pass tunes prices and deltas. Ids match the Blender kit
 * (view/carKit.ts), so what you buy is what you see on the car. Paint and
 * horns are cosmetic.
 */
export type PartSlot = 'body' | 'wheels' | 'engine' | 'spoiler' | 'exhaust';
export const PART_SLOTS: readonly PartSlot[] = ['body', 'wheels', 'engine', 'spoiler', 'exhaust'];

export type StatDelta = Partial<CarStats>;

export interface Part {
  readonly id: string;
  readonly slot: PartSlot;
  /** Short display name (icon-first UI shows the part itself; this is the caption). */
  readonly name: string;
  readonly stats: StatDelta;
  /** Credits to buy; 0 = owned from the start. */
  readonly price: number;
  /** Unlocked by a cup trophy (at this place or better) rather than bought. */
  readonly unlock?: { readonly cup: string; readonly place: 1 | 2 | 3 };
}

export const PARTS: readonly Part[] = [
  { id: 'body.roadster', slot: 'body', name: 'Roadster', stats: {}, price: 0 },
  { id: 'body.brick', slot: 'body', name: 'Brick', stats: { weight: 2, handling: -1, speed: -1 }, price: 300 },
  { id: 'body.wedge', slot: 'body', name: 'Wedge', stats: { speed: 2, handling: -1, weight: -1 }, price: 0, unlock: { cup: 'Sunset Cup', place: 3 } },
  { id: 'wheels.stock', slot: 'wheels', name: 'Stock', stats: {}, price: 0 },
  { id: 'wheels.chunky', slot: 'wheels', name: 'Chunky', stats: { offroad: 3, accel: -1, handling: -2 }, price: 250 },
  { id: 'wheels.slick', slot: 'wheels', name: 'Slicks', stats: { handling: 2, offroad: -2 }, price: 400 },
  { id: 'engine.vents', slot: 'engine', name: 'Vents', stats: {}, price: 0 },
  { id: 'engine.scoop', slot: 'engine', name: 'Scoop', stats: { accel: 2, speed: -2 }, price: 250 },
  { id: 'engine.blower', slot: 'engine', name: 'Blower', stats: { speed: 2, accel: -2 }, price: 0, unlock: { cup: 'Sunset Cup', place: 1 } },
  { id: 'spoiler.wing', slot: 'spoiler', name: 'Wing', stats: {}, price: 0 },
  { id: 'spoiler.lip', slot: 'spoiler', name: 'Lip', stats: { miniTurbo: 2, handling: -2 }, price: 200 },
  { id: 'spoiler.tower', slot: 'spoiler', name: 'Tower', stats: { handling: 2, miniTurbo: -1, speed: -1 }, price: 350 },
  { id: 'exhaust.twin', slot: 'exhaust', name: 'Twin', stats: {}, price: 0 },
  { id: 'exhaust.single', slot: 'exhaust', name: 'Single', stats: { accel: 1, miniTurbo: -1 }, price: 150 },
  { id: 'exhaust.stack', slot: 'exhaust', name: 'Stack', stats: { miniTurbo: 2, accel: -1, speed: -1 }, price: 0, unlock: { cup: 'Sunset Cup', place: 2 } },
];

export const PART_BY_ID: ReadonlyMap<string, Part> = new Map(PARTS.map((p) => [p.id, p]));

/** Paint jobs (cosmetic), as palette hex. */
export const PAINTS: readonly { id: string; name: string; color: string }[] = [
  { id: 'red', name: 'Red', color: '#c02a30' },
  { id: 'blue', name: 'Blue', color: '#2a5ac0' },
  { id: 'gold', name: 'Gold', color: '#ffcc00' },
  { id: 'magenta', name: 'Pink', color: '#e040c0' },
  { id: 'cyan', name: 'Cyan', color: '#40e0e0' },
  { id: 'green', name: 'Green', color: '#58b85a' },
  { id: 'purple', name: 'Purple', color: '#9132a7' },
  { id: 'white', name: 'White', color: '#d8d8e8' },
];

/** Horns (cosmetic): the audio layer plays them. */
export const HORNS: readonly { id: string; name: string }[] = [
  { id: 'beep', name: 'Beep' }, { id: 'honk', name: 'Honk' }, { id: 'toot', name: 'Toot' },
];

export interface CarBuild {
  body: string; wheels: string; engine: string; spoiler: string; exhaust: string;
  paint: string; horn: string;
}

export const STARTER_BUILD: CarBuild = {
  body: 'body.roadster', wheels: 'wheels.stock', engine: 'engine.vents', spoiler: 'spoiler.wing', exhaust: 'exhaust.twin',
  paint: 'red', horn: 'beep',
};

/** A build's six stats: the default car plus every part's trade-offs, clamped 1..10. */
export function buildStats(build: Pick<CarBuild, PartSlot>): CarStats {
  const out = { ...DEFAULT_STATS };
  for (const slot of PART_SLOTS) {
    const part = PART_BY_ID.get(build[slot]);
    if (!part || part.slot !== slot) throw new Error(`"${build[slot]}" is not a ${slot}`);
    for (const k of STAT_KEYS) out[k] += part.stats[k] ?? 0;
  }
  for (const k of STAT_KEYS) out[k] = clampStat(out[k]);
  return out;
}

/** True when `a` is at least as good as `b` in every stat and better in one. */
export function dominates(a: CarStats, b: CarStats): boolean {
  let better = false;
  for (const k of STAT_KEYS) {
    if (a[k] < b[k]) return false;
    if (a[k] > b[k]) better = true;
  }
  return better;
}
