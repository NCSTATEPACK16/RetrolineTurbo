import { STEP_MS, STEP_S, MAX_FRAME_MS } from '../constants.js';

/** Result of advancing the fixed-timestep accumulator by one rendered frame. */
export interface AccumulatorResult {
  /** How many fixed simulation steps to run this frame (>= 0, integer). */
  readonly steps: number;
  /** Leftover time carried into the next frame, in ms (0 <= remainder < stepMs). */
  readonly remainder: number;
}

/**
 * Pure core of the fixed-timestep loop — no timers, no side effects — so the
 * simulation cadence is deterministic and unit-testable headlessly.
 *
 * Adds `frameMs` (clamped to `maxFrameMs` to avoid a spiral of death after a
 * stall) to the carried-over `acc`, then drains it into whole `stepMs` steps.
 *
 * @param acc        accumulated leftover time from the previous frame (ms)
 * @param frameMs    wall-clock time elapsed since the previous frame (ms)
 * @param stepMs     fixed simulation step size (ms)
 * @param maxFrameMs cap applied to `frameMs` before accumulating
 */
export function stepAccumulator(
  acc: number,
  frameMs: number,
  stepMs: number = STEP_MS,
  maxFrameMs: number = MAX_FRAME_MS,
): AccumulatorResult {
  const clamped = frameMs > maxFrameMs ? maxFrameMs : frameMs < 0 ? 0 : frameMs;
  const total = acc + clamped;
  const steps = Math.floor(total / stepMs);
  const remainder = total - steps * stepMs;
  return { steps, remainder };
}

/** Callbacks driving a {@link createLoop} instance. */
export interface LoopCallbacks {
  /** Advance the simulation by one fixed step. `dt` is `STEP_S` seconds. */
  update(dt: number): void;
  /**
   * Draw a frame. `alpha` in [0, 1) is the fraction of a step already elapsed,
   * for interpolating render state between the two most recent sim states.
   */
  render(alpha: number): void;
}

/** Handle returned by {@link createLoop}. */
export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

/**
 * requestAnimationFrame-driven fixed-timestep loop built on {@link stepAccumulator}.
 * Rendering is decoupled from simulation: physics always advances in fixed
 * `STEP_S` increments, however many are needed to catch up to real time, and
 * `render` receives an interpolation `alpha`.
 */
export function createLoop(cb: LoopCallbacks): Loop {
  let acc = 0;
  let last = 0;
  let handle = 0;
  let running = false;

  const frame = (now: number): void => {
    const { steps, remainder } = stepAccumulator(acc, now - last, STEP_MS);
    last = now;
    acc = remainder;
    for (let i = 0; i < steps; i++) cb.update(STEP_S);
    cb.render(acc / STEP_MS);
    handle = requestAnimationFrame(frame);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      acc = 0;
      last = performance.now();
      handle = requestAnimationFrame(frame);
    },
    stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(handle);
    },
    get running(): boolean {
      return running;
    },
  };
}
