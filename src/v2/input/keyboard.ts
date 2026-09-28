import { Button, STEER_MAX, type InputFrame } from '../sim/input.js';

/**
 * Keyboard → InputFrame. Browser edge only; the sim never sees key events.
 * Solo, every key drives player 1. In split-screen the board splits in two:
 * player 1 on the left (WASD), player 2 on the right (arrows).
 */
type KeyMap = Record<'left' | 'right' | 'throttle' | 'brake' | 'drift' | 'item' | 'shiftUp' | 'shiftDown', readonly string[]>;

export const LEFT_KEYS: KeyMap = {
  left: ['KeyA'], right: ['KeyD'], throttle: ['KeyW'], brake: ['KeyS'],
  drift: ['Space', 'ShiftLeft'], item: ['KeyE'], shiftUp: ['KeyR'], shiftDown: ['KeyF'],
};
export const RIGHT_KEYS: KeyMap = {
  left: ['ArrowLeft'], right: ['ArrowRight'], throttle: ['ArrowUp'], brake: ['ArrowDown'],
  drift: ['ShiftRight'], item: ['Slash'], shiftUp: ['Quote'], shiftDown: ['Semicolon'],
};
const SOLO_KEYS: KeyMap = {
  left: [...LEFT_KEYS.left, ...RIGHT_KEYS.left], right: [...LEFT_KEYS.right, ...RIGHT_KEYS.right],
  throttle: [...LEFT_KEYS.throttle, ...RIGHT_KEYS.throttle], brake: [...LEFT_KEYS.brake, ...RIGHT_KEYS.brake],
  drift: [...LEFT_KEYS.drift, ...RIGHT_KEYS.drift], item: ['KeyE', 'KeyX'],
  shiftUp: LEFT_KEYS.shiftUp, shiftDown: LEFT_KEYS.shiftDown,
};
const KEYS = SOLO_KEYS;
const ALL = new Set([...Object.values(SOLO_KEYS), ...Object.values(RIGHT_KEYS)].flat());

export class Keyboard {
  private readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (ALL.has(e.code)) e.preventDefault();
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: readonly string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** Fill `out` with this tick's intent (allocation-free); `keys` picks a half of the board in split-screen. */
  sample(out: InputFrame, keys: KeyMap = KEYS): InputFrame {
    out.steer = (this.any(keys.right) ? STEER_MAX : 0) - (this.any(keys.left) ? STEER_MAX : 0);
    out.buttons =
      (this.any(keys.throttle) ? Button.Throttle : 0) |
      (this.any(keys.brake) ? Button.Brake : 0) |
      (this.any(keys.drift) ? Button.Drift : 0) |
      (this.any(keys.item) ? Button.Item : 0) |
      (this.any(keys.shiftUp) ? Button.ShiftUp : 0) |
      (this.any(keys.shiftDown) ? Button.ShiftDown : 0);
    return out;
  }
}
