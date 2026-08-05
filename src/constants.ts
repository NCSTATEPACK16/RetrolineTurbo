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
