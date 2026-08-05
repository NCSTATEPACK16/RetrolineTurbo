/**
 * Engine-wide constants. Kept in one place so the retro look and the simulation
 * cadence are single-sourced.
 */

/** Fixed logical framebuffer (research §4 / plan §2.4). Nearest-neighbour upscaled. */
export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 270;

/** Fixed physics timestep. Simulation is deterministic and decoupled from render. */
export const STEP_S = 1 / 60;
export const STEP_MS = 1000 / 60;

/**
 * Upper bound on the frame delta fed into the accumulator. A long stall (tab
 * backgrounded, GC pause, breakpoint) must not queue a huge burst of catch-up
 * steps — that "spiral of death" would make the freeze worse. We clamp instead.
 */
export const MAX_FRAME_MS = 250;

/**
 * Default projection intrinsics (plan §7). These are *seed defaults* for the
 * per-camera fields (`Camera.focalLength`, `.height`, `.horizon`) — the carrier
 * of truth is the `Camera`, not these constants. Exact numbers are provisional
 * and get retuned when the road first renders in Phase 2; the math is correct
 * regardless of the values.
 */
export const DEFAULT_FOCAL_LENGTH = 0.84; // d_screen (screen-plane distance)
export const DEFAULT_CAMERA_HEIGHT = 1000; // h_camera above the road plane (world units)
export const HORIZON_Y = LOGICAL_HEIGHT / 2; // Y_horizon = 135; vanishing row for a level camera
