/**
 * Pure pseudo-3D projection transforms (plan §7). No game logic, no rendering,
 * no module-level mutable state — every function is a pure `state-in → value/state-out`
 * so the Phase-2 renderer can call the hot ones without per-frame allocation
 * (hard rules 3–5). Intrinsics are taken as scalars where the hot path needs them.
 *
 * ── Coordinate conventions ─────────────────────────────────────────────────
 * World: `x` lateral (track-center-relative), `y` up (road plane at y=0), `z`
 *   depth increasing away from the camera.
 * Screen: origin top-left, `x` right, **`y` grows DOWNWARD** (row 0 = top).
 *   The vanishing point sits at `Y_horizon`; ground (y_world=0) projects *below*
 *   it, i.e. to a LARGER screen-y. A far ground point rises toward the horizon
 *   (smaller screen-y) as z → ∞.
 *
 * Forward projection maps normalized device coords [-1, 1] into pixel space via
 * the half-dimension factors `W/2` / `H/2`; the z-map is that map's exact inverse
 * for flat ground, so `zAtScanline(projectY(0, h, d/z), cam) === z`.
 */

import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { Camera } from '../types/engine.js';

/** Perspective scale `S = d_screen / z`. Strictly positive, decreasing in z. */
export function scaleFor(focalLength: number, z: number): number {
  return focalLength / z;
}

/**
 * Project a world lateral coordinate to a screen column.
 * `W/2 + S·(x − x_camera)·(W/2)`.
 */
export function projectX(
  worldX: number,
  cameraX: number,
  scale: number,
  width: number = LOGICAL_WIDTH,
): number {
  const half = width / 2;
  return half + scale * (worldX - cameraX) * half;
}

/**
 * Project a world elevation to a screen row (y grows downward).
 * `H/2 − S·(y − y_camera)·(H/2)`. For ground (worldY=0) below the camera this
 * yields a row larger than `H/2`, collapsing to `H/2` as `scale → 0`.
 */
export function projectY(
  worldY: number,
  cameraY: number,
  scale: number,
  height: number = LOGICAL_HEIGHT,
): number {
  const half = height / 2;
  return half - scale * (worldY - cameraY) * half;
}

/**
 * Inverse projection (z-map): the flat-ground depth (y_world=0) that lands on a
 * given scanline. Exact inverse of `projectY` above, so it carries the same
 * `H/2` half-dimension factor:
 *
 *   `z = (h_camera · d_screen · (H/2)) / (Y_s − Y_horizon)`.
 *
 * Undefined at the horizon (`Y_s = Y_horizon`, division by zero → ±Infinity);
 * callers project rows strictly below the horizon. Strictly decreasing as `Y_s`
 * moves down from the horizon toward the bottom of the frame.
 */
export function zAtScanline(
  screenY: number,
  camera: Camera,
  height: number = LOGICAL_HEIGHT,
): number {
  return (camera.height * camera.focalLength * (height / 2)) / (screenY - camera.horizon);
}

/** Second-difference depth accumulator: `z += dz`, then `dz += ddz`. */
export interface ZAccumulator {
  z: number;
  dz: number;
}

/**
 * Advance the depth accumulator one scanline. Pure: returns a fresh state,
 * leaving `state` untouched. Applying it N times from `{z0, dz0}` with constant
 * `ddz` yields the closed form `z0 + n·dz0 + ddz·n(n−1)/2`.
 */
export function stepZAccumulator(state: ZAccumulator, ddz: number): ZAccumulator {
  const z = state.z + state.dz;
  const dz = state.dz + ddz;
  return { z, dz };
}

/**
 * Curvature/elevation accumulator: the double integral of per-segment curve `K`
 * (into a lateral screen shift) and the single integral of pitch `P` (into a
 * cumulative elevation).
 */
export interface CurveAccumulator {
  x: number;
  dx: number;
  y: number;
}

/**
 * Accumulate one segment far→near. Pure: `dx += curve; x += dx; y += pitch`,
 * returned as a fresh state.
 */
export function accumulateSegment(
  state: CurveAccumulator,
  curve: number,
  pitch: number,
): CurveAccumulator {
  const dx = state.dx + curve;
  const x = state.x + dx;
  const y = state.y + pitch;
  return { x, dx, y };
}

/** Result of a crest-occlusion test: whether the segment shows, and the new clip. */
export interface ClipResult {
  visible: boolean;
  clip: number;
}

/**
 * Painter's crest (hill) occlusion (plan §166–168). Screen-y grows downward, so
 * "above the clip" means a SMALLER y. A segment whose projected top is not above
 * the current clip is hidden by a nearer crest; a segment above it is visible and
 * "raises the clip" — moves it toward the horizon (smaller y). Repeated
 * application is monotonic: the clip never descends.
 */
export function clipToCrest(clip: number, projectedTopY: number): ClipResult {
  if (projectedTopY < clip) {
    return { visible: true, clip: projectedTopY };
  }
  return { visible: false, clip };
}
