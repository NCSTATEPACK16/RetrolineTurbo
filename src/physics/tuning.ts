/**
 * Dev-only tuning layer. Deliberately NOT part of VehicleParams: that type
 * carries exactly the metrics a Phase 9 parts loadout may move, and Vehicle.ts
 * states the intent outright -- "parts alter the metric surface described in
 * the spec, nothing more". Widening it would let a dev slider quietly redefine
 * what a *part* can do. Two concerns, two types.
 *
 * The six fields split across two channels, which is why there are two
 * functions here rather than one:
 *   - `centrifugal` is already a VehicleParams member, so it is overridden
 *     there, by `applyTuning`.
 *   - the other five are module constants in constants.ts with no per-car
 *     representation at all. `resolveTuning` fills each from its constant when
 *     unset, so Vehicle reads a complete object instead of repeating
 *     `o.x ?? CONSTANT` at every use site.
 */
import type { VehicleParams } from './Vehicle.js';
import {
  TORQUE_SHAPE, BOG_FACTOR, SKID_CURVE_THRESHOLD, STEER_RATE_PER_S, MU_OFFROAD,
} from '../constants.js';

export interface TuningOverrides {
  torqueShape?: number;
  bogFactor?: number;
  skidCurveThreshold?: number;
  centrifugal?: number;
  steerRatePerS?: number;
  muOffroad?: number;
}

export function applyTuning(base: VehicleParams, o: TuningOverrides): VehicleParams {
  return {
    ...base,
    centrifugal: o.centrifugal ?? base.centrifugal,
  };
}

/** Every module-constant override resolved to a concrete number. `centrifugal`
 * is absent on purpose — it travels through VehicleParams via `applyTuning`. */
export interface ResolvedTuning {
  torqueShape: number;
  bogFactor: number;
  skidCurveThreshold: number;
  steerRatePerS: number;
  muOffroad: number;
}

/** What an absent override resolves to: the shipped constant, exactly. This is
 * what makes an empty `TuningOverrides` byte-identical to the production car. */
export const DEFAULT_TUNING: ResolvedTuning = {
  torqueShape: TORQUE_SHAPE,
  bogFactor: BOG_FACTOR,
  skidCurveThreshold: SKID_CURVE_THRESHOLD,
  steerRatePerS: STEER_RATE_PER_S,
  muOffroad: MU_OFFROAD,
};

export function resolveTuning(o: TuningOverrides): ResolvedTuning {
  return {
    torqueShape: o.torqueShape ?? DEFAULT_TUNING.torqueShape,
    bogFactor: o.bogFactor ?? DEFAULT_TUNING.bogFactor,
    skidCurveThreshold: o.skidCurveThreshold ?? DEFAULT_TUNING.skidCurveThreshold,
    steerRatePerS: o.steerRatePerS ?? DEFAULT_TUNING.steerRatePerS,
    muOffroad: o.muOffroad ?? DEFAULT_TUNING.muOffroad,
  };
}
