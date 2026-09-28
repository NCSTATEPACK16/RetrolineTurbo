import { Button, quantiseSteer, type InputFrame } from '../sim/input.js';

/**
 * Standard-mapping gamepad → InputFrame, Mario Kart-style: A or RT drives,
 * B or LT brakes, RB drifts, LB/X fires items, Y/View shift for manual boxes.
 * Stick or d-pad steers. Pure so it can be unit-tested with a fake pad.
 */
export interface PadLike {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export const DEADZONE = 0.15;

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, LEFT: 14, RIGHT: 15 } as const;

const down = (pad: PadLike, i: number): boolean => {
  const b = pad.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
};

/** Remove the deadzone and rescale so steering still reaches full lock. */
export function applyDeadzone(v: number, dz = DEADZONE): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

export function mapGamepad(pad: PadLike, out: InputFrame): InputFrame {
  let steer = applyDeadzone(pad.axes[0] ?? 0);
  if (down(pad, B.LEFT)) steer = -1;
  if (down(pad, B.RIGHT)) steer = 1;
  out.steer = quantiseSteer(steer);
  out.buttons =
    (down(pad, B.A) || down(pad, B.RT) ? Button.Throttle : 0) |
    (down(pad, B.B) || down(pad, B.LT) ? Button.Brake : 0) |
    (down(pad, B.RB) ? Button.Drift : 0) |
    (down(pad, B.LB) || down(pad, B.X) ? Button.Item : 0) |
    (down(pad, B.Y) ? Button.ShiftUp : 0) |
    (down(pad, B.VIEW) ? Button.ShiftDown : 0);
  return out;
}

/** Merge two sources for one player: buttons OR together, the stronger steer wins. */
export function mergeInputs(a: InputFrame, b: InputFrame, out: InputFrame): InputFrame {
  out.buttons = a.buttons | b.buttons;
  out.steer = Math.abs(b.steer) > Math.abs(a.steer) ? b.steer : a.steer;
  return out;
}

/** Browser edge: poll the pad at `index` (null when none is connected). */
export function readPad(index: number): PadLike | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  return pads[index] ?? null;
}
