import { describe, it, expect } from 'vitest';
import { applyDeadzone, mapGamepad, mergeInputs, type PadLike } from './gamepad.js';
import { Button, emptyInput, STEER_MAX } from '../sim/input.js';

const pad = (axes: number[], pressed: number[] = []): PadLike => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

describe('gamepad mapping', () => {
  it('ignores stick drift inside the deadzone and still reaches full lock', () => {
    expect(applyDeadzone(0.1)).toBe(0);
    expect(applyDeadzone(1)).toBe(1);
    expect(applyDeadzone(-1)).toBe(-1);
    expect(applyDeadzone(0.575)).toBeCloseTo(0.5, 5);
  });

  it('maps the stick and d-pad to steer', () => {
    expect(mapGamepad(pad([0.5]), emptyInput()).steer).toBeGreaterThan(0);
    expect(mapGamepad(pad([0], [14]), emptyInput()).steer).toBe(-STEER_MAX);
    expect(mapGamepad(pad([0], [15]), emptyInput()).steer).toBe(STEER_MAX);
  });

  it.each([
    [0, Button.Throttle], [7, Button.Throttle], [1, Button.Brake], [6, Button.Brake],
    [5, Button.Drift], [4, Button.Item], [2, Button.Item], [3, Button.ShiftUp], [8, Button.ShiftDown],
  ])('button %i maps to %i', (index, button) => {
    expect(mapGamepad(pad([0], [index]), emptyInput()).buttons).toBe(button);
  });

  it('treats a half-pulled analog trigger as pressed', () => {
    const p = pad([0]);
    (p.buttons as { pressed: boolean; value: number }[])[7] = { pressed: false, value: 0.8 };
    expect(mapGamepad(p, emptyInput()).buttons & Button.Throttle).toBeTruthy();
  });

  it('merges keyboard and pad for one player', () => {
    const out = mergeInputs({ steer: 20, buttons: Button.Throttle }, { steer: -90, buttons: Button.Drift }, emptyInput());
    expect(out.steer).toBe(-90);
    expect(out.buttons).toBe(Button.Throttle | Button.Drift);
  });
});
