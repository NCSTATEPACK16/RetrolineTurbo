import { describe, it, expect } from 'vitest';
import {
  InputManager, DEFAULT_BINDINGS, rebind, serializeBindings, parseBindings, mouseSteerCurve,
} from './InputManager.js';
import { createCommand } from '../physics/Vehicle.js';
import { PAD_STEER_DEADZONE } from '../constants.js';

const read = (im: InputManager) => { const c = createCommand(); im.read(c); return c; };

describe('input schemes resolve to one normalized command (parity)', () => {
  it('WASD: W throttles, S brakes, A/D steer full-scale', () => {
    const im = new InputManager();
    im.press('KeyW'); im.press('KeyA');
    let c = read(im);
    expect(c.throttle).toBe(1); expect(c.steer).toBe(-1); expect(c.brake).toBe(0);
    im.release('KeyA'); im.press('KeyD'); im.press('KeyS');
    c = read(im);
    expect(c.steer).toBe(1); expect(c.brake).toBe(1);
  });

  it('arrows mirror WASD exactly', () => {
    const wasd = new InputManager(); wasd.press('KeyW'); wasd.press('KeyA');
    const arrows = new InputManager(); arrows.press('ArrowUp'); arrows.press('ArrowLeft');
    expect(read(arrows)).toEqual(read(wasd));
  });

  it('mouse steer produces the same command as full digital steer at the rail', () => {
    const keys = new InputManager(); keys.press('KeyD');
    const mouse = new InputManager(); mouse.setMouseSteer(1);
    expect(read(mouse).steer).toBe(read(keys).steer);
  });

  it('gamepad maps LT/RT + stick into the same channels', () => {
    const im = new InputManager();
    im.setGamepad({ steer: -0.5, throttle: 0.8, brake: 0.2 });
    const c = read(im);
    // Steer is rescaled from the deadzone edge, so a half-deflected stick reads
    // slightly under half; the trigger axes are passed through untouched.
    expect(c.steer).toBeCloseTo(-(0.5 - PAD_STEER_DEADZONE) / (1 - PAD_STEER_DEADZONE), 5);
    expect(c.throttle).toBe(0.8); expect(c.brake).toBe(0.2);
  });

  it('resolves steer from the highest-priority active device, never a sum', () => {
    const im = new InputManager();
    im.press('KeyD'); im.setMouseSteer(0.8);
    expect(read(im).steer).toBe(1); // the key, not 1 + 0.8 clamped
  });

  it('Space is handbrake; Q/E and Shift/Ctrl shift gears', () => {
    const im = new InputManager();
    im.press('Space'); im.press('KeyE');
    const c = read(im);
    expect(c.handbrake).toBe(true); expect(c.gearUp).toBe(true);
    im.release('KeyE'); im.press('ControlLeft');
    expect(read(im).gearDown).toBe(true);
  });
});

describe('gear edges', () => {
  it('gearUp is true for exactly one read per press', () => {
    const im = new InputManager();
    im.press('KeyE');
    expect(read(im).gearUp).toBe(true);
    expect(read(im).gearUp).toBe(false); // still held — edge consumed
    im.release('KeyE'); im.press('KeyE');
    expect(read(im).gearUp).toBe(true); // re-press → new edge
  });
});

describe('mouseSteerCurve', () => {
  it('has a centre deadzone', () => {
    expect(mouseSteerCurve(0.03)).toBe(0);
    expect(mouseSteerCurve(-0.03)).toBe(0);
  });
  it('reaches full scale at the rails and is symmetric', () => {
    expect(mouseSteerCurve(1)).toBe(1);
    expect(mouseSteerCurve(-1)).toBe(-1);
    expect(mouseSteerCurve(0.5)).toBeCloseTo(-mouseSteerCurve(-0.5));
  });
  it('expo softens small inputs but keeps the rails', () => {
    expect(mouseSteerCurve(0.5, 0.08, true)).toBeLessThan(mouseSteerCurve(0.5, 0.08, false));
    expect(mouseSteerCurve(1, 0.08, true)).toBe(1);
  });
});

describe('rebinding', () => {
  it('rebind makes the code primary for the action and steals it from others', () => {
    const b = rebind(DEFAULT_BINDINGS, 'handbrake', 'KeyW');
    expect(b.handbrake[0]).toBe('KeyW');
    expect(b.throttle).not.toContain('KeyW');
    expect(DEFAULT_BINDINGS.throttle).toContain('KeyW'); // pure — input untouched
  });

  it('serialize/parse round-trips', () => {
    const b = rebind(DEFAULT_BINDINGS, 'nitro', 'KeyN');
    expect(parseBindings(serializeBindings(b))).toEqual(b);
  });

  it('parse rejects malformed or incomplete JSON', () => {
    expect(parseBindings('not json')).toBeNull();
    expect(parseBindings('{"throttle":["KeyW"]}')).toBeNull(); // missing actions
    expect(parseBindings('{"throttle":[]}')).toBeNull(); // empty binding list
  });

  it('an InputManager with rebound keys honours them', () => {
    const im = new InputManager(rebind(DEFAULT_BINDINGS, 'throttle', 'KeyJ'));
    im.press('KeyJ');
    expect(read(im).throttle).toBe(1);
  });

  it('stealing a single-binding action swaps instead of leaving it empty', () => {
    // handbrake only has Space; taking it must not orphan handbrake.
    const b = rebind(DEFAULT_BINDINGS, 'throttle', 'Space');
    expect(b.throttle[0]).toBe('Space');
    expect(b.handbrake.length).toBeGreaterThan(0);
    expect(b.handbrake[0]).toBe('KeyW'); // inherits throttle's old primary
  });

  it('every rebind output survives a serialize/parse round-trip (no silent reset)', () => {
    let b = DEFAULT_BINDINGS;
    // Worst case: chain-steal single-binding actions.
    b = rebind(b, 'throttle', 'Space'); // steals handbrake's only key
    b = rebind(b, 'brake', 'KeyF'); // steals nitro's only key
    expect(parseBindings(serializeBindings(b))).toEqual(b);
  });

  it('a steer keypress cancels lingering mouse-steer bias (last device wins)', () => {
    const im = new InputManager();
    im.setMouseSteer(0.6); // cursor parked off-centre
    expect(read(im).steer).toBe(0.6);
    im.press('KeyA');
    expect(read(im).steer).toBe(-1); // pure keyboard, no +0.6 bias
    im.release('KeyA');
    expect(read(im).steer).toBe(0); // bias stays cleared until the mouse moves again
  });
});

describe('InputManager steering arbitration (bug: steer bias adds up)', () => {
  it('does not sum devices — a held key wins outright over a mouse bias', () => {
    const im = new InputManager();
    const out = createCommand();
    im.press('KeyD'); // driver is holding right
    im.setMouseSteer(-0.6); // ...and the cursor drifts left mid-hold
    im.read(out);
    expect(out.steer).toBe(1);
  });

  it('ignores gamepad stick drift inside the deadzone', () => {
    const im = new InputManager();
    const out = createCommand();
    im.setGamepad({ steer: 0.06, throttle: 0, brake: 0 }); // worn stick at rest
    im.read(out);
    expect(out.steer).toBe(0);
  });

  it('still passes a real gamepad deflection through, rescaled from the deadzone', () => {
    const im = new InputManager();
    const out = createCommand();
    im.setGamepad({ steer: 1, throttle: 0, brake: 0 });
    im.read(out);
    expect(out.steer).toBeCloseTo(1, 5);
  });

  it('falls back to the mouse only when no key or stick is active', () => {
    const im = new InputManager();
    const out = createCommand();
    im.setMouseSteer(0.5);
    im.read(out);
    expect(out.steer).toBeCloseTo(0.5, 5);
  });
});
