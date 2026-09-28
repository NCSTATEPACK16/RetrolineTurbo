import { arcDelta, type SimTrack } from './track.js';
import { DT, type SimWorld } from './world.js';

/**
 * Slipstream: tuck in behind another car at speed and a draft charge builds;
 * fill it and you get a short boost to slingshot past. Pull out of the wake and
 * the charge drains. Works identically for players and CPUs.
 */
export const DRAFT = {
  minGap: 4.5,
  maxGap: 30,
  maxOffset: 1.6,
  minSpeed: 20,
  fillSeconds: 1.2,
  drainRate: 2,
  boost: 0.9,
} as const;

/** True if car `i` is sitting in some other car's wake. */
export function inWake(world: SimWorld, track: SimTrack, i: number): boolean {
  const me = world.cars[i]!;
  if (me.speed < DRAFT.minSpeed) return false;
  for (let j = 0; j < world.cars.length; j++) {
    if (j === i) continue;
    const o = world.cars[j]!;
    const gap = arcDelta(track, me.s, o.s);
    if (gap >= DRAFT.minGap && gap <= DRAFT.maxGap && Math.abs(o.x - me.x) <= DRAFT.maxOffset) return true;
  }
  return false;
}

export function stepSlipstream(world: SimWorld, track: SimTrack, draft: Float64Array): void {
  for (let i = 0; i < world.cars.length; i++) {
    if (inWake(world, track, i)) {
      draft[i] = draft[i]! + DT;
      if (draft[i]! >= DRAFT.fillSeconds) {
        const car = world.cars[i]!;
        if (car.boostTime < DRAFT.boost) car.boostTime = DRAFT.boost;
        draft[i] = 0;
      }
    } else {
      draft[i] = Math.max(0, draft[i]! - DRAFT.drainRate * DT);
    }
  }
}
