import { describe, it, expect } from 'vitest';
import { Keyboard, LEFT_KEYS, RIGHT_KEYS } from './keyboard.js';
import { Button, emptyInput } from '../sim/input.js';

function press(target: EventTarget, code: string): void {
  const e = new Event('keydown') as Event & { code: string };
  Object.defineProperty(e, 'code', { value: code });
  target.dispatchEvent(e);
}

describe('keyboard halves for split-screen', () => {
  it('the two halves share no keys', () => {
    const left = new Set(Object.values(LEFT_KEYS).flat());
    for (const code of Object.values(RIGHT_KEYS).flat()) expect(left.has(code), code).toBe(false);
  });

  it('routes WASD to player 1 and the arrows to player 2; solo takes both', () => {
    const t = new EventTarget();
    const kb = new Keyboard(t as unknown as Window);
    const f = emptyInput();
    press(t, 'KeyW');
    expect(kb.sample(f, LEFT_KEYS).buttons & Button.Throttle).toBeTruthy();
    expect(kb.sample(f, RIGHT_KEYS).buttons & Button.Throttle).toBeFalsy();
    press(t, 'ArrowLeft');
    expect(kb.sample(f, RIGHT_KEYS).steer).toBeLessThan(0);
    expect(kb.sample(f, LEFT_KEYS).steer).toBe(0);
    expect(kb.sample(f).steer).toBeLessThan(0);
    expect(kb.sample(f).buttons & Button.Throttle).toBeTruthy();
  });
});
