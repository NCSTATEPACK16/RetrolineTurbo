import type { InputFrame } from './input.js';

/**
 * Compact per-tick input log: one signed byte of steer and one byte of buttons
 * per tick. A race is fully determined by its inputs, so this *is* the replay
 * (and later, the ghost file).
 */
export class InputRecording {
  private steer: Int8Array;
  private buttons: Uint8Array;
  private n = 0;

  constructor(capacity = 60 * 60 * 5) {
    this.steer = new Int8Array(capacity);
    this.buttons = new Uint8Array(capacity);
  }

  get length(): number {
    return this.n;
  }

  push(input: InputFrame): void {
    if (this.n === this.steer.length) this.grow();
    this.steer[this.n] = input.steer;
    this.buttons[this.n] = input.buttons;
    this.n++;
  }

  /** Write tick `i` into `out` (allocation-free). */
  read(i: number, out: InputFrame): InputFrame {
    out.steer = this.steer[i]!;
    out.buttons = this.buttons[i]!;
    return out;
  }

  private grow(): void {
    const steer = new Int8Array(this.steer.length * 2);
    steer.set(this.steer);
    const buttons = new Uint8Array(this.buttons.length * 2);
    buttons.set(this.buttons);
    this.steer = steer;
    this.buttons = buttons;
  }
}
