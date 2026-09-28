/**
 * Low Top Gear-style chase camera, as pure maths so the feel is unit-testable.
 * The view feeds it the car's state each frame; it returns where the camera
 * sits, where it looks, its roll and its field of view. Every response is
 * eased with frame-rate-independent exponential smoothing.
 */
export interface ChaseTuning {
  /** Metres behind the car. */
  distance: number;
  /** Metres above the road at the camera. */
  height: number;
  /** Metres ahead of the car the camera aims at. */
  lookAhead: number;
  lookHeight: number;
  /** Base vertical field of view, degrees. */
  fov: number;
  /** Extra FOV at top speed (sense of speed). */
  speedFov: number;
  /** Extra FOV while boosting. */
  boostFov: number;
  /** Radians of roll per unit of (curvature x speed^2). */
  rollGain: number;
  maxRoll: number;
  /** Metres the camera pulls in while drifting. */
  driftZoom: number;
  /** Smoothing rate, 1/s: higher follows faster. */
  ease: number;
  /** Minimum clearance above the road between the camera and the car. */
  crestClearance: number;
}

export const CHASE_TUNING: ChaseTuning = {
  distance: 7.5,
  height: 2.6,
  lookAhead: 14,
  lookHeight: 0.9,
  fov: 62,
  speedFov: 5,
  boostFov: 9,
  rollGain: 0.0018,
  maxRoll: 0.09,
  driftZoom: 1.4,
  ease: 6,
  crestClearance: 1.4,
};

export interface ChaseInput {
  /** Road curvature under the car (1/m, + right). */
  curvature: number;
  speed: number;
  topSpeed: number;
  boosting: boolean;
  drifting: boolean;
}

/** Eased state carried between frames. */
export interface ChaseState { roll: number; fov: number; zoom: number }

export function initialChaseState(t: ChaseTuning = CHASE_TUNING): ChaseState {
  return { roll: 0, fov: t.fov, zoom: 0 };
}

/** Fraction of the way to a target after `dt` seconds at `rate` per second. */
export function easeFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Advance the eased camera responses by one rendered frame. */
export function updateChase(state: ChaseState, input: ChaseInput, dt: number, t: ChaseTuning = CHASE_TUNING): ChaseState {
  const k = easeFactor(t.ease, dt);
  // Lean into the turn: a right-hander (curvature > 0) rolls the view right.
  const lateral = input.curvature * input.speed * input.speed;
  const roll = Math.max(-t.maxRoll, Math.min(t.maxRoll, lateral * t.rollGain));
  const speedRatio = input.topSpeed > 0 ? Math.min(1, input.speed / input.topSpeed) : 0;
  const fov = t.fov + t.speedFov * speedRatio + (input.boosting ? t.boostFov : 0);
  const zoom = input.drifting ? t.driftZoom : 0;
  state.roll += (roll - state.roll) * k;
  state.fov += (fov - state.fov) * k;
  state.zoom += (zoom - state.zoom) * k;
  return state;
}

/**
 * Camera height that never dips into a crest: at least `height` above the road
 * at the camera, and `crestClearance` above every road sample between camera
 * and car (`roadYs`, sampled by the caller).
 */
export function crestSafeHeight(cameraRoadY: number, roadYs: ArrayLike<number>, t: ChaseTuning = CHASE_TUNING): number {
  let y = cameraRoadY + t.height;
  for (let i = 0; i < roadYs.length; i++) y = Math.max(y, roadYs[i]! + t.crestClearance);
  return y;
}
