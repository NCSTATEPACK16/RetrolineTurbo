# Phase 5 — Vehicle Physics + Desktop Controls

**Date:** 2026-08-05
**Roadmap:** `plan.md` §10 Phase 5
**Predecessor:** Phase 4 — Sprites, Traffic, Collisions, HUD; Lock the Look
(`2026-08-05-phase-4-sprites-traffic-hud-design.md`).
**Runs when:** Phase 4 is thoroughly built and its visual gate has passed.

---

## 1. Goal

Deliver the arcade driving feel and the primary desktop input scheme. Replace Phase 4's
throwaway camera harness with a **real, deterministic, fixed-timestep `Vehicle`** that
implements the exact `PlayerState` interface Phase 4's collision / HUD / sprite-render code
already depends on — so it **drops in with no changes to those consumers**.

Hard rules from `CLAUDE.md` remain in force, and this phase is where hard rule #3 (physics
deterministic / fixed-step / **unit-tested**) is fully realized in a first-class module.

---

## 2. Integration point — the `PlayerState` seam

Phase 4 established:

```ts
interface PlayerState {
  readonly z: number;      // world depth along the track
  readonly x: number;      // world lateral position (track-centre-relative)
  readonly speed: number;  // world units / second (HUD converts to km/h)
  readonly gear: number;   // current gear index
}
```

Phase 5 work:

- `physics/Vehicle.ts` **implements `PlayerState`** and becomes the single source of player
  state, fed by input each fixed step.
- The throwaway harness in `main.ts` is **deleted**; `main.ts` now wires
  `InputManager → Vehicle (fixed step) → Renderer/Collision/HUD`.
- Collision **response** (built in Phase 4 against `PlayerState`) is now driven by **real
  physics** with no code change to `Collision.ts` or `HUD.ts`.

---

## 3. Components

| File | Responsibility |
|---|---|
| `physics/Vehicle.ts` | Deterministic fixed 1/60s step; accel curve, 2-speed gears, skid state, recovery, off-road drag. Implements `PlayerState`. |
| `physics/loop.ts` (existing) | Fixed-timestep accumulator already present — `Vehicle.step()` runs inside it; render interpolates. |
| `input/InputManager.ts` | Keyboard / mouse / gamepad → a **normalized command** `{ throttle, brake, steer, handbrake, gearUp/Down, nitro }`. |
| `ui/RemapScreen.ts` | Full key/button rebinding UI; persists via existing `SaveBackend`. |
| `main.ts` | Wires input → Vehicle (fixed step) → Renderer/Collision/HUD; harness removed. |

### 3.1 `Vehicle.ts` physics targets (from `plan.md` §7 PRD)

- **2-speed transmission:** Low `0 → 120 km/h` (high torque), High `120 → 290 km/h` (top speed).
- **Skid:** entering a segment with `K_i > threshold` at high speed triggers skid → **grip −60%**.
- **Recovery:** requires **releasing throttle + counter-steering**.
- **Off-road:** drag `μ_offroad = 0.85` when `|x|` exceeds the road edge.
- **Fixed step:** 16.66 ms; fully deterministic (identical inputs → identical state).

### 3.2 `InputManager.ts` schemes (from `plan.md` §10 Phase 5)

- **WASD default:** W = gas, S = brake (stacked), A/D = steer.
- **Arrows:** full mirror alternate of WASD.
- **Analog mouse-X steering:** centre deadzone (tunable), optional exponential sensitivity curve.
- **Gamepad:** LT/RT (brake/gas) + left stick steer.
- **Space** = handbrake; **Q/E or Shift/Ctrl** = gears / nitro.
- Mouse also drives all menus.

All schemes resolve to the **same normalized command** consumed by `Vehicle` — no scheme has a
privileged path.

### 3.3 `RemapScreen.ts`

Full rebinding of every action; writes bindings through the existing `SaveBackend` interface
(LocalStorage adapter now; Supabase later, Phase 8) so remaps round-trip across reloads.

---

## 4. Testing — Vitest (deterministic)

- **Top speed:** deterministic ticks → Low gear caps near 120 km/h; High gear caps at **290 km/h**.
- **Skid:** triggers on overspeed cornering (`K_i > threshold` at high speed); **recovery** on
  throttle-release + counter-steer restores grip.
- **Off-road:** drag `μ=0.85` applied when off the road edge; speed bleeds as expected.
- **Input parity:** WASD, arrows, and mouse-X all produce **identical steer commands** for
  equivalent inputs (assert the normalized command, not device events).
- **Rebinding:** a remap **round-trips** through `SaveBackend` (save → reload → same bindings).
- **Determinism:** a fixed input script produces identical `Vehicle` state across runs.

---

## 5. Done-when (from `plan.md` §10 Phase 5, plus seam integration)

- Vitest confirms top-speed limits (Low ~120, High 290) and consistent skid triggers + recovery.
- **All three input paths steer identically**; rebinding persists.
- The throwaway harness is removed; `Vehicle` is the sole `PlayerState` source.
- **Collision response (from Phase 4) is now driven by real physics** with no change to
  `Collision.ts` / `HUD.ts`.
- The **Phase 4 look still passes its visual gate** with real driving (60fps under physics load,
  no regressions in the sprite/HUD render).
- `npm test` and `npm run build` green; no third-party imports in `physics/` or `engine/`.
