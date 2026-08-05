/**
 * Engine domain types — pure data, no logic (hard rule / plan §13).
 *
 * `import type` only lives here; these interfaces describe the shapes the math
 * and (later) render/physics layers pass around. The math-critical types
 * (`Camera`, `Segment`, `TrackConfig`) are fully specified now because Phase 1's
 * projection transforms consume them; the rest are minimal placeholders whose
 * `TODO(Phase N)` comment names the phase that fleshes them out.
 */

/**
 * The viewer. Carries both world pose (`x`, `z`) and the projection intrinsics
 * (`height`, `focalLength`, `horizon`) so the transforms in `math/projection.ts`
 * need nothing else. Intrinsics live here, not in `constants.ts`, so a scene can
 * carry more than one camera; `constants.ts` only exports their seed defaults.
 */
export interface Camera {
  x: number; // world lateral position (track-center-relative)
  z: number; // world depth along the track
  height: number; // h_camera — eye height above the road plane (= y_camera)
  focalLength: number; // d_screen — projection focal distance
  horizon: number; // Y_horizon — logical scanline of the vanishing point
}

/**
 * One road slice. `curve`/`pitch` are the per-segment *deltas* accumulated
 * far→near by `accumulateSegment` into screen-space lateral shift and elevation.
 */
export interface Segment {
  index: number; // ordinal along the track
  z: number; // world depth at the segment's near edge
  curve: number; // K_i — per-segment lateral curvature delta
  pitch: number; // P_i — per-segment elevation (hill) delta
}

/** Static track geometry parameters. */
export interface TrackConfig {
  roadWidth: number; // W_road (world units; half-width used as W/2 in projection)
  segmentLength: number; // world depth per segment
  drawDistance: number; // number of segments projected per frame
  rumbleSegments: number; // segments per rumble-strip colour band
}

/** TODO(Phase 5): full arcade skid/recovery vehicle state. Placeholder for now. */
export interface Vehicle {
  z: number; // world depth along the track
  speed: number; // forward speed (world units / s)
}

/** TODO(Phase 4): full billboard sprite (texture, scale, sort key). Placeholder. */
export interface Sprite {
  xOffset: number; // lateral offset from track centre
  z: number; // world depth (for scale + painter sort)
}

/** TODO(Phase 7): full branching-track pyramid node. Placeholder. */
export interface BranchPoint {
  z: number; // world depth where the split begins
  splitDurationSegments: number; // segments over which the branch diverges
}
