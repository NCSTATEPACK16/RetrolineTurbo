# Phase 5 — Vehicle Physics + Desktop Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 4 throwaway harness with a real deterministic fixed-timestep `Vehicle` (accel curve, 2-speed gears, skid/recovery, off-road drag) implementing the existing `PlayerState` seam, fed by an `InputManager` that normalizes keyboard/mouse/gamepad into one command, with rebinding persisted through a new `SaveBackend` seam.

**Architecture:** `physics/Vehicle.ts` is a pure, allocation-free state machine stepped inside the existing `createLoop` accumulator; it implements `PlayerState` so `Collision.ts`, `HUD.ts`, and the Renderer sprite pass consume it unchanged. `input/InputManager.ts` is a pure core (press/release/mouse/gamepad state → pre-allocated normalized `Command`) with a thin untested listener-attachment edge. `economy/save.ts` introduces the `SaveBackend` interface (plan.md §8) with LocalStorage + in-memory adapters; `ui/RemapScreen.ts` is a keyboard-driven state machine persisting bindings through it, rendered with new A–Z bitmap-font glyphs via a shared `ui/text.ts` helper.

**Tech Stack:** TypeScript (strict), Vite, Vitest (node environment, zero deps). Canvas 2D behind `RenderBackend`.

## Global Constraints

- **Segment model only** — no WebGL/Three.js/real 3D. (`CLAUDE.md` hard rule 1)
- **Renderer stays behind `RenderBackend`** — game code never touches a `ctx`. Only `Canvas2DBackend.ts` and `assets/generateSprites.ts` may. (hard rule 2)
- **Physics is deterministic & fixed-timestep** (1/60s accumulator, `STEP_S`), decoupled from render, unit-tested in Vitest. Identical inputs ⇒ identical state. (hard rule 3)
- **No per-frame allocation in `render()` or `update()` hot paths** — the `Command` object is pre-allocated and refilled; `Vehicle.step` allocates nothing. (hard rule 4)
- **Zero external deps in `physics/`, `input/`, `engine/`** — native browser APIs only. (hard rule 5)
- **Test environment is Vitest `node`** — no jsdom. Anything needing `window`/`localStorage` is split so its pure core tests in node (`vi.stubGlobal` precedent: `Canvas2DBackend.test.ts`).
- Tests assert **relationships and specified limits** (caps, ratios, monotonic decay), never incidental absolutes — provisional feel constants stay retunable at the visual gate.
- **Physics targets (plan.md §7 PRD):** 2-speed transmission Low 0→120 km/h (high torque), High 120→**290 km/h**; skid on `|K_i| > threshold` at high speed → **grip −60%**; recovery = throttle release + counter-steer; off-road `μ_offroad = 0.85`; fixed step 16.66 ms.
- **Controls (plan.md §10 Phase 5):** WASD default (W gas / S brake, A/D steer), arrows full mirror, analog mouse-X steer (deadzone + optional expo), gamepad (LT/RT + left stick), Space handbrake, Q/E gears (Shift/Ctrl alternates). All schemes resolve to the same normalized command.
- Run `npm test` and `npm run build` green before every commit that closes a task.
- All work on branch `phase-5-physics-controls` off `phase-2-3-road-rasterizer`. No push, no PR, no merge to `main`.

**Spec:** `docs/superpowers/specs/2026-08-05-phase-5-physics-controls-design.md`

---

## File Structure

**Create:**
- `src/physics/Vehicle.ts` — deterministic vehicle state machine implementing `PlayerState`. + test
- `src/input/InputManager.ts` — bindings, normalized `Command`, pure device-state core + listener edge. + test
- `src/economy/save.ts` — `SaveBackend` interface, `MemorySaveBackend`, `LocalStorageSaveBackend`. + test
- `src/ui/text.ts` — shared `drawText` (digits + letters + punctuation) over the atlas font. + test
- `src/ui/RemapScreen.ts` — rebinding state machine + render. + test

**Modify:**
- `src/constants.ts` — physics/tuning constants; `KMH_PER_WORLD` moves here from `HUD.ts`.
- `src/types/engine.ts` — delete the placeholder `Vehicle` interface (superseded by the class).
- `src/assets/spriteManifest.ts` — add `glyph_a`…`glyph_z` 3×5 letter glyphs.
- `src/ui/HUD.ts` — import `KMH_PER_WORLD` from constants; drawString delegates to `ui/text.ts`.
- `src/main.ts` — harness deleted; wire `InputManager → Vehicle → Renderer/Collision/HUD/RemapScreen`.

---

## Task 0: Branch

- [ ] `git checkout -b phase-5-physics-controls` (off `phase-2-3-road-rasterizer`).

---

## Task 1: Physics constants + type cleanup

**Files:**
- Modify: `src/constants.ts`, `src/types/engine.ts`, `src/ui/HUD.ts`
- Test: existing suites (no new file; `tsc --noEmit` is the red/green signal for the type deletion, Phase 4 precedent)

**Interfaces:**
- Produces (all exported from `constants.ts`): `KMH_PER_WORLD = 0.05`; `WORLD_PER_KMH = 1 / KMH_PER_WORLD`; `GEAR_MAX_KMH = [120, 290]`; `GEAR_ACCEL_KMH_S = [60, 25]`; `BRAKE_KMH_S = 180`; `HANDBRAKE_KMH_S = 270`; `COAST_KMH_S = 20`; `MU_OFFROAD = 0.85`; `OFFROAD_MAX_KMH = 60`; `STEER_MAX_WPS = 2500`; `CENTRIFUGAL = 9000`; `SKID_CURVE_THRESHOLD = 0.4`; `SKID_SPEED_KMH = 200`; `SKID_GRIP = 0.4`; `SKID_SPEED_DECAY = 0.9`; `SKID_RECOVERY_STEPS = 12`.
- Consumed by Tasks 2 and 6. `HUD.speedToKmh` keeps its exact behavior, now reading the shared constant.

- [ ] **Step 1: Edit `src/constants.ts`** — append:

```ts
/**
 * Vehicle tuning (plan.md §7 PRD). Display/UI works in km/h; the world sim works
 * in world units (u/s). `KMH_PER_WORLD` is the single conversion (moved from HUD).
 * Feel numbers are provisional and retuned at the Phase 5 visual gate; the PRD
 * limits (gear caps, −60% skid grip, μ_offroad) are contractual and tested.
 */
export const KMH_PER_WORLD = 0.05; // world u/s → km/h display
export const WORLD_PER_KMH = 1 / KMH_PER_WORLD;

export const GEAR_MAX_KMH = [120, 290] as const; // Low, High top speeds
export const GEAR_ACCEL_KMH_S = [60, 25] as const; // zero-speed accel per gear (Low torquey)
export const BRAKE_KMH_S = 180; // full-brake decel
export const HANDBRAKE_KMH_S = 270; // handbrake decel
export const COAST_KMH_S = 20; // engine-drag decel at zero throttle
export const MU_OFFROAD = 0.85; // per-second speed retention factor off-road
export const OFFROAD_MAX_KMH = 60; // off-road drag only bleeds speed above this
export const STEER_MAX_WPS = 2500; // lateral world u/s at full steer authority
export const CENTRIFUGAL = 9000; // curvature × speedRatio² lateral push (world u/s)
export const SKID_CURVE_THRESHOLD = 0.4; // |segment curve| that can trigger a skid
export const SKID_SPEED_KMH = 200; // min speed for a skid trigger
export const SKID_GRIP = 0.4; // steering grip while skidding (−60%)
export const SKID_SPEED_DECAY = 0.9; // per-second speed retention while skidding
export const SKID_RECOVERY_STEPS = 12; // consecutive counter-steer steps to recover
```

- [ ] **Step 2: Edit `src/types/engine.ts`** — delete the placeholder `Vehicle` interface (lines 61–65, the `TODO(Phase 5)` block). Nothing imports it (the class in Task 2 supersedes it).

- [ ] **Step 3: Edit `src/ui/HUD.ts`** — delete the local `const KMH_PER_WORLD = 0.05;` and add `KMH_PER_WORLD` to the existing `../constants.js` import.

- [ ] **Step 4: Verify** — `npx vitest run && npm run build`. Expected: all green (behavior unchanged), `tsc` clean (proves nothing referenced the deleted interface).

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts src/types/engine.ts src/ui/HUD.ts
git commit -m "feat(physics): single-source vehicle tuning constants; retire placeholder Vehicle type"
```

---

## Task 2: `physics/Vehicle.ts` — deterministic vehicle (TDD core of the phase)

**Files:**
- Create: `src/physics/Vehicle.ts`
- Test: `src/physics/Vehicle.test.ts`

**Interfaces:**
- Consumes: `PlayerState` (types), Task 1 constants, `STEP_S`.
- Produces:
  - `interface Command { throttle: number; brake: number; steer: number; handbrake: boolean; gearUp: boolean; gearDown: boolean; nitro: boolean }` (exported here; `InputManager` imports it — physics owns the contract).
  - `createCommand(): Command` — all-zero/false factory (pre-allocated once by callers).
  - `class Vehicle implements PlayerState { constructor(roadWidth: number); readonly z, x, speed, gear; readonly speedKmh: number; readonly skidding: boolean; step(cmd: Command, curvature: number, dt?: number): void; applyCollision(speedFactor: number, xPush: number): void; reset(): void }`
  - `gear` is 1 (Low) or 2 (High) — matches the HUD's existing display of `PlayerState.gear`.
  - `speed` (world u/s, for `PlayerState` consumers) = `speedKmh * WORLD_PER_KMH`.

**Model (all mutation in `step`, no allocation):**
- Gear shifts on the `gearUp`/`gearDown` command flags (edge-triggering is `InputManager`'s job, Task 4).
- Throttle: `speedKmh += GEAR_ACCEL_KMH_S[g] * throttle * (1 − speedKmh / GEAR_MAX_KMH[g]) * dt` — tapering curve, natural cap at the gear max. If above the current gear's cap (downshift), decay at `COAST_KMH_S`.
- Brake: `−BRAKE_KMH_S * brake * dt`; handbrake: `−HANDBRAKE_KMH_S * dt`; zero throttle: `−COAST_KMH_S * dt`. Clamp ≥ 0.
- Off-road (`|x| > roadWidth`) and `speedKmh > OFFROAD_MAX_KMH`: `speedKmh *= MU_OFFROAD ** dt`.
- Steering: `x += steer * STEER_MAX_WPS * grip * authority * dt` with `authority = min(1, speedKmh / 60)` and `grip = skidding ? SKID_GRIP : 1`.
- Centrifugal: `x −= curvature * CENTRIFUGAL * (speedKmh / 290)² * dt`.
- Skid trigger: `!skidding && |curvature| > SKID_CURVE_THRESHOLD && speedKmh > SKID_SPEED_KMH` → `skidding = true`, `skidDir = sign(curvature)`, counter counter reset. While skidding: `speedKmh *= SKID_SPEED_DECAY ** dt`. Recovery: each step with `throttle < 0.05 && steer * skidDir > 0` increments the counter (counter-steer pushes *toward* the curve center, i.e. same sign as `curvature` since centrifugal pushes opposite); any other input resets it; at `SKID_RECOVERY_STEPS` → `skidding = false`.
- `z += speed * dt` (never wraps here; track wrap is the caller's concern as today).
- `applyCollision(f, push)`: `speedKmh *= f; x += push` — lets `main.ts` apply `Collision.responseDelta` to real physics.

- [ ] **Step 1: Write the failing test**

```ts
// src/physics/Vehicle.test.ts
import { describe, it, expect } from 'vitest';
import { Vehicle, createCommand, type Command } from './Vehicle.js';
import { STEP_S, GEAR_MAX_KMH, SKID_GRIP, SKID_RECOVERY_STEPS } from '../constants.js';

const ROAD = 2000;

/** Run `n` fixed steps with a mutator applied to a pre-allocated command. */
function run(v: Vehicle, n: number, set: (c: Command) => void, curvature = 0): void {
  const cmd = createCommand();
  for (let i = 0; i < n; i++) {
    cmd.throttle = 0; cmd.brake = 0; cmd.steer = 0;
    cmd.handbrake = false; cmd.gearUp = false; cmd.gearDown = false; cmd.nitro = false;
    set(cmd);
    v.step(cmd, curvature, STEP_S);
  }
}

function shiftUp(v: Vehicle): void {
  const cmd = createCommand();
  cmd.gearUp = true;
  v.step(cmd, 0, STEP_S);
}

describe('Vehicle transmission + top speed', () => {
  it('starts in Low gear at rest, implementing PlayerState', () => {
    const v = new Vehicle(ROAD);
    expect(v.gear).toBe(1);
    expect(v.speed).toBe(0);
    expect(v.z).toBe(0);
    expect(v.x).toBe(0);
  });

  it('Low gear caps near 120 km/h under full throttle', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 60, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBeLessThanOrEqual(GEAR_MAX_KMH[0]);
    expect(v.speedKmh).toBeGreaterThan(GEAR_MAX_KMH[0] * 0.95);
  });

  it('High gear caps at 290 km/h under full throttle', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    shiftUp(v);
    expect(v.gear).toBe(2);
    run(v, 60 * 120, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBeLessThanOrEqual(GEAR_MAX_KMH[1]);
    expect(v.speedKmh).toBeGreaterThan(GEAR_MAX_KMH[1] * 0.95);
  });

  it('gearDown above the Low cap decays speed toward the Low cap', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    shiftUp(v);
    run(v, 60 * 60, (c) => { c.throttle = 1; });
    const cmd = createCommand();
    cmd.gearDown = true;
    v.step(cmd, 0, STEP_S);
    expect(v.gear).toBe(1);
    const before = v.speedKmh;
    run(v, 60 * 5, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBeLessThan(before);
  });

  it('brakes decelerate to a stop', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 10, (c) => { c.throttle = 1; });
    run(v, 60 * 10, (c) => { c.brake = 1; });
    expect(v.speedKmh).toBe(0);
  });
});

describe('Vehicle skid + recovery (PRD: grip −60%)', () => {
  /** Drive to High-gear speed above the skid threshold, on a straight. */
  function fastVehicle(): Vehicle {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    shiftUp(v);
    run(v, 60 * 60, (c) => { c.throttle = 1; });
    return v;
  }

  it('does not skid below the curve threshold', () => {
    const v = fastVehicle();
    run(v, 10, (c) => { c.throttle = 1; }, 0.2);
    expect(v.skidding).toBe(false);
  });

  it('triggers a skid on sharp curvature at high speed, and cuts steering to 40%', () => {
    const gripped = fastVehicle();
    const x0 = gripped.x;
    run(gripped, 1, (c) => { c.steer = 1; }, 0);
    const grippedDx = gripped.x - x0;

    const skidder = fastVehicle();
    run(skidder, 1, (c) => { c.throttle = 1; }, 0.6); // trigger
    expect(skidder.skidding).toBe(true);
    const x1 = skidder.x;
    run(skidder, 1, (c) => { c.steer = 1; }, 0);
    const skidDx = skidder.x - x1;
    expect(skidDx / grippedDx).toBeCloseTo(SKID_GRIP, 1);
  });

  it('recovers after sustained throttle-release + counter-steer, not while accelerating', () => {
    const v = fastVehicle();
    run(v, 1, (c) => { c.throttle = 1; }, 0.6);
    expect(v.skidding).toBe(true);
    run(v, SKID_RECOVERY_STEPS + 2, (c) => { c.throttle = 1; c.steer = 1; }, 0);
    expect(v.skidding).toBe(true); // throttle held → no recovery
    run(v, SKID_RECOVERY_STEPS + 2, (c) => { c.steer = 1; }, 0);
    expect(v.skidding).toBe(false); // released + counter-steer → recovered
  });

  it('bleeds speed while skidding', () => {
    const v = fastVehicle();
    run(v, 1, (c) => { c.throttle = 1; }, 0.6);
    const before = v.speedKmh;
    run(v, 60, () => {}, 0);
    expect(v.speedKmh).toBeLessThan(before);
  });
});

describe('Vehicle off-road drag (PRD: μ = 0.85)', () => {
  it('bleeds speed off-road faster than the same coast on-road', () => {
    const on = new Vehicle(ROAD);
    run(on, 60 * 10, (c) => { c.throttle = 1; });
    const off = new Vehicle(ROAD);
    run(off, 60 * 10, (c) => { c.throttle = 1; });
    run(off, 60 * 3, (c) => { c.steer = 1; }); // drive off the shoulder
    expect(Math.abs(off.x)).toBeGreaterThan(ROAD);

    const onBefore = on.speedKmh;
    const offBefore = off.speedKmh;
    run(on, 60, () => {});
    run(off, 60, () => {});
    expect((off.speedKmh / offBefore)).toBeLessThan(on.speedKmh / onBefore);
  });
});

describe('Vehicle centrifugal + collision response + determinism', () => {
  it('curvature pushes the car laterally opposite the curve at speed', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 20, (c) => { c.throttle = 1; });
    const x0 = v.x;
    run(v, 60, (c) => { c.throttle = 1; }, 0.3);
    expect(v.x).toBeLessThan(x0); // positive curve → pushed negative-x
  });

  it('applyCollision scales speed and shoves laterally', () => {
    const v = new Vehicle(ROAD);
    run(v, 60 * 10, (c) => { c.throttle = 1; });
    const s = v.speedKmh;
    v.applyCollision(0.6, -150);
    expect(v.speedKmh).toBeCloseTo(s * 0.6);
    expect(v.x).toBeCloseTo(-150);
  });

  it('identical input scripts produce identical state (hard rule 3)', () => {
    const script = (v: Vehicle): void => {
      run(v, 600, (c) => { c.throttle = 1; }, 0.1);
      const cmd = createCommand(); cmd.gearUp = true; v.step(cmd, 0.1, STEP_S);
      run(v, 600, (c) => { c.throttle = 0.7; c.steer = 0.4; }, -0.5);
      run(v, 300, (c) => { c.brake = 0.5; }, 0);
    };
    const a = new Vehicle(ROAD); script(a);
    const b = new Vehicle(ROAD); script(b);
    expect(a.z).toBe(b.z);
    expect(a.x).toBe(b.x);
    expect(a.speedKmh).toBe(b.speedKmh);
    expect(a.gear).toBe(b.gear);
    expect(a.skidding).toBe(b.skidding);
  });

  it('reset returns to the initial state', () => {
    const v = new Vehicle(ROAD);
    run(v, 120, (c) => { c.throttle = 1; c.steer = 0.5; });
    v.reset();
    expect(v.z).toBe(0); expect(v.x).toBe(0); expect(v.speedKmh).toBe(0);
    expect(v.gear).toBe(1); expect(v.skidding).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/physics/Vehicle.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/physics/Vehicle.ts`**

```ts
import type { PlayerState } from '../types/engine.js';
import {
  STEP_S, WORLD_PER_KMH,
  GEAR_MAX_KMH, GEAR_ACCEL_KMH_S, BRAKE_KMH_S, HANDBRAKE_KMH_S, COAST_KMH_S,
  MU_OFFROAD, OFFROAD_MAX_KMH,
  STEER_MAX_WPS, CENTRIFUGAL,
  SKID_CURVE_THRESHOLD, SKID_SPEED_KMH, SKID_GRIP, SKID_SPEED_DECAY, SKID_RECOVERY_STEPS,
} from '../constants.js';

/** Normalized per-step driver intent. Filled by InputManager; owned by physics
 * so the dependency points input → physics, not both ways. `gearUp`/`gearDown`
 * are edge-triggered (true for exactly one step per press). */
export interface Command {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // −1 (left) .. +1 (right)
  handbrake: boolean;
  gearUp: boolean;
  gearDown: boolean;
  nitro: boolean; // reserved (Phase 9 economy / Phase 10 juice)
}

/** All-neutral command. Callers allocate one and refill it per step (hard rule 4). */
export function createCommand(): Command {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, gearUp: false, gearDown: false, nitro: false };
}

/**
 * Deterministic arcade vehicle (plan.md §7 PRD). Fixed-step state machine:
 * every field is a number/boolean mutated in `step` — no allocation, no time
 * source of its own, no rendering knowledge. Implements the PlayerState seam
 * established in Phase 4, so collision/HUD/sprite consumers are unchanged.
 */
export class Vehicle implements PlayerState {
  z = 0; // world depth along the track
  x = 0; // world lateral position (track-centre-relative)
  speedKmh = 0;
  gear = 1; // 1 = Low, 2 = High (HUD displays this directly)

  private isSkidding = false;
  private skidDir = 0; // sign of the curvature that triggered the skid
  private recoverySteps = 0;

  constructor(private readonly roadWidth: number) {}

  /** World-units-per-second speed for PlayerState consumers. */
  get speed(): number {
    return this.speedKmh * WORLD_PER_KMH;
  }

  get skidding(): boolean {
    return this.isSkidding;
  }

  /** Advance one fixed step. `curvature` is the current segment's K_i. */
  step(cmd: Command, curvature: number, dt: number = STEP_S): void {
    // -- transmission -------------------------------------------------------
    if (cmd.gearUp && this.gear < GEAR_MAX_KMH.length) this.gear++;
    if (cmd.gearDown && this.gear > 1) this.gear--;
    const g = this.gear - 1;
    const gearMax = GEAR_MAX_KMH[g]!;

    // -- longitudinal -------------------------------------------------------
    if (cmd.handbrake) {
      this.speedKmh -= HANDBRAKE_KMH_S * dt;
    } else if (cmd.brake > 0) {
      this.speedKmh -= BRAKE_KMH_S * cmd.brake * dt;
    } else if (cmd.throttle > 0 && this.speedKmh < gearMax) {
      // Tapering accel curve: full torque at rest, zero at the gear cap.
      this.speedKmh += GEAR_ACCEL_KMH_S[g]! * cmd.throttle * (1 - this.speedKmh / gearMax) * dt;
    } else {
      this.speedKmh -= COAST_KMH_S * dt; // engine drag (also drains an over-cap downshift)
    }
    if (Math.abs(this.x) > this.roadWidth && this.speedKmh > OFFROAD_MAX_KMH) {
      this.speedKmh *= MU_OFFROAD ** dt;
    }
    if (this.isSkidding) this.speedKmh *= SKID_SPEED_DECAY ** dt;
    if (this.speedKmh < 0) this.speedKmh = 0;

    // -- skid trigger / recovery -------------------------------------------
    if (!this.isSkidding) {
      if (Math.abs(curvature) > SKID_CURVE_THRESHOLD && this.speedKmh > SKID_SPEED_KMH) {
        this.isSkidding = true;
        this.skidDir = Math.sign(curvature);
        this.recoverySteps = 0;
      }
    } else {
      // Counter-steer points into the curve (against the centrifugal shove).
      const counterSteering = cmd.steer * this.skidDir > 0;
      if (cmd.throttle < 0.05 && counterSteering) {
        if (++this.recoverySteps >= SKID_RECOVERY_STEPS) {
          this.isSkidding = false;
          this.skidDir = 0;
        }
      } else {
        this.recoverySteps = 0;
      }
    }

    // -- lateral ------------------------------------------------------------
    const grip = this.isSkidding ? SKID_GRIP : 1;
    const authority = Math.min(1, this.speedKmh / 60); // no curb-steering at rest
    this.x += cmd.steer * STEER_MAX_WPS * grip * authority * dt;
    const speedRatio = this.speedKmh / GEAR_MAX_KMH[GEAR_MAX_KMH.length - 1]!;
    this.x -= curvature * CENTRIFUGAL * speedRatio * speedRatio * dt;

    // -- longitudinal advance ----------------------------------------------
    this.z += this.speed * dt;
  }

  /** Apply a Collision.responseDelta (speed multiplier + lateral shove). */
  applyCollision(speedFactor: number, xPush: number): void {
    this.speedKmh *= speedFactor;
    this.x += xPush;
  }

  reset(): void {
    this.z = 0; this.x = 0; this.speedKmh = 0; this.gear = 1;
    this.isSkidding = false; this.skidDir = 0; this.recoverySteps = 0;
  }
}
```

- [ ] **Step 4: Run tests + build** — `npx vitest run src/physics/Vehicle.test.ts && npm run build`. Expected: PASS; clean. If a feel-threshold assertion misses (e.g. 95%-of-cap), tune the constant in Task 1's block — never weaken the PRD caps/ratios.

- [ ] **Step 5: Commit**

```bash
git add src/physics/Vehicle.ts src/physics/Vehicle.test.ts
git commit -m "feat(physics): deterministic fixed-step Vehicle — gears, skid/recovery, off-road drag"
```

---

## Task 3: `economy/save.ts` — the SaveBackend seam

**Files:**
- Create: `src/economy/save.ts`
- Test: `src/economy/save.test.ts`

**Interfaces:**
- Produces: `interface SaveBackend { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }`; `class MemorySaveBackend implements SaveBackend`; `class LocalStorageSaveBackend implements SaveBackend` (namespace-prefixed keys `retroline:<key>`). Consumed by Task 5 (RemapScreen) now; by the Phase 8 `SupabaseBackend` and Phase 9 economy later (plan.md §8 client seam).
- Async by contract so the Supabase adapter slots in without touching consumers.

- [ ] **Step 1: Write the failing test**

```ts
// src/economy/save.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySaveBackend, LocalStorageSaveBackend } from './save.js';

describe('MemorySaveBackend', () => {
  it('round-trips a value and misses unknown keys', async () => {
    const b = new MemorySaveBackend();
    expect(await b.get('nope')).toBeNull();
    await b.set('k', 'v');
    expect(await b.get('k')).toBe('v');
  });
});

describe('LocalStorageSaveBackend', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
  });

  it('round-trips through localStorage under a namespaced key', async () => {
    const b = new LocalStorageSaveBackend();
    await b.set('bindings', '{"a":1}');
    expect(store.has('retroline:bindings')).toBe(true);
    expect(await b.get('bindings')).toBe('{"a":1}');
  });

  it('misses unknown keys as null', async () => {
    const b = new LocalStorageSaveBackend();
    expect(await b.get('missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/economy/save.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/economy/save.ts`**

```ts
/**
 * SaveBackend seam (plan.md §8): game systems persist through this interface
 * only. LocalStorage adapter now; SupabaseBackend implements the same contract
 * in Phase 8, so consumers swap backends without code changes. Async by
 * contract for that reason even though localStorage is synchronous.
 */
export interface SaveBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** In-memory adapter for tests and non-persistent contexts. */
export class MemorySaveBackend implements SaveBackend {
  private readonly store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
}

const NS = 'retroline:';

/** Browser localStorage adapter. Keys are namespaced to avoid collisions. */
export class LocalStorageSaveBackend implements SaveBackend {
  get(key: string): Promise<string | null> {
    return Promise.resolve(localStorage.getItem(NS + key));
  }

  set(key: string, value: string): Promise<void> {
    localStorage.setItem(NS + key, value);
    return Promise.resolve();
  }
}
```

- [ ] **Step 4: Run tests + build** — `npx vitest run src/economy/save.test.ts && npm run build`. Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/economy/save.ts src/economy/save.test.ts
git commit -m "feat(economy): SaveBackend seam with LocalStorage + in-memory adapters"
```

---

## Task 4: `input/InputManager.ts` — bindings + normalized command

**Files:**
- Create: `src/input/InputManager.ts`
- Test: `src/input/InputManager.test.ts`

**Interfaces:**
- Consumes: `Command`, `createCommand` (Task 2).
- Produces:
  - `type Action = 'throttle' | 'brake' | 'steerLeft' | 'steerRight' | 'handbrake' | 'gearUp' | 'gearDown' | 'nitro'`
  - `type Bindings = Record<Action, string[]>` (values are `KeyboardEvent.code` strings)
  - `DEFAULT_BINDINGS: Bindings` — WASD primary + arrows mirror + Space/Q/E + Shift/Ctrl alternates.
  - `rebind(b: Bindings, action: Action, code: string): Bindings` — pure; returns a new table with `code` prepended for `action` and removed everywhere else.
  - `serializeBindings(b: Bindings): string` / `parseBindings(json: string): Bindings | null` (null on malformed/incomplete input; parse validates every action key exists with a non-empty string array).
  - `mouseSteerCurve(nx: number, deadzone?: number, expo?: boolean): number` — pure deadzone + optional exponential response, output −1..+1.
  - `interface GamepadSnapshot { steer: number; throttle: number; brake: number }`
  - `class InputManager { constructor(bindings?: Bindings); bindings: Bindings; setBindings(b: Bindings): void; press(code: string): void; release(code: string): void; setMouseSteer(nx: number | null): void; setGamepad(s: GamepadSnapshot | null): void; read(out: Command): void; attach(target: Pick<Window, 'addEventListener'>): void }`
  - `read` fills the caller's pre-allocated `Command`; digital + mouse + gamepad steer sum then clamp to ±1; `gearUp`/`gearDown` are edge-triggered per press (true in exactly one `read` after each key transition).
  - `attach` is the thin untested edge: wires `keydown`/`keyup` (by `e.code`) and `mousemove` (normalizes `clientX` to −1..+1 over `innerWidth`, routed through `mouseSteerCurve`). Gamepad is polled by the caller (`navigator.getGamepads()` in `main.ts`) and pushed via `setGamepad` — keeps the core synchronous and testable.

- [ ] **Step 1: Write the failing test**

```ts
// src/input/InputManager.test.ts
import { describe, it, expect } from 'vitest';
import {
  InputManager, DEFAULT_BINDINGS, rebind, serializeBindings, parseBindings, mouseSteerCurve,
} from './InputManager.js';
import { createCommand } from '../physics/Vehicle.js';

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
    expect(c.steer).toBe(-0.5); expect(c.throttle).toBe(0.8); expect(c.brake).toBe(0.2);
  });

  it('combined sources clamp steer to ±1', () => {
    const im = new InputManager();
    im.press('KeyD'); im.setMouseSteer(0.8);
    expect(read(im).steer).toBe(1);
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
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/input/InputManager.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/input/InputManager.ts`**

```ts
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

/** Pure rebind: `code` becomes primary for `action` and is removed elsewhere. */
export function rebind(b: Bindings, action: Action, code: string): Bindings {
  const out = {} as Bindings;
  for (const a of ACTIONS) {
    const kept = b[a].filter((c) => c !== code);
    out[a] = a === action ? [code, ...kept] : kept;
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
    }
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

  /** DOM edge (untested): key events by code; mouse-X → curve → setMouseSteer. */
  attach(target: Pick<Window, 'addEventListener'>): void {
    target.addEventListener('keydown', (e) => { this.press((e as KeyboardEvent).code); });
    target.addEventListener('keyup', (e) => { this.release((e as KeyboardEvent).code); });
    target.addEventListener('mousemove', (e) => {
      const nx = ((e as MouseEvent).clientX / window.innerWidth) * 2 - 1;
      this.setMouseSteer(mouseSteerCurve(nx));
    });
  }
}
```

- [ ] **Step 4: Run tests + build** — `npx vitest run src/input/InputManager.test.ts && npm run build`. Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/input/InputManager.ts src/input/InputManager.test.ts
git commit -m "feat(input): keyboard/mouse/gamepad normalized into one Command; pure rebind + parse"
```

---

## Task 5: Letter glyphs + shared `ui/text.ts`

**Files:**
- Modify: `src/assets/spriteManifest.ts`
- Create: `src/ui/text.ts`
- Modify: `src/ui/HUD.ts` (drawString delegates)
- Test: `src/ui/text.test.ts`; extend `src/assets/packAtlas.test.ts`

**Interfaces:**
- Consumes: `SpriteAtlas` (frame lookup), `RenderBackend.drawSprite` 10-arg form.
- Produces: manifest entries `glyph_a` … `glyph_z` (3×5, same style as `digit_*`); `drawText(backend: RenderBackend, atlas: SpriteAtlas, text: string, x: number, y: number, scale?: number): void` mapping `0-9 → digit_*`, `a-z/A-Z → glyph_*`, `: .` → `glyph_colon`, space advances without drawing. RemapScreen (Task 6) and HUD consume it.

- [ ] **Step 1: Write the failing tests**

```ts
// src/assets/packAtlas.test.ts — add inside the existing describe
it('includes the a–z letter glyphs for menu text', () => {
  const names = SPRITE_MANIFEST.map((e) => e.name);
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') expect(names).toContain(`glyph_${ch}`);
});
```

```ts
// src/ui/text.test.ts
import { describe, it, expect } from 'vitest';
import { drawText } from './text.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('drawText', () => {
  it('draws one sprite per visible glyph, none for spaces', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'gear up', 0, 0);
    expect(b.sprites.length).toBe(6); // 'gearup' — the space advances silently
  });

  it('advances the pen x monotonically', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'abc', 10, 5);
    const xs = b.sprites.map((s) => s.dx);
    expect(xs[0]).toBe(10);
    expect(xs[1]).toBeGreaterThan(xs[0]!);
    expect(xs[2]).toBeGreaterThan(xs[1]!);
  });

  it('mixes digits, letters and punctuation in one string', () => {
    const b = new RecordingBackend();
    drawText(b, atlas, 'lap 1:23.4', 0, 0);
    expect(b.sprites.length).toBe(9); // l a p 1 : 2 3 . 4
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/ui/text.test.ts src/assets/packAtlas.test.ts`. Expected: FAIL — glyphs missing, module not found.

- [ ] **Step 3: Add letters to `src/assets/spriteManifest.ts`**

Next to `DIGIT_ROWS`, add (provisional 3×5 face — retuned at the gate like the digits):

```ts
// 3×5 uppercase letter glyphs, same row-bitmask scheme as DIGIT_ROWS.
const LETTER_ROWS: Record<string, number[]> = {
  a: [0b010, 0b101, 0b111, 0b101, 0b101], b: [0b110, 0b101, 0b110, 0b101, 0b110],
  c: [0b011, 0b100, 0b100, 0b100, 0b011], d: [0b110, 0b101, 0b101, 0b101, 0b110],
  e: [0b111, 0b100, 0b110, 0b100, 0b111], f: [0b111, 0b100, 0b110, 0b100, 0b100],
  g: [0b011, 0b100, 0b101, 0b101, 0b011], h: [0b101, 0b101, 0b111, 0b101, 0b101],
  i: [0b111, 0b010, 0b010, 0b010, 0b111], j: [0b001, 0b001, 0b001, 0b101, 0b010],
  k: [0b101, 0b110, 0b100, 0b110, 0b101], l: [0b100, 0b100, 0b100, 0b100, 0b111],
  m: [0b101, 0b111, 0b111, 0b101, 0b101], n: [0b110, 0b101, 0b101, 0b101, 0b101],
  o: [0b111, 0b101, 0b101, 0b101, 0b111], p: [0b110, 0b101, 0b110, 0b100, 0b100],
  q: [0b111, 0b101, 0b101, 0b111, 0b001], r: [0b110, 0b101, 0b110, 0b101, 0b101],
  s: [0b011, 0b100, 0b010, 0b001, 0b110], t: [0b111, 0b010, 0b010, 0b010, 0b010],
  u: [0b101, 0b101, 0b101, 0b101, 0b111], v: [0b101, 0b101, 0b101, 0b101, 0b010],
  w: [0b101, 0b101, 0b111, 0b111, 0b101], x: [0b101, 0b101, 0b010, 0b101, 0b101],
  y: [0b101, 0b101, 0b010, 0b010, 0b010], z: [0b111, 0b001, 0b010, 0b100, 0b111],
};
function letterEntries(): SpriteEntry[] {
  return Object.entries(LETTER_ROWS).map(([ch, rows]) => {
    const ops: DrawOp[] = [];
    rows.forEach((mask, ry) => {
      for (let c = 0; c < 3; c++) if (mask & (0b100 >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: '#e8e8f0' });
    });
    return { name: `glyph_${ch}`, w: 3, h: 5, anchorX: 1, anchorY: 2, ops };
  });
}
```

and spread `...letterEntries(),` into `SPRITE_MANIFEST` after `...digitEntries(),`.

- [ ] **Step 4: Write `src/ui/text.ts`**

```ts
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';

/** Atlas frame name for a drawable character, or null for a plain advance. */
function frameName(ch: string): string | null {
  if (ch === ' ') return null;
  if (ch >= '0' && ch <= '9') return `digit_${ch}`;
  if (ch === ':' || ch === '.') return 'glyph_colon';
  const lower = ch.toLowerCase();
  if (lower >= 'a' && lower <= 'z') return `glyph_${lower}`;
  return null; // unknown chars advance silently (no throw in a render path)
}

/** Draw `text` with the 3×5 bitmap font, top-left at (x, y), integer scale. */
export function drawText(
  backend: RenderBackend, atlas: SpriteAtlas, text: string, x: number, y: number, scale = 2,
): void {
  let cx = x;
  for (const ch of text) {
    const name = frameName(ch);
    if (name !== null) {
      const f = atlas.frame(name);
      backend.drawSprite(atlas.image, f.x, f.y, f.w, f.h, cx, y, f.w * scale, f.h * scale, 9999);
      cx += (f.w + 1) * scale;
    } else {
      cx += 4 * scale;
    }
  }
}
```

- [ ] **Step 5: Refactor `HUD.drawString` to delegate** — replace its body with a call to `drawText(backend, this.atlas, text, x, y, HUD.SCALE)` (import from `./text.js`); delete the now-unused per-char logic. HUD's public API and tests are untouched.

- [ ] **Step 6: Run tests + build** — `npx vitest run && npm run build`. Expected: all green (HUD tests still pass — same call shape), build clean.

- [ ] **Step 7: Commit**

```bash
git add src/assets/spriteManifest.ts src/assets/packAtlas.test.ts src/ui/text.ts src/ui/text.test.ts src/ui/HUD.ts
git commit -m "feat(ui): a-z bitmap glyphs + shared drawText; HUD delegates"
```

---

## Task 6: `ui/RemapScreen.ts` — rebinding UI persisted via SaveBackend

**Files:**
- Create: `src/ui/RemapScreen.ts`
- Test: `src/ui/RemapScreen.test.ts`

**Interfaces:**
- Consumes: `InputManager`, `Bindings`, `rebind`, `serializeBindings`, `parseBindings`, `DEFAULT_BINDINGS` (Task 4); `SaveBackend` (Task 3); `drawText` + `SpriteAtlas` (Task 5); `RenderBackend`.
- Produces:
  - `BINDINGS_KEY = 'bindings'`
  - `loadBindings(backend: SaveBackend): Promise<Bindings>` — parses the stored JSON; falls back to `DEFAULT_BINDINGS` when missing/malformed.
  - `class RemapScreen { constructor(atlas: SpriteAtlas, save: SaveBackend, input: InputManager); readonly open: boolean; readonly capturing: boolean; toggle(): void; handleKey(code: string): boolean; render(backend: RenderBackend): void; readonly lastPersist: Promise<void> }`
  - `handleKey` returns `true` when the screen consumed the key (main.ts gates driving input on it). Closed: only `Tab` toggles open. Open: `ArrowUp`/`ArrowDown` move the selection over the 8 actions, `Enter` starts capture, `Escape`/`Tab` closes. Capturing: the next code (except `Escape`, which cancels) rebinds the selected action via `rebind`, pushes the new table into the InputManager (`setBindings`) and persists it (`save.set(BINDINGS_KEY, serializeBindings(...))`; the in-flight promise is exposed as `lastPersist` so tests can await it).
  - `render` draws nothing when closed; when open draws a backdrop quad plus one `drawText` row per action (`<action> <primary code>`), the selected row prefixed with `>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/RemapScreen.test.ts
import { describe, it, expect } from 'vitest';
import { RemapScreen, loadBindings, BINDINGS_KEY } from './RemapScreen.js';
import { InputManager, DEFAULT_BINDINGS, serializeBindings, rebind } from '../input/InputManager.js';
import { MemorySaveBackend } from '../economy/save.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const make = () => {
  const save = new MemorySaveBackend();
  const input = new InputManager();
  return { save, input, screen: new RemapScreen(atlas, save, input) };
};

describe('RemapScreen state machine', () => {
  it('opens and closes on Tab, consuming the key only while relevant', () => {
    const { screen } = make();
    expect(screen.open).toBe(false);
    expect(screen.handleKey('KeyW')).toBe(false); // closed: driving keys pass through
    expect(screen.handleKey('Tab')).toBe(true);
    expect(screen.open).toBe(true);
    expect(screen.handleKey('KeyW')).toBe(true); // open: everything is consumed
    expect(screen.handleKey('Escape')).toBe(true);
    expect(screen.open).toBe(false);
  });

  it('captures the next key for the selected action and updates the InputManager', async () => {
    const { screen, input } = make();
    screen.handleKey('Tab');
    screen.handleKey('Enter'); // capture for the first action (throttle)
    expect(screen.capturing).toBe(true);
    screen.handleKey('KeyJ');
    await screen.lastPersist;
    expect(screen.capturing).toBe(false);
    expect(input.bindings.throttle[0]).toBe('KeyJ');
  });

  it('Escape cancels a capture without rebinding', () => {
    const { screen, input } = make();
    screen.handleKey('Tab');
    screen.handleKey('Enter');
    screen.handleKey('Escape');
    expect(screen.capturing).toBe(false);
    expect(input.bindings.throttle[0]).toBe('KeyW');
  });

  it('a rebind round-trips through the SaveBackend (persists across “reload”)', async () => {
    const { screen, save } = make();
    screen.handleKey('Tab');
    screen.handleKey('ArrowDown'); // select brake
    screen.handleKey('Enter');
    screen.handleKey('KeyK');
    await screen.lastPersist;
    const reloaded = await loadBindings(save); // fresh session against the same store
    expect(reloaded.brake[0]).toBe('KeyK');
    expect(reloaded.throttle[0]).toBe('KeyW');
  });
});

describe('loadBindings fallback', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await loadBindings(new MemorySaveBackend())).toEqual(DEFAULT_BINDINGS);
  });
  it('returns defaults when the stored JSON is malformed', async () => {
    const save = new MemorySaveBackend();
    await save.set(BINDINGS_KEY, '{broken');
    expect(await loadBindings(save)).toEqual(DEFAULT_BINDINGS);
  });
  it('returns the stored table when valid', async () => {
    const save = new MemorySaveBackend();
    const custom = rebind(DEFAULT_BINDINGS, 'nitro', 'KeyN');
    await save.set(BINDINGS_KEY, serializeBindings(custom));
    expect(await loadBindings(save)).toEqual(custom);
  });
});

describe('RemapScreen render', () => {
  it('draws nothing when closed', () => {
    const { screen } = make();
    const b = new RecordingBackend();
    screen.render(b);
    expect(b.sprites.length).toBe(0);
    expect(b.quads.length).toBe(0);
  });
  it('draws a backdrop and one text row per action when open', () => {
    const { screen } = make();
    screen.handleKey('Tab');
    const b = new RecordingBackend();
    screen.render(b);
    expect(b.quads.length).toBeGreaterThan(0);
    expect(b.sprites.length).toBeGreaterThan(8 * 3); // ≥ a few glyphs per row × 8 rows
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/ui/RemapScreen.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/ui/RemapScreen.ts`**

```ts
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { SaveBackend } from '../economy/save.js';
import {
  DEFAULT_BINDINGS, parseBindings, rebind, serializeBindings,
  type Action, type Bindings, type InputManager,
} from '../input/InputManager.js';
import { drawText } from './text.js';

export const BINDINGS_KEY = 'bindings';

const ACTIONS: readonly Action[] = [
  'throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'gearUp', 'gearDown', 'nitro',
];

/** Stored bindings, or the defaults when absent/malformed. */
export async function loadBindings(backend: SaveBackend): Promise<Bindings> {
  const raw = await backend.get(BINDINGS_KEY);
  if (raw === null) return DEFAULT_BINDINGS;
  return parseBindings(raw) ?? DEFAULT_BINDINGS;
}

/**
 * Keyboard-driven rebinding screen. Pure state machine + render; persistence
 * goes through the SaveBackend seam (LocalStorage now, Supabase in Phase 8).
 * main.ts routes every keydown here first; a consumed key never reaches driving.
 */
export class RemapScreen {
  private isOpen = false;
  private isCapturing = false;
  private selected = 0;
  lastPersist: Promise<void> = Promise.resolve();

  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly save: SaveBackend,
    private readonly input: InputManager,
  ) {}

  get open(): boolean { return this.isOpen; }
  get capturing(): boolean { return this.isCapturing; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.isCapturing = false;
  }

  /** Route a keydown code. Returns true when consumed (main.ts gates on this). */
  handleKey(code: string): boolean {
    if (!this.isOpen) {
      if (code === 'Tab') { this.toggle(); return true; }
      return false;
    }
    if (this.isCapturing) {
      if (code !== 'Escape') {
        const next = rebind(this.input.bindings, ACTIONS[this.selected]!, code);
        this.input.setBindings(next);
        this.lastPersist = this.save.set(BINDINGS_KEY, serializeBindings(next));
      }
      this.isCapturing = false;
      return true;
    }
    if (code === 'Escape' || code === 'Tab') this.toggle();
    else if (code === 'ArrowUp') this.selected = (this.selected + ACTIONS.length - 1) % ACTIONS.length;
    else if (code === 'ArrowDown') this.selected = (this.selected + 1) % ACTIONS.length;
    else if (code === 'Enter') this.isCapturing = true;
    return true; // open screen swallows everything
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    // Backdrop: two triangles of one dark quad across the panel area.
    backend.drawQuad(LOGICAL_WIDTH / 2, 20, 180, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 20, 180, '#101018');
    drawText(backend, this.atlas, 'controls  tab close', 70, 28);
    for (let i = 0; i < ACTIONS.length; i++) {
      const a = ACTIONS[i]!;
      const marker = i === this.selected ? (this.isCapturing ? 'press key' : '>') : ' ';
      const label = `${marker} ${a} ${this.input.bindings[a][0] ?? ''}`;
      drawText(backend, this.atlas, label, 70, 48 + i * 16);
    }
  }
}
```

(`drawQuad`'s existing signature in this repo is `(xTop, yTop, wTop, xBottom, yBottom, wBottom, color)` — trapezoid centre+half-width form; the call above draws a full-height panel strip. Verify against `RenderBackend.ts` and adjust the literal args if the parameter order differs — the test only asserts a quad is emitted.)

- [ ] **Step 4: Run tests + build** — `npx vitest run && npm run build`. Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/RemapScreen.ts src/ui/RemapScreen.test.ts
git commit -m "feat(ui): RemapScreen rebinding state machine persisted via SaveBackend"
```

---

## Task 7: Rewire `main.ts` — Vehicle replaces the harness

**Files:**
- Modify: `src/main.ts`
- No test file — `main.ts` stays the thin wiring edge; every system it wires is unit-tested above. Verification: build + the visual gate.

- [ ] **Step 1: Rewrite the Phase 4 harness block**

Replace everything from the `player`/`playerView` declarations through the `createLoop({...}).start()` call (keep the canvas/backend/fit prelude, atlas/track/renderer/HUD/traffic construction, and the `ensureAnonSession` tail):

```ts
import { Vehicle, createCommand } from './physics/Vehicle.js';
import { InputManager, mouseSteerCurve } from './input/InputManager.js';
import { LocalStorageSaveBackend } from './economy/save.js';
import { RemapScreen, loadBindings } from './ui/RemapScreen.js';
// (drop the throwaway keydown/keyup listeners and the mutable `player` object)

// --- Phase 5: real physics behind the PlayerState seam ------------------------
const save = new LocalStorageSaveBackend();
const input = new InputManager();
const vehicle = new Vehicle(DEFAULT_TRACK_CONFIG.roadWidth);
const remap = new RemapScreen(atlas, save, input);
const cmd = createCommand(); // pre-allocated; refilled每 step (hard rule 4)

void loadBindings(save).then((b) => { input.setBindings(b); });

// RemapScreen sees every key first; unconsumed keys drive the InputManager.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault(); // keep focus in the game
  if (!remap.handleKey(e.code)) input.press(e.code);
});
window.addEventListener('keyup', (e) => { input.release(e.code); });
window.addEventListener('mousemove', (e) => {
  input.setMouseSteer(mouseSteerCurve((e.clientX / window.innerWidth) * 2 - 1));
});

function pollGamepad(): void {
  const pad = navigator.getGamepads?.()[0];
  if (!pad) { input.setGamepad(null); return; }
  input.setGamepad({
    steer: pad.axes[0] ?? 0,
    throttle: pad.buttons[7]?.value ?? 0, // RT
    brake: pad.buttons[6]?.value ?? 0, // LT
  });
}

const cfg = {
  roadWidth: DEFAULT_TRACK_CONFIG.roadWidth,
  segmentLength: DEFAULT_TRACK_CONFIG.segmentLength,
  carHalfWidthPx: 900,
};
let elapsedMs = 0;

createLoop({
  update: (dt: number): void => {
    pollGamepad();
    input.read(cmd);
    if (remap.open) { cmd.throttle = 0; cmd.brake = 0; cmd.steer = 0; cmd.handbrake = true; }

    const seg = track.segment(Math.floor(vehicle.z / DEFAULT_TRACK_CONFIG.segmentLength));
    vehicle.step(cmd, seg.curve, dt);
    elapsedMs += dt * 1000;
    traffic.update(dt);

    const ev = { offRoad: isOffRoad(vehicle.x, cfg.roadWidth), hit: hitCar(vehicle, cars, cfg) != null };
    const d = responseDelta(ev);
    if (ev.hit || ev.offRoad) {
      vehicle.applyCollision(d.speedFactor, (vehicle.x >= 0 ? -1 : 1) * d.xPush * dt * (ev.hit ? 1 : 0));
    }

    camera.z = vehicle.z;
    camera.x = vehicle.x;
  },
  render: (): void => {
    const base = Math.floor(camera.z / DEFAULT_TRACK_CONFIG.segmentLength);
    renderer.render(camera, track, backend, background, traffic, track.segment(base).curve);
    hud.render(vehicle, elapsedMs, track, camera, backend);
    remap.render(backend);
    backend.present();
  },
}).start();
```

Note: `off-road response now lives in Vehicle.step` (μ drag) *and* `responseDelta` (Phase 4 slow-factor). To avoid double-punishing, pass `d.speedFactor` only on `hit`: change the guard to `if (ev.hit) vehicle.applyCollision(d.speedFactor, (vehicle.x >= 0 ? -1 : 1) * d.xPush * dt);` — off-road drag is the Vehicle's own μ path. (`Collision.isOffRoad` still feeds the HUD/gate observation later; detection stays pure and tested.)

- [ ] **Step 2: Fix the mojibake** — the line `// pre-allocated; refilled每 step` above contains a stray CJK character from this plan's authoring; write it as `// pre-allocated; refilled each step (hard rule 4)`.

- [ ] **Step 3: Build + full test run** — `npx vitest run && npm run build`. Expected: all green; `tsc` catches any missed import or the removed harness references.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: replace Phase 4 harness with Vehicle + InputManager + RemapScreen wiring"
```

---

## Task 8: Gate + active-plan roll

**Files:**
- Modify: `active-plan.md`

- [ ] **Step 1: Full verification** — `npx vitest run` (expect > 100 tests, all green) and `npm run build` clean.
- [ ] **Step 2: Rewrite `active-plan.md`** to Phase 5 with the M-checklist of `plan.md` §10 Phase 5 Done-when items, all code items checked, the **human visual gate left `[ ]` pending** with exact `npm run dev` verification steps (drive with WASD/arrows/mouse, shift Q/E, skid on the S-curve at speed, off-road drag on the shoulder, Tab → remap a key → reload → binding persists).
- [ ] **Step 3: Record deviations-from-plan** and operational carryover (Netlify merge still pending from Phase 4) in `active-plan.md`.
- [ ] **Step 4: Commit**

```bash
git add active-plan.md docs/superpowers/plans/2026-08-05-phase-5-physics-controls.md
git commit -m "chore: roll active-plan to Phase 5; visual gate pending"
```

- [ ] **Step 5: STOP** — Phase 5's Done-when includes feel/visual verification (plan.md: "all three input paths steer identically", 60fps under physics load). That is a human gate: report the `npm run dev` checklist and halt the loop.

---

## Self-Review

**Spec coverage** (`2026-08-05-phase-5-physics-controls-design.md`):
- §2 seam: `Vehicle implements PlayerState`, harness deleted, Collision/HUD unchanged → Tasks 2, 7. ✓
- §3.1 physics targets: gears 120/290, skid −60%, counter-steer recovery, μ=0.85, fixed 16.66ms → Tasks 1–2. ✓
- §3.2 input schemes: WASD/arrows/mouse/gamepad/Space/Q-E+Shift-Ctrl, one normalized command → Task 4. ✓
- §3.3 RemapScreen + SaveBackend persistence → Tasks 3, 6 (SaveBackend did not exist; created here per plan.md §8 — recorded as a deviation-from-spec-assumption). ✓
- §4 tests: top speed, skid+recovery, off-road, input parity, rebind round-trip, determinism → Tasks 2, 4, 6. ✓
- §5 done-when: all covered; visual gate handled in Task 8 as a human stop. ✓

**Placeholder scan:** all code blocks complete; the two deliberate "verify against the real signature" notes (drawQuad arg order, mojibake fix) name the exact check and file. ✓

**Type consistency:** `Command` fields (`throttle, brake, steer, handbrake, gearUp, gearDown, nitro`) identical across Tasks 2, 4, 7. `Bindings`/`Action` identical across Tasks 4, 6. `SaveBackend.get/set` identical across Tasks 3, 6. `drawText(backend, atlas, text, x, y, scale?)` identical across Tasks 5, 6. `Vehicle.step(cmd, curvature, dt?)`, `applyCollision(speedFactor, xPush)` identical across Tasks 2, 7. ✓
