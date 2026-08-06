import type { Command } from '../physics/Vehicle.js';

export type Action =
  | 'throttle' | 'brake' | 'steerLeft' | 'steerRight'
  | 'handbrake' | 'gearUp' | 'gearDown' | 'nitro';

/** Binding table: action → KeyboardEvent.code list (first entry is primary). */
export type Bindings = Record<Action, string[]>;

const ACTIONS: readonly Action[] = [
  'throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'gearUp', 'gearDown', 'nitro',
];

/** WASD primary, arrows full mirror, Space handbrake, Q/E gears (Shift/Ctrl alternates). */
export const DEFAULT_BINDINGS: Bindings = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  gearUp: ['KeyE', 'ShiftLeft'],
  gearDown: ['KeyQ', 'ControlLeft'],
  nitro: ['KeyF'],
};

/** Pure rebind: `code` becomes primary for `action` and is removed elsewhere.
 * Stealing an action's last code swaps it the rebound action's old primary, so
 * every action always keeps ≥1 binding (parseBindings rejects empty lists —
 * an empty action would silently reset the whole table on the next load). */
export function rebind(b: Bindings, action: Action, code: string): Bindings {
  const oldPrimary = b[action][0];
  const out = {} as Bindings;
  for (const a of ACTIONS) {
    const kept = b[a].filter((c) => c !== code);
    if (a === action) out[a] = [code, ...kept];
    else if (kept.length === 0 && oldPrimary !== undefined && oldPrimary !== code) out[a] = [oldPrimary];
    else out[a] = kept;
  }
  return out;
}

export function serializeBindings(b: Bindings): string {
  return JSON.stringify(b);
}

/** Strict parse: every action present, each a non-empty string[]. Null otherwise. */
export function parseBindings(json: string): Bindings | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const out = {} as Bindings;
  for (const a of ACTIONS) {
    const v = (raw as Record<string, unknown>)[a];
    if (!Array.isArray(v) || v.length === 0 || !v.every((c) => typeof c === 'string')) return null;
    out[a] = v as string[];
  }
  return out;
}

/** Deadzone + optional exponential response. Input/output in −1..+1. */
export function mouseSteerCurve(nx: number, deadzone = 0.08, expo = false): number {
  const mag = Math.abs(nx);
  if (mag <= deadzone) return 0;
  const t = Math.min(1, (mag - deadzone) / (1 - deadzone));
  return Math.sign(nx) * (expo ? t * t : t);
}

/** Analog state pushed by the caller's gamepad poll (main.ts). */
export interface GamepadSnapshot {
  steer: number; // −1..+1
  throttle: number; // 0..1
  brake: number; // 0..1
}

/**
 * Normalizes keyboard / mouse / gamepad into one Command. The core is pure and
 * synchronous (press/release/set* mutate state; read fills a pre-allocated
 * Command — no allocation). `attach` is the only DOM-touching edge.
 */
export class InputManager {
  private readonly down = new Set<string>();
  private mouseSteer: number | null = null;
  private pad: GamepadSnapshot | null = null;
  private gearUpArmed = false;
  private gearDownArmed = false;

  constructor(public bindings: Bindings = DEFAULT_BINDINGS) {}

  setBindings(b: Bindings): void {
    this.bindings = b;
  }

  press(code: string): void {
    if (!this.down.has(code)) {
      this.down.add(code);
      if (this.bindings.gearUp.includes(code)) this.gearUpArmed = true;
      if (this.bindings.gearDown.includes(code)) this.gearDownArmed = true;
      // Last-device-wins for steering: a steer key cancels any lingering
      // mouse-position bias (the cursor otherwise injects a constant offset).
      if (this.bindings.steerLeft.includes(code) || this.bindings.steerRight.includes(code)) {
        this.mouseSteer = null;
      }
    }
  }

  /** Whether `code` is bound to any action (edge uses this to preventDefault). */
  isBound(code: string): boolean {
    for (const a of ACTIONS) if (this.bindings[a].includes(code)) return true;
    return false;
  }

  release(code: string): void {
    this.down.delete(code);
  }

  /** nx in −1..+1 (already curve-shaped by the edge), or null when inactive. */
  setMouseSteer(nx: number | null): void {
    this.mouseSteer = nx;
  }

  setGamepad(s: GamepadSnapshot | null): void {
    this.pad = s;
  }

  private held(action: Action): boolean {
    for (const code of this.bindings[action]) if (this.down.has(code)) return true;
    return false;
  }

  /** Fill `out` with the current normalized command (edge-consumes gear flags). */
  read(out: Command): void {
    out.throttle = Math.max(this.held('throttle') ? 1 : 0, this.pad?.throttle ?? 0);
    out.brake = Math.max(this.held('brake') ? 1 : 0, this.pad?.brake ?? 0);
    let steer = (this.held('steerLeft') ? -1 : 0) + (this.held('steerRight') ? 1 : 0);
    steer += this.mouseSteer ?? 0;
    steer += this.pad?.steer ?? 0;
    out.steer = Math.max(-1, Math.min(1, steer));
    out.handbrake = this.held('handbrake');
    out.nitro = this.held('nitro');
    out.gearUp = this.gearUpArmed;
    out.gearDown = this.gearDownArmed;
    this.gearUpArmed = false;
    this.gearDownArmed = false;
  }

  // NOTE: no `attach` convenience here on purpose — listener wiring lives in
  // main.ts because the RemapScreen must see every keydown before driving input
  // does; a self-attaching InputManager would bypass that gate.
}
