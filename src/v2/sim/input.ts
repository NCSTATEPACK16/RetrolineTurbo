/**
 * One tick of player intent — the only thing that flows from the outside world
 * into the simulation. Everything is integer-quantised so a recorded stream
 * replays bit-exactly (ghosts, balance sims, and later netcode all rely on it).
 */
export interface InputFrame {
  /** -127 (full left) .. 127 (full right). */
  steer: number;
  /** Bitmask of {@link Button}. */
  buttons: number;
}

export const Button = {
  Throttle: 1 << 0,
  Brake: 1 << 1,
  Drift: 1 << 2,
  Item: 1 << 3,
  ShiftUp: 1 << 4,
  ShiftDown: 1 << 5,
} as const;

export const STEER_MAX = 127;

export function emptyInput(): InputFrame {
  return { steer: 0, buttons: 0 };
}

export function held(input: InputFrame, button: number): boolean {
  return (input.buttons & button) !== 0;
}

/** Quantise an analog steer value in [-1, 1] onto the integer steer range. */
export function quantiseSteer(v: number): number {
  const c = v > 1 ? 1 : v < -1 ? -1 : v;
  return Math.round(c * STEER_MAX);
}
