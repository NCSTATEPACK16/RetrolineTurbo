/**
 * Pure gearbox math (spec: docs/superpowers/specs/2026-08-24-playable-pc-build-design.md §3).
 * Numbers in, numbers out — no Vehicle, no state, no dt — so the torque curve
 * and the shift point are unit-testable in isolation, the same split as
 * `audio/engineTone.ts` keeps against `SoundEngine`.
 *
 * Gear indices here are 0-BASED. `Vehicle.gearIdx` is 1-based and the caller
 * converts with `- 1`. That mismatch is deliberate rather than sloppy: the
 * 1-based convention is load-bearing in Vehicle and engineTone, and arrays are
 * 0-based everywhere else — so the conversion is made explicit at one seam
 * instead of being smeared through both.
 */
import { TORQUE_SHAPE, BOG_FACTOR } from '../constants.js';

export interface GearTable {
  maxKmh: readonly number[];
  minKmh: readonly number[];
  accelKmhS: readonly number[];
  /** Curve shape, both optional and both defaulting to the shipped constants.
   * They ride on the table rather than arriving as extra arguments so the dev
   * tuning overlay can reshape the torque curve live without any call site
   * allocating a second object 60x/second (hard rule 4). Absent means stock. */
  torqueShape?: number;
  bogFactor?: number;
}

/**
 * Head-room term, shaped by TORQUE_SHAPE.
 *
 * Reaches exactly 0 at the gear ceiling. That is not incidental: Vehicle's
 * previous `(1 - kmh/gearMax)` taper had the same property, and the speed-cap
 * tests assert the car approaches but never exceeds a ceiling. A curve with a
 * non-zero floor would slam into the cap instead of straining toward it.
 */
export function gearTorque(kmh: number, g: number, t: GearTable): number {
  const lo = t.minKmh[g]!;
  const hi = t.maxKmh[g]!;
  const span = hi - lo;
  if (span <= 0) return 0;
  const head = 1 - (kmh - lo) / span;
  if (head <= 0) return 0;
  return (head > 1 ? 1 : head) ** (t.torqueShape ?? TORQUE_SHAPE);
}

/** Torque scaled by the gear's peak, with the mis-shift bog penalty applied. */
export function gearAccel(kmh: number, g: number, t: GearTable): number {
  const a = t.accelKmhS[g]! * gearTorque(kmh, g, t);
  return kmh < t.minKmh[g]! ? a * (t.bogFactor ?? BOG_FACTOR) : a;
}

/**
 * True when the next gear out-accelerates the current one.
 *
 * Torque is monotone within a gear and the next gear is bogged below its floor,
 * so the two curves cross exactly once — the shift point is unambiguous. That
 * is what lets the HUD shift light read this same predicate rather than
 * duplicating a threshold that could drift from the physics.
 */
export function shouldUpshift(kmh: number, g: number, t: GearTable): boolean {
  if (g >= t.maxKmh.length - 1) return false;
  return gearAccel(kmh, g + 1, t) > gearAccel(kmh, g, t);
}
