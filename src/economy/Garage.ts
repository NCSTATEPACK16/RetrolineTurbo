import { GEAR_ACCEL_KMH_S, GEAR_MAX_KMH, STEER_MAX_WPS, CENTRIFUGAL } from '../constants.js';
import type { VehicleParams } from '../physics/Vehicle.js';
import { PART_CATEGORIES, type CarMetrics, type EquippedLoadout, type Part } from '../types/inventory.js';
import { PART_CATALOG } from './partCurves.js';

/** Every car starts median. Parts move it off this, never past the bounds. */
export const BASELINE_METRICS: CarMetrics = { speed: 50, accel: 50, handling: 50, grip: 50 };
export const METRIC_MIN = 5;
export const METRIC_MAX = 95;

const clamp = (v: number): number => (v < METRIC_MIN ? METRIC_MIN : v > METRIC_MAX ? METRIC_MAX : v);

/**
 * Pure loadout resolution: baseline + the mods of every equipped part, clamped.
 * Unknown ids are skipped so a save written against an older catalog still loads.
 * `baseline` is a parameter so a future car archetype is data, not a refactor.
 */
export function resolveMetrics(
  loadout: EquippedLoadout,
  catalog: readonly Part[] = PART_CATALOG,
  baseline: CarMetrics = BASELINE_METRICS,
): CarMetrics {
  const out: CarMetrics = { ...baseline };
  for (const category of PART_CATEGORIES) {
    const id = loadout[category];
    if (id === null) continue;
    const part = catalog.find((p) => p.id === id);
    if (part === undefined) continue;
    out.speed += part.speedMod;
    out.accel += part.accelMod;
    out.handling += part.handlingMod;
    out.grip += part.gripMod;
  }
  out.speed = clamp(out.speed);
  out.accel = clamp(out.accel);
  out.handling = clamp(out.handling);
  out.grip = clamp(out.grip);
  return out;
}

/**
 * Metric surface -> physics params. Each factor is calibrated so metric 50 is
 * exactly 1.0, i.e. a stock car drives precisely as it did before Phase 9.
 * Grip inverts because CENTRIFUGAL is the outward push the driver fights: more
 * grip must mean less push. Speed uses a narrower band than the rest so a maxed
 * engine tops out around 355 km/h and the projection stays readable.
 */
export function metricsToParams(metrics: CarMetrics): VehicleParams {
  const speedF = 0.75 + 0.005 * metrics.speed;
  const accelF = 0.6 + 0.008 * metrics.accel;
  const handlingF = 0.6 + 0.008 * metrics.handling;
  const gripF = 1.3 - 0.006 * metrics.grip;
  return {
    gearMaxKmh: [GEAR_MAX_KMH[0] * speedF, GEAR_MAX_KMH[1] * speedF],
    gearAccelKmhS: [GEAR_ACCEL_KMH_S[0] * accelF, GEAR_ACCEL_KMH_S[1] * accelF],
    steerMaxWps: STEER_MAX_WPS * handlingF,
    centrifugal: CENTRIFUGAL * gripF,
  };
}
