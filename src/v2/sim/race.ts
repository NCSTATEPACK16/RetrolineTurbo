import { Button, held, type InputFrame } from './input.js';
import { stepWorld, DT, type SimWorld } from './world.js';
import { wrapS, type SimTrack } from './track.js';
import { resolveBumps } from './bump.js';

/**
 * Race rules on top of the driving sim: grid, countdown + rocket start,
 * checkpointed lap progress (no credit for reversing over the line), wrong-way
 * detection, stuck respawn, race positions and final results.
 */
export const RACE = {
  countdownSeconds: 3,
  /** Hold throttle from inside this window before GO for a rocket start... */
  rocketWindow: 0.5,
  /** ...but holding it longer than this before GO bogs the engine down. */
  bogWindow: 1.2,
  rocketBoost: 1.3,
  bogStall: 0.8,
  checkpoints: 8,
  wrongWaySeconds: 1,
  stuckSeconds: 2.5,
  stuckSpeed: 3,
  respawnGhost: 1.5,
  /** Metres from the start line to the pole slot. */
  gridOffset: 8,
} as const;

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface Racer {
  /** Signed checkpoints passed since the start line: lap = floor(progress / checkpoints). */
  progress: number;
  /** Best progress reached (wrong-way reference). */
  bestProgress: number;
  sector: number;
  /** Tick the car crossed the line for the last time, or -1. */
  finishTick: number;
  wrongWay: number;
  stuck: number;
  /** Seconds left of respawn invulnerability (the view blinks the car). */
  ghost: number;
  /** Seconds the throttle has been held during the countdown. */
  revHeld: number;
  /** Seconds of drive lost to a bogged start. */
  stall: number;
  /** 1-based race position, updated every tick. */
  position: number;
  human: boolean;
}

export interface GridSpec { rows: number; columns: number; rowGap: number; columnGap: number; stagger?: number }

export interface RaceState {
  phase: RacePhase;
  laps: number;
  /** Ticks since the race was created; GO happens at countdownTicks. */
  tick: number;
  readonly countdownTicks: number;
  readonly racers: Racer[];
  /** Car indices in race order (leader first). */
  readonly order: number[];
  /** Cars exempt from contact this tick (respawn ghosts); created once, reused every tick. */
  readonly isGhost: (car: number) => boolean;
}

/** Lateral and arc position of grid slot `k` (0 = pole). */
export function gridSlot(track: SimTrack, grid: GridSpec, k: number): { s: number; x: number } {
  const row = Math.floor(k / grid.columns);
  const col = k % grid.columns;
  const back = RACE.gridOffset + row * grid.rowGap + (col % 2 === 1 ? grid.stagger ?? 0 : 0);
  return { s: wrapS(track, -back), x: (col - (grid.columns - 1) / 2) * grid.columnGap };
}

export function sectorAt(track: SimTrack, s: number): number {
  const n = Math.floor((s / track.length) * RACE.checkpoints);
  return n >= RACE.checkpoints ? RACE.checkpoints - 1 : n;
}

/**
 * Line the cars up and start the countdown. `slots[i]` is car i's grid slot;
 * `humans[i]` marks player-driven cars (the race ends when they all finish).
 */
export function createRace(
  world: SimWorld, track: SimTrack, grid: GridSpec, slots: readonly number[], humans: readonly boolean[], laps = 3,
): RaceState {
  const racers: Racer[] = world.cars.map((car, i) => {
    const slot = gridSlot(track, grid, slots[i] ?? i);
    car.s = slot.s;
    car.x = slot.x;
    car.speed = 0;
    // Grid slots sit behind the line (last sector): crossing it is the first checkpoint move to progress 0.
    return {
      progress: -1, bestProgress: -1, sector: sectorAt(track, car.s), finishTick: -1, wrongWay: 0, stuck: 0,
      ghost: 0, revHeld: 0, stall: 0, position: i + 1, human: humans[i] ?? false,
    };
  });
  return {
    phase: 'countdown', laps, tick: 0, countdownTicks: Math.round(RACE.countdownSeconds / DT),
    racers, order: racers.map((_, i) => i), isGhost: (car) => racers[car]!.ghost > 0,
  };
}

export function lapOf(r: Racer): number {
  return r.progress < 0 ? 0 : Math.floor(r.progress / RACE.checkpoints);
}

function stepCountdown(race: RaceState, world: SimWorld, inputs: readonly InputFrame[]): void {
  for (let i = 0; i < race.racers.length; i++) {
    const r = race.racers[i]!;
    r.revHeld = held(inputs[i]!, Button.Throttle) ? r.revHeld + DT : 0;
  }
  race.tick++;
  if (race.tick < race.countdownTicks) return;
  race.phase = 'racing';
  for (let i = 0; i < race.racers.length; i++) {
    const r = race.racers[i]!;
    if (r.revHeld > RACE.bogWindow) r.stall = RACE.bogStall;
    else if (r.revHeld > 0 && r.revHeld <= RACE.rocketWindow) world.cars[i]!.boostTime = RACE.rocketBoost;
  }
}

/** Advance the race one tick: countdown, or drive + rules. */
export function stepRace(race: RaceState, world: SimWorld, track: SimTrack, inputs: InputFrame[], scratch: InputFrame[]): void {
  if (race.phase === 'countdown') {
    stepCountdown(race, world, inputs);
    return;
  }
  // A bogged start: throttle does nothing until the stall clears.
  for (let i = 0; i < race.racers.length; i++) {
    const r = race.racers[i]!;
    const src = inputs[i]!;
    const dst = scratch[i]!;
    dst.steer = src.steer;
    dst.buttons = r.stall > 0 ? src.buttons & ~Button.Throttle : src.buttons;
    if (r.stall > 0) r.stall = Math.max(0, r.stall - DT);
  }
  stepWorld(world, track, scratch);
  resolveBumps(world, track, race.isGhost);
  race.tick++;

  const n = RACE.checkpoints;
  for (let i = 0; i < race.racers.length; i++) {
    const r = race.racers[i]!;
    const car = world.cars[i]!;
    const sec = sectorAt(track, car.s);
    if (sec !== r.sector) {
      if (sec === (r.sector + 1) % n) r.progress++;
      else if (sec === (r.sector + n - 1) % n) r.progress--;
      r.sector = sec;
      if (r.progress > r.bestProgress) r.bestProgress = r.progress;
      if (r.finishTick < 0 && r.progress >= race.laps * n) r.finishTick = race.tick;
    }
    // Wrong way: rolling backwards, or a whole checkpoint behind your best.
    const backwards = car.speed < -1 || r.progress < r.bestProgress;
    r.wrongWay = backwards ? r.wrongWay + DT : 0;
    // Stuck: throttle down but going nowhere (beached, or pinned against the barrier).
    r.stuck = held(inputs[i]!, Button.Throttle) && Math.abs(car.speed) < RACE.stuckSpeed ? r.stuck + DT : 0;
    if (r.stuck >= RACE.stuckSeconds) respawn(r, car);
    if (r.ghost > 0) r.ghost = Math.max(0, r.ghost - DT);
  }
  rankRacers(race, world, track);
  if (humansFinished(race)) race.phase = 'finished';
}

function respawn(r: Racer, car: { x: number; speed: number; drift: number; driftCharge: number }): void {
  car.x = 0;
  car.speed = 0;
  car.drift = 0;
  car.driftCharge = 0;
  r.stuck = 0;
  r.ghost = RACE.respawnGhost;
}

/** Distance covered in checkpoints, with the fraction through the current sector. */
function distanceOf(race: RaceState, world: SimWorld, track: SimTrack, i: number): number {
  const r = race.racers[i]!;
  return r.progress + (world.cars[i]!.s / track.length) * RACE.checkpoints - r.sector;
}

function ahead(race: RaceState, world: SimWorld, track: SimTrack, a: number, b: number): boolean {
  const fa = race.racers[a]!.finishTick, fb = race.racers[b]!.finishTick;
  if (fa >= 0 || fb >= 0) {
    if (fa < 0) return false;
    if (fb < 0) return true;
    return fa < fb || (fa === fb && a < b);
  }
  return distanceOf(race, world, track, a) > distanceOf(race, world, track, b);
}

/** Race order: finishers by finish time, then everyone else by distance covered. Allocation-free insertion sort. */
function rankRacers(race: RaceState, world: SimWorld, track: SimTrack): void {
  const o = race.order;
  for (let i = 1; i < o.length; i++) {
    const v = o[i]!;
    let j = i - 1;
    while (j >= 0 && ahead(race, world, track, v, o[j]!)) {
      o[j + 1] = o[j]!;
      j--;
    }
    o[j + 1] = v;
  }
  for (let p = 0; p < o.length; p++) race.racers[o[p]!]!.position = p + 1;
}

function humansFinished(race: RaceState): boolean {
  for (const r of race.racers) if (r.human && r.finishTick < 0) return false;
  return true;
}

export interface ResultRow { car: number; position: number; timeSeconds: number | null }

/** Final standings; unfinished cars get no time. */
export function results(race: RaceState): ResultRow[] {
  return race.order.map((car, i) => {
    const r = race.racers[car]!;
    return { car, position: i + 1, timeSeconds: r.finishTick >= 0 ? (r.finishTick - race.countdownTicks) * DT : null };
  });
}
