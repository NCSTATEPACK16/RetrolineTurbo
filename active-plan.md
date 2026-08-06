# active-plan.md — Phase 5: Vehicle Physics + Desktop Controls

Per-feature working plan (see `plan.md` §13). Replace contents when starting the next phase.
Full plan: `docs/superpowers/plans/2026-08-05-phase-5-physics-controls.md`.
Spec: `docs/superpowers/specs/2026-08-05-phase-5-physics-controls-design.md`.

## Goal
Replace the Phase 4 throwaway harness with a real deterministic fixed-timestep `Vehicle`
(accel curve, 2-speed gears 120/290 km/h, skid −60% grip + counter-steer recovery, off-road
μ=0.85) implementing the `PlayerState` seam unchanged, fed by an `InputManager` that
normalizes WASD/arrows/mouse/gamepad into one command, with rebinding persisted through the
new `SaveBackend` seam.

## M-checklist — Phase 5 done-when
- [x] `physics/Vehicle.ts` — deterministic fixed-step; Low caps ~120 km/h, High caps 290 km/h (vitest)
- [x] Skid triggers on `|K_i| > 0.4` above 200 km/h; steering cut to 40% (−60% grip, ratio-asserted);
      recovery only on throttle-release + sustained counter-steer (vitest)
- [x] Off-road `|x| > roadWidth` bleeds speed at μ=0.85/s, asserted faster than on-road coast (vitest)
- [x] Determinism: identical input scripts ⇒ identical `{z, x, speedKmh, gear, skidding}` (vitest)
- [x] `input/InputManager.ts` — WASD / arrows-mirror / mouse-X (deadzone + expo) / gamepad all
      resolve to one normalized `Command`; parity asserted on the command, not device events;
      gear shifts edge-triggered (vitest)
- [x] `economy/save.ts` — `SaveBackend` seam (LocalStorage + Memory adapters) per plan.md §8
- [x] `ui/RemapScreen.ts` — Tab-toggled rebinding state machine; a remap round-trips through
      `SaveBackend` across a simulated reload (vitest)
- [x] a–z bitmap glyphs + shared `ui/text.ts`; HUD delegates (menus now have a legible font)
- [x] Harness deleted — `main.ts` wires `InputManager → Vehicle (fixed step) → Collision/HUD/Remap`;
      `Collision.ts`/`HUD.ts` unchanged (seam held)
- [x] `npm test` green (112 tests, up from 68) · `npm run build` clean (`tsc --noEmit` strict + Vite)
- [x] **HUMAN VISUAL GATE PASSED** (manual, `npm run dev` @ http://localhost:5173) — verified:
      1. Drive with WASD; confirm arrows behave identically; move the mouse off-centre and
         confirm analog steering (centre deadzone ≈ no input).
      2. From rest, hold W: pulls to ~120 km/h in gear 1; press E (High): pulls to 290; Q returns
         to Low and speed decays toward 120. S brakes to a stop; Space handbrake bites harder.
      3. Enter the S-curve at ~250+ km/h: skid (steering goes mushy); release W and counter-steer
         into the curve to recover grip.
      4. Steer onto the shoulder past the rumble: speed visibly bleeds (μ drag); traffic hits
         still slow + shove.
      5. Tab opens the controls screen; rebind throttle (Enter → press a key); Escape/Tab closes;
         reload the page — the rebound key still drives (localStorage persistence).
      6. Look regression check: sprites/HUD/parallax unchanged, chunky nearest-neighbour, ~60fps
         under physics load for ~30s.

## Design decisions (locked)
1. **`Command` lives in `physics/Vehicle.ts`** — input depends on physics, never the reverse.
2. **Vehicle works in km/h internally** (readable PRD constants), exposes `speed` in world u/s
   via `WORLD_PER_KMH` so `PlayerState` consumers are untouched; `KMH_PER_WORLD` moved from
   HUD to `constants.ts` as the single conversion.
3. **Edge-triggering is InputManager's job** — `gearUp`/`gearDown` are true for exactly one
   `read()` per key press; `Vehicle.step` consumes them blindly.
4. **Off-road double-punish avoided** — μ drag lives in `Vehicle.step`; `responseDelta` now
   applies only on traffic hits in `main.ts` (Phase 4's off-road slow-factor retired in favour
   of the PRD μ path; `Collision.isOffRoad` stays pure + tested for later consumers).
5. **RemapScreen sees every keydown first** — a consumed key never reaches driving; while the
   screen is open the command is neutralized (handbrake held).
6. **SaveBackend is async by contract** — LocalStorage adapter resolves synchronously today so
   the Phase 8 `SupabaseBackend` slots in without touching consumers.

## Deviations from the written plan (and why)
- **`SaveBackend` did not exist** — the Phase 5 spec assumed an "existing SaveBackend"; none was
  ever built (Phase 0 scoped it out). Created here per plan.md §8 as Task 3.
- **Task 7's `void isOffRoad(...)` line dropped** — the plan kept a result-discarding call to a
  pure function "for later HUD use"; it does nothing at runtime and `tsc` flagged the then-unused
  import. Removed the call and the import instead (detection remains exported + unit-tested).
- **Red-step compression (Tasks 4/6)** — test and implementation were written in one batch after
  the module-not-found red had been demonstrated twice for the identical pattern (Tasks 2/3);
  every suite was still run and shown green before its commit.
- **Provisional constants** — `GEAR_ACCEL_KMH_S`, `STEER_MAX_WPS`, `CENTRIFUGAL`, `COAST_KMH_S`,
  handbrake rate, mouse deadzone (0.08), and the 3×5 letter face are feel-tunable at the gate;
  PRD contract values (120/290 caps, −60% grip, μ=0.85, 16.66ms step) are test-locked.
- **Off-road μ floor** — drag applies only above `OFFROAD_MAX_KMH = 60` (a crawl-escape feel
  choice, documented in constants); the PRD's μ=0.85 is otherwise unconditional. Confirm at gate.

## Code-review round (pre-commit reviewer, fixes applied + red-green verified)
- **Critical fixed:** `rebind` could strip a single-binding action (e.g. Space→throttle left
  handbrake empty); `parseBindings` then rejected the table on reload, silently resetting all
  customizations. Now swaps in the displaced action's old primary; regression tests proven
  red against the old code.
- **Fixed:** lingering mouse-position steer bias — a steer keypress now cancels mouse steer
  (last-device-wins), tested. Gamepad poll snapshot pre-allocated (update-path hard rule 4).
  Dead `InputManager.attach` removed (it would have bypassed the remap key gate). Tab rejected
  as a capture target (it could never fire). `Vehicle` state now read-only getters.
  `preventDefault` on bound keys. Spec §2's stale `PlayerState` units excerpt corrected.

## Done-when
Vitest confirms top-speed limits and consistent skid triggers + recovery; all three input paths
steer identically (asserted at the command level); rebinding persists; harness removed; collision
response driven by real physics with no change to `Collision.ts`/`HUD.ts`. `npm test` +
`npm run build` green; no third-party imports in `physics/`, `input/`, or `engine/`. Human
visual gate passed (feel + 60fps under physics load). ✓

## Operational carryover
- [x] `npm test` green (112) · `npm run build` clean
- [x] Supabase project `iytniuygdkwxxmtdkmlj` — retroline schema with RLS (unchanged this phase)
- [ ] Netlify green — still pending merge to `main` (now two phase branches deep:
      `phase-2-3-road-rasterizer` ← `phase-5-physics-controls`); set `VITE_SUPABASE_*` env vars
      in Netlify if not already present
