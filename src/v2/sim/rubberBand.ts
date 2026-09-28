import type { CpuDriver } from './ai.js';
import type { RaceState } from './race.js';
import { RACE } from './race.js';
import type { SimTrack } from './track.js';
import type { SimWorld } from './world.js';

/**
 * Fair rubber-banding (PRD section 6, layer 4). It only ever moves a CPU's
 * *driving ability* — how hard it commits to corners and how often it slips —
 * never its engine: no speed boosts, no teleports, no touching CarParams. A CPU
 * far ahead of the best human gets a little sloppier; one far behind tightens
 * up, bounded so the field still feels like it has real drivers in it.
 */
export const BAND = {
  /** Metres of gap for the full effect. */
  range: 1200,
  minSkill: 0.94,
  maxSkill: 1.04,
  /** Mistake multiplier at full "ahead" effect (and its inverse behind). */
  mistakeSwing: 1.2,
  /** Easing, 1/s. */
  ease: 1.5,
  /** The player should usually have this many CPUs ahead (finishing 3rd-5th)... */
  aheadMin: 2,
  aheadMax: 4,
  /** ...and CPUs within this many metres of the player get nudged to keep it so. */
  packRange: 1500,
  packNudge: 0.3,
} as const;

function distanceM(race: RaceState, world: SimWorld, track: SimTrack, i: number): number {
  const r = race.racers[i]!;
  const sector = track.length / RACE.checkpoints;
  return r.progress * sector + (world.cars[i]!.s - r.sector * sector);
}

/** Target skill scale for a CPU `gap` metres ahead (+) or behind (−) the best human. */
export function bandTarget(gap: number): { skill: number; mistakes: number } {
  const u = Math.max(-1, Math.min(1, gap / BAND.range));
  const skill = u > 0 ? 1 - (1 - BAND.minSkill) * u : 1 + (BAND.maxSkill - 1) * -u;
  const mistakes = u > 0 ? 1 + (BAND.mistakeSwing - 1) * u : 1 / (1 + (BAND.mistakeSwing - 1) * -u);
  return { skill, mistakes };
}

export function stepRubberBand(race: RaceState, world: SimWorld, track: SimTrack, drivers: readonly (CpuDriver | null)[], dt: number): void {
  if (race.phase !== 'racing') return;
  let best = -Infinity;
  for (let i = 0; i < race.racers.length; i++) {
    if (race.racers[i]!.human) best = Math.max(best, distanceM(race, world, track, i));
  }
  if (best === -Infinity) return; // CPU-only race: no band
  // How many CPUs are currently ahead of the leading human.
  let ahead = 0;
  for (let i = 0; i < race.racers.length; i++) {
    if (!race.racers[i]!.human && distanceM(race, world, track, i) > best) ahead++;
  }
  const k = Math.min(1, BAND.ease * dt);
  for (let i = 0; i < drivers.length; i++) {
    const d = drivers[i];
    if (!d || race.racers[i]!.human) continue;
    const gap = distanceM(race, world, track, i) - best;
    let { skill, mistakes } = bandTarget(gap);
    // Keep the player in contention: too few CPUs ahead and the nearby chasers sharpen up;
    // too many and the nearby leaders ease off. Still ability only, never engine.
    if (Math.abs(gap) < BAND.packRange) {
      if (ahead < BAND.aheadMin && gap < 0) { skill += BAND.packNudge; mistakes = 0; }
      if (ahead > BAND.aheadMax && gap > 0) { skill -= BAND.packNudge; mistakes *= 4; }
    }
    d.skillScale += (skill - d.skillScale) * k;
    d.mistakeScale += (mistakes - d.mistakeScale) * k;
  }
}
