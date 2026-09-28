import type { CarParams } from './car.js';
import type { Personality } from './ai.js';

/**
 * Engine classes (PRD section 2): the same field at three speeds. A class
 * scales every car's engine (so the player and the CPUs stay matched) and
 * sets how sharp the CPUs are. Each class carries its own balance target,
 * checked by the headless race sim in CI (balance.test.ts).
 */
export type EngineClass = 50 | 100 | 150;
export const ENGINE_CLASSES: readonly EngineClass[] = [50, 100, 150];

export interface ClassSpec {
  /** Top speed and acceleration multipliers for every car. */
  speed: number;
  accel: number;
  /** CPU skill multiplier (capped at 1) and mistake-rate multiplier. */
  cpuSkill: number;
  cpuMistakes: number;
  /**
   * Balance target for the reference player: finish between `best` and
   * `worst` (inclusive) in at least `rate` of seeded races.
   */
  target: { best: number; worst: number; rate: number };
}

export const CLASS_SPECS: Readonly<Record<EngineClass, ClassSpec>> = {
  // Gentle: slower cars, forgiving CPUs. A typical player usually makes the podium
  // (measured ~60-68% over 50 seeds; the rest is mostly 4th-5th).
  50: { speed: 0.82, accel: 0.9, cpuSkill: 0.75, cpuMistakes: 2.2, target: { best: 1, worst: 3, rate: 0.55 } },
  // The reference class: a typical player is in the thick of the pack.
  100: { speed: 1, accel: 1, cpuSkill: 1, cpuMistakes: 1, target: { best: 3, worst: 5, rate: 0.7 } },
  // Fast and sharp: a typical player has to fight for the lower half of the points
  // (measured ~88% in 4th-7th over 50 seeds).
  150: { speed: 1.12, accel: 1.1, cpuSkill: 1.25, cpuMistakes: 0.45, target: { best: 4, worst: 7, rate: 0.75 } },
};

/** A car's params at an engine class (a new object; the input is untouched). */
export function classParams(p: CarParams, cls: EngineClass): CarParams {
  const c = CLASS_SPECS[cls];
  return { ...p, topSpeed: p.topSpeed * c.speed, accel: p.accel * c.accel };
}

/** A CPU personality at an engine class. */
export function classPersonality(p: Personality, cls: EngineClass): Personality {
  const c = CLASS_SPECS[cls];
  return { ...p, skill: Math.min(1, p.skill * c.cpuSkill), mistakeRate: p.mistakeRate * c.cpuMistakes };
}
