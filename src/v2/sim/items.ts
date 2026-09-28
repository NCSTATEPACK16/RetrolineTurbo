import { Button, held, type InputFrame } from './input.js';
import { arcDelta, halfWidthAt, wrapS, type SimTrack } from './track.js';
import { DT, type SimWorld } from './world.js';
import type { Hazard } from './ai.js';
import { Assist } from './assist.js';
import { RACE } from './race.js';
import type { RaceState } from './race.js';

/**
 * Items (PRD section 5): light, non-violent, and the genre's main equaliser.
 * Boxes on track hand out an item rolled against your race position — leaders
 * get defensive items, the pack gets speed, stragglers get the catch-up item.
 * All state lives here, preallocated, and every roll comes from a seeded RNG,
 * so races stay deterministic.
 */
export const Item = { None: 0, Boost: 1, Oil: 2, Shield: 3, Magnet: 4, Seeker: 5 } as const;
export type ItemId = (typeof Item)[keyof typeof Item];
export const ITEM_NAMES = ['', 'BOOST', 'OIL SLICK', 'SHIELD', 'DRAFT MAGNET', 'SEEKER'] as const;

export const ITEMS = {
  boxRespawn: 3,
  boxSpacing: 3.2,
  pickupReach: 2.4,
  boostTime: 1.6,
  oilLife: 25,
  oilRadius: 1.3,
  oilBehind: 5,
  maxHazards: 24,
  shieldTime: 8,
  magnetTime: 3,
  magnetRange: 60,
  magnetAccel: 5,
  seekerSpeed: 75,
  maxSeekers: 8,
  spinTime: 1.1,
  spinSpeedKeep: 0.45,
  wobbleSpeedKeep: 0.8,
} as const;

/**
 * Item odds by race position (1st .. 8th): weights for [Boost, Oil, Shield, Magnet, Seeker].
 * The Seeker only ever comes to cars well back, and never to the leader.
 */
export const ODDS: readonly (readonly number[])[] = [
  [2, 5, 4, 0, 0],
  [4, 4, 3, 1, 0],
  [4, 3, 3, 2, 0],
  [5, 2, 2, 3, 0],
  [5, 2, 1, 3, 1],
  [6, 1, 1, 3, 1],
  [6, 1, 1, 3, 2],
  [6, 0, 1, 3, 3],
];

export interface ItemBox { s: number; x: number; respawn: number }
export interface Seeker { active: boolean; owner: number; target: number; distance: number }

export interface ItemState {
  readonly enabled: boolean;
  rng: number;
  readonly boxes: ItemBox[];
  /** Per car: item held (ItemId). */
  readonly held: Int8Array;
  readonly shield: Float64Array;
  readonly magnet: Float64Array;
  /** Per car: seconds left spinning out (the sim reads this to cut control). */
  readonly spin: Float64Array;
  readonly prevItem: Uint8Array;
  /** Active oil slicks — also the CPUs' hazard list. */
  readonly hazards: Hazard[];
  readonly seekers: Seeker[];
  /** Per car: times hit this race (tests and results flavour). */
  readonly hits: Uint16Array;
}

export function createItems(
  track: SimTrack, rows: readonly { s: number; count: number }[], carCount: number, enabled: boolean, seed: number,
): ItemState {
  const boxes: ItemBox[] = [];
  if (enabled) {
    for (const row of rows) {
      for (let k = 0; k < row.count; k++) {
        const x = (k - (row.count - 1) / 2) * ITEMS.boxSpacing;
        const hw = halfWidthAt(track, row.s) - 1;
        boxes.push({ s: row.s, x: Math.max(-hw, Math.min(hw, x)), respawn: 0 });
      }
    }
  }
  return {
    enabled, rng: (seed >>> 0) || 0x2545f491, boxes,
    held: new Int8Array(carCount), shield: new Float64Array(carCount), magnet: new Float64Array(carCount),
    spin: new Float64Array(carCount), prevItem: new Uint8Array(carCount),
    hazards: Array.from({ length: ITEMS.maxHazards }, () => ({ active: false, s: 0, x: 0, radius: ITEMS.oilRadius, life: 0 })),
    seekers: Array.from({ length: ITEMS.maxSeekers }, () => ({ active: false, owner: 0, target: 0, distance: 0 })),
    hits: new Uint16Array(carCount),
  };
}

function rand(st: ItemState): number {
  let x = st.rng;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  st.rng = x;
  return x / 4294967296;
}

/** Roll an item for a car in race position `position` (1-based). */
export function rollItem(st: ItemState, position: number): ItemId {
  const w = ODDS[Math.min(ODDS.length, Math.max(1, position)) - 1]!;
  let total = 0;
  for (const v of w) total += v;
  let r = rand(st) * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!;
    if (r < 0) return (i + 1) as ItemId;
  }
  return Item.Boost;
}

/** Race distance in metres (progress-based, so it keeps counting across laps). */
export function raceDistance(race: RaceState, world: SimWorld, track: SimTrack, i: number): number {
  const r = race.racers[i]!;
  const sector = track.length / RACE.checkpoints;
  return r.progress * sector + (world.cars[i]!.s - r.sector * sector);
}

/** Hit car `i` with a spin-out (or a wobble on Junior); a shield soaks it instead. */
export function strike(st: ItemState, world: SimWorld, i: number): void {
  if (st.shield[i]! > 0) {
    st.shield[i] = 0;
    return;
  }
  const car = world.cars[i]!;
  st.hits[i] = st.hits[i]! + 1;
  if (world.assist[i]! & Assist.NoSpin) {
    car.speed *= ITEMS.wobbleSpeedKeep;
    return;
  }
  car.speed *= ITEMS.spinSpeedKeep;
  car.drift = 0;
  car.driftCharge = 0;
  car.boostTime = 0;
  st.spin[i] = ITEMS.spinTime;
}

function useItem(st: ItemState, race: RaceState, world: SimWorld, track: SimTrack, i: number): void {
  const item = st.held[i]!;
  st.held[i] = Item.None;
  const car = world.cars[i]!;
  switch (item) {
    case Item.Boost:
      if (car.boostTime < ITEMS.boostTime) car.boostTime = ITEMS.boostTime;
      break;
    case Item.Oil: {
      // Reuse a free slot, or the oldest slick if the track is already full of them.
      let slot = st.hazards[0]!;
      for (const h of st.hazards) {
        if (!h.active) { slot = h; break; }
        if (h.life < slot.life) slot = h;
      }
      slot.active = true;
      slot.s = wrapS(track, car.s - ITEMS.oilBehind);
      slot.x = car.x;
      slot.life = ITEMS.oilLife;
      break;
    }
    case Item.Shield:
      st.shield[i] = ITEMS.shieldTime;
      break;
    case Item.Magnet:
      st.magnet[i] = ITEMS.magnetTime;
      break;
    case Item.Seeker: {
      const leader = race.order[0]!;
      if (leader === i) break; // fizzles if you've taken the lead since picking it up
      let slot: Seeker | null = null;
      for (const sk of st.seekers) if (!sk.active) { slot = sk; break; }
      if (!slot) break;
      slot.active = true;
      slot.owner = i;
      slot.target = leader;
      slot.distance = raceDistance(race, world, track, i);
      break;
    }
  }
}

/** Advance items one tick: pickups, use, slicks, seekers, timers. Call after the world step. */
export function stepItems(st: ItemState, race: RaceState, world: SimWorld, track: SimTrack, inputs: readonly InputFrame[]): void {
  if (!st.enabled || race.phase !== 'racing') return;
  const cars = world.cars;

  for (const box of st.boxes) {
    if (box.respawn > 0) {
      box.respawn -= DT;
      continue;
    }
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!;
      if (Math.abs(arcDelta(track, c.s, box.s)) < ITEMS.pickupReach && Math.abs(c.x - box.x) < ITEMS.pickupReach) {
        box.respawn = ITEMS.boxRespawn;
        if (st.held[i] === Item.None) st.held[i] = rollItem(st, race.racers[i]!.position);
        break;
      }
    }
  }

  for (let i = 0; i < cars.length; i++) {
    const pressed = held(inputs[i]!, Button.Item);
    if (pressed && !st.prevItem[i] && st.held[i] !== Item.None && st.spin[i]! <= 0) useItem(st, race, world, track, i);
    st.prevItem[i] = pressed ? 1 : 0;
    if (st.shield[i]! > 0) st.shield[i] = Math.max(0, st.shield[i]! - DT);
    if (st.spin[i]! > 0) st.spin[i] = Math.max(0, st.spin[i]! - DT);
    if (st.magnet[i]! > 0) {
      st.magnet[i] = Math.max(0, st.magnet[i]! - DT);
      // Reel toward the nearest car ahead, up to your boosted top speed.
      const me = cars[i]!;
      for (let j = 0; j < cars.length; j++) {
        if (j === i) continue;
        const gap = arcDelta(track, me.s, cars[j]!.s);
        if (gap > 3 && gap < ITEMS.magnetRange) {
          const cap = world.params[i]!.topSpeed * world.tuning.boostSpeed;
          me.speed = Math.min(cap, me.speed + ITEMS.magnetAccel * DT);
          break;
        }
      }
    }
  }

  for (const h of st.hazards) {
    if (!h.active) continue;
    h.life -= DT;
    if (h.life <= 0) {
      h.active = false;
      continue;
    }
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]!;
      if (st.spin[i]! > 0) continue;
      if (Math.abs(arcDelta(track, c.s, h.s)) < 2 && Math.abs(c.x - h.x) < h.radius + 0.9) {
        h.active = false;
        strike(st, world, i);
        break;
      }
    }
  }

  for (const sk of st.seekers) {
    if (!sk.active) continue;
    sk.distance += ITEMS.seekerSpeed * DT;
    if (sk.distance >= raceDistance(race, world, track, sk.target)) {
      sk.active = false;
      strike(st, world, sk.target);
    }
  }
}
