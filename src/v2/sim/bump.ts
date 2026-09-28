import { arcDelta, type SimTrack } from './track.js';
import type { SimWorld } from './world.js';

/**
 * Car-to-car contact in track space (arc length x lateral). Each car is a
 * CAR_LENGTH x CAR_WIDTH footprint; overlaps are pushed apart along the
 * shallower axis, split by mass (heavier cars move less). Nose-to-tail hits
 * trade speed; side hits shove and scrub. Wraps correctly across the start
 * line. `skip[i]` exempts ghosting (just-respawned) cars. Allocation-free.
 */
export const CAR_LENGTH = 4.2;
export const CAR_WIDTH = 1.9;
export const BUMP = {
  restitution: 0.35,
  /** Speed kept by both cars in a side swipe. */
  sideScrub: 0.99,
  /** Extra lateral shove on side contact, metres. */
  sideKick: 0.25,
} as const;

export function resolveBumps(world: SimWorld, track: SimTrack, skip?: (i: number) => boolean): number {
  const cars = world.cars;
  let contacts = 0;
  for (let i = 0; i < cars.length; i++) {
    if (skip?.(i)) continue;
    for (let j = i + 1; j < cars.length; j++) {
      if (skip?.(j)) continue;
      const a = cars[i]!, b = cars[j]!;
      const ds = arcDelta(track, a.s, b.s); // + means b is ahead of a
      const dx = b.x - a.x;
      const overS = CAR_LENGTH - Math.abs(ds);
      const overX = CAR_WIDTH - Math.abs(dx);
      if (overS <= 0 || overX <= 0) continue;
      contacts++;
      const ma = world.params[i]!.mass, mb = world.params[j]!.mass;
      const wa = mb / (ma + mb), wb = ma / (ma + mb); // share of the separation each car takes
      if (overS / CAR_LENGTH < overX / CAR_WIDTH) {
        // Nose-to-tail: separate along the track and trade momentum.
        const dir = ds >= 0 ? 1 : -1;
        a.s -= dir * overS * wa;
        b.s += dir * overS * wb;
        if (a.s < 0) a.s += track.length; else if (a.s >= track.length) a.s -= track.length;
        if (b.s < 0) b.s += track.length; else if (b.s >= track.length) b.s -= track.length;
        const rear = dir > 0 ? a : b, front = dir > 0 ? b : a;
        const mr = dir > 0 ? ma : mb, mf = dir > 0 ? mb : ma;
        const closing = rear.speed - front.speed;
        if (closing > 0) {
          const impulse = ((1 + BUMP.restitution) * closing) / (mr + mf);
          rear.speed -= impulse * mf;
          // A shove from behind never pushes a car past what its own engine could do boosted.
          const cap = world.params[dir > 0 ? j : i]!.topSpeed * world.tuning.boostSpeed;
          front.speed = Math.max(Math.min(front.speed + impulse * mr, cap), front.speed);
        }
      } else {
        // Side by side: shove apart; the lighter car gets pushed further.
        const dir = dx >= 0 ? 1 : -1;
        a.x -= dir * (overX + BUMP.sideKick) * wa;
        b.x += dir * (overX + BUMP.sideKick) * wb;
        a.speed *= BUMP.sideScrub;
        b.speed *= BUMP.sideScrub;
      }
    }
  }
  return contacts;
}
