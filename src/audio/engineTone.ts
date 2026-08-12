/**
 * Pure audio math (spec: docs/superpowers/specs/2026-08-12-phase-10-audio.md §4-5).
 * No AudioNode, no AudioContext — plain numbers in, plain numbers out, so the
 * curve shape is unit-testable in the node test environment. `SoundEngine`
 * feeds these into real `AudioParam`s at the edge.
 */

export interface EngineToneParams {
  fBaseLow: number;
  fBaseHigh: number;
  fRange: number;
  filterMinHz: number;
  filterMaxHz: number;
}

export interface EngineTone {
  frequency: number;
  cutoff: number;
}

/**
 * f_osc = f_base + ratio * f_range; cutoff ramps the same ratio between the
 * filter bounds. `ratio` is speed against the *current gear's* ceiling, so a
 * gear change reads as the expected pitch drop with no extra state to track.
 */
export function computeEngineTone(
  kmh: number,
  gearIdx: number,
  gearMaxKmh: readonly [number, number],
  params: EngineToneParams,
): EngineTone {
  const cap = gearMaxKmh[gearIdx - 1] ?? gearMaxKmh[0];
  const raw = cap > 0 ? kmh / cap : 0;
  const ratio = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const fBase = gearIdx <= 1 ? params.fBaseLow : params.fBaseHigh;
  return {
    frequency: fBase + ratio * params.fRange,
    cutoff: params.filterMinHz + ratio * (params.filterMaxHz - params.filterMinHz),
  };
}

/** Tire squeal gain: silent unless skidding, then linear in magnitude. */
export function squealGain(skidding: boolean, skidMagnitude: number, maxGain: number): number {
  if (!skidding) return 0;
  const m = skidMagnitude < 0 ? 0 : skidMagnitude > 1 ? 1 : skidMagnitude;
  return m * maxGain;
}
