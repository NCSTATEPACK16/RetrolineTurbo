import { Button, STEER_MAX, type InputFrame } from '../sim/input.js';

/**
 * Keyboard → InputFrame. Browser edge only; the sim never sees key events.
 * Gamepad and remapping join in later issues.
 */
const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight'],
  item: ['KeyE', 'KeyX'],
} as const;

export class Keyboard {
  private readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (Object.values(KEYS).some((codes) => (codes as readonly string[]).includes(e.code))) e.preventDefault();
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: readonly string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** Fill `out` with this tick's intent (allocation-free). */
  sample(out: InputFrame): InputFrame {
    out.steer = (this.any(KEYS.right) ? STEER_MAX : 0) - (this.any(KEYS.left) ? STEER_MAX : 0);
    out.buttons =
      (this.any(KEYS.throttle) ? Button.Throttle : 0) |
      (this.any(KEYS.brake) ? Button.Brake : 0) |
      (this.any(KEYS.drift) ? Button.Drift : 0) |
      (this.any(KEYS.item) ? Button.Item : 0);
    return out;
  }
}
