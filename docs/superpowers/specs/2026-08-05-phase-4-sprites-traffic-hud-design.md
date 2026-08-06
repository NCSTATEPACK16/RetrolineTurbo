# Phase 4 — Sprites, Traffic, Collisions, HUD; Lock the Look

**Date:** 2026-08-05
**Roadmap:** `plan.md` §10 Phase 4
**Predecessor:** Phase 2+3 (pseudo-3D road rasterizer — straight road, curves, hills, crest
occlusion, parallax background). Branch `phase-2-3-road-rasterizer`, merged.
**Successor:** Phase 5 — Vehicle physics + desktop controls
(`2026-08-05-phase-5-physics-controls-design.md`), which runs after this phase is thoroughly built.

---

## 1. Goal

Add roadside sprites, AI traffic, collision boundaries, and a HUD, and **finalize the retro
look** at the fixed **480×270** logical framebuffer with integer nearest-neighbour upscale.
Phase 4 carries **full behavior** — real-ish player speed and collision *response* — behind a
seam that Phase 5's real `Vehicle` replaces without a rewrite. Phase 4 also closes, for real,
the human visual gate that Phase 2+3 left outstanding (no prior session had working browser
tooling; this one does — see §7).

Hard rules from `CLAUDE.md` remain in force: segment model only; renderer stays behind
`RenderBackend` (game code never touches a `ctx`); physics is deterministic/fixed-step and
unit-tested; **no per-frame allocation in `render()`**; zero external deps in the engine core.

---

## 2. The central architectural decision — the `PlayerState` seam

Phase 4 needs speed (for the HUD) and collision response (a speed penalty / lateral nudge),
but the **real deterministic `Vehicle` is Phase 5**. Today there is only the throwaway
auto-advancing camera harness in `main.ts` (W/S speed, A/D steer, auto-advancing `z`).

**Resolution:** introduce a narrow read-interface

```ts
interface PlayerState {
  readonly z: number;      // world depth along the track (accumulated)
  readonly x: number;      // lateral position, road-normalized (−1..+1 ≈ road edges)
  readonly speed: number;  // km/h, for HUD + collision severity
  readonly gear: number;   // current gear index, for HUD
}
```

- **Phase 4:** the throwaway harness implements `PlayerState`. W/S drives `speed`, A/D drives
  `x`, `z` auto-advances from `speed`.
- **Phase 5:** `physics/Vehicle.ts` implements the **same interface** and drops in where the
  harness was. Collision, HUD, and sprite-render code — which depend **only on `PlayerState`,
  never on the harness** — are untouched.

### Determinism-rule reconciliation (explicit)

Hard rule #3 (physics deterministic / fixed-step / unit-tested) is **not** violated by Phase 4:

- The harness kinematics are **throwaway** and are deliberately **not** unit-tested as physics.
  No object claiming to be "the vehicle physics" exists until Phase 5.
- What **is** pure and unit-tested in Phase 4 is **collision detection geometry** and **traffic
  advance** (both deterministic pure functions). Collision *response* merely mutates the
  throwaway `PlayerState` and is asserted against a mock `PlayerState`, not against real physics.

This is the load-bearing decision of the phase; everything below is built on it.

---

## 3. Art pipeline — code-generated pixel atlas

"Full art pass" (a complete sprite set) with no artist or paint tool in-session is delivered as
**code**, which suits the 480×270 nearest-neighbour aesthetic (reads as intentional retro art).

- `src/assets/generateSprites.ts` — a **build/dev-time generator** that lives at the *edge*
  (like `Canvas2DBackend`), **not** in engine core. It draws every sprite as pixel primitives
  into one **atlas canvas** and emits a **frame table**:

  ```ts
  interface SpriteFrame { x: number; y: number; w: number; h: number; anchorX: number; anchorY: number; }
  type FrameTable = Record<string, SpriteFrame>;
  ```

  Generated deterministically at boot into an offscreen canvas / `ImageBitmap` — **no committed
  binary assets**, no runtime asset-fetch pipeline. Using a canvas `ctx` here is an
  asset-production concern at the edge, consistent with how `Canvas2DBackend` is the only place
  that touches `ctx`.

- **Complete set to generate:** roadside scenery (trees, bushes, rocks, road signs,
  billboards), **3–4 traffic car types**, the **player car**, and a **bitmap font** for the HUD.

- `src/engine/SpriteAtlas.ts` — holds the generated bitmap + frame table; pure lookups only.

**Swap path (documented, not built):** the frame table is the seam. Hand-drawn PNG frames can
replace generated frames 1:1 in a later polish pass by swapping the atlas source and keeping the
frame names — no engine change. Explicitly out of scope for Phase 4.

---

## 4. Components

| File | Responsibility |
|---|---|
| `src/assets/generateSprites.ts` | Edge generator → atlas canvas + `FrameTable` (see §3). |
| `src/engine/SpriteAtlas.ts` | Holds atlas bitmap + frame table; pure frame lookups. |
| `src/engine/RenderBackend.ts` | **+`drawSprite(frame, dx, dy, dw, dh)`** — primitive args only. |
| `src/engine/Canvas2DBackend.ts` | Implements `drawSprite` via `drawImage` from the atlas. |
| `src/engine/testing/RecordingBackend.ts` | Records `drawSprite` calls for headless assertions. |
| `src/engine/Traffic.ts` | Fixed pool of cars `{ z, laneOffset, speed }`; deterministic advance + wrap; **no per-frame alloc**. |
| `src/engine/Collision.ts` | **Pure**: off-road boundary + player↔traffic overlap → collision events. |
| `src/ui/HUD.ts` | Reads `PlayerState`; renders speedo, gear, timer, curvature mini-map via `drawSprite` (bitmap-font glyphs + quads). No `ctx`. |
| `src/engine/Renderer.ts` | Extended: sprite + traffic pass, far→near, `Y_clip` bottom-clip. |
| `src/types/engine.ts` | `PlayerState` interface; extend `Sprite` if needed (normalized `offset ∈ [−1,+1]`). |
| `src/main.ts` | Harness implements `PlayerState`; wires collision response + HUD. |

### Renderer sprite/traffic pass

After the existing near→far segment loop, iterate all sprites (scenery + traffic) **far→near**
(painter's order, depth-merged), and per sprite:

```
scale  = d_screen / z_i
X_draw = x_screen(i) + scale * X_offset * (W/2)
Y_draw = y_screen(i)
```

**Bottom-clip each sprite's lower scanlines against that segment's `Y_clip`** so trackside
objects and cars do not bleed through hill crests. Scratch objects reused — **no per-frame
allocation**, no draw-list, no `ctx`.

---

## 5. Data flow (one frame)

```
harness updates PlayerState (speed/x/z; W-S-A-D)
  → clear + sky/parallax background (existing)
  → segment loop near→far: projection, Y_clip, quads/rumble/lanes (existing)
  → sprite + traffic pass far→near with Y_clip bottom-clip (NEW)
  → player car sprite (steer tilt) (NEW)
  → collision check: PlayerState × traffic + road edges → events (NEW)
      → response mutates PlayerState (speed penalty / lateral nudge) (NEW)
  → HUD from PlayerState: speedo, gear, timer, mini-map (NEW)
  → present
```

Look-lock: confirm **480×270** logical buffer + **integer nearest-neighbour** upscale
(`image-rendering: pixelated`, integer scale factor to the window).

---

## 6. Testing — headless

All via Vitest in the `node` environment (no jsdom, zero deps), asserting **relationships** not
absolute pixels, consistent with the Phase 2+3 `RecordingBackend` convention:

- **Sprite scaling:** near sprite wider/taller than the same sprite far (monotonic with `1/z`).
- **Bottom-clip:** a sprite whose base projects below a crest's `Y_clip` is clipped/discarded.
- **Draw order:** sprites + traffic emitted **far→near** (assert recorded call order).
- **Traffic:** advance is deterministic; cars wrap correctly at the track end; pool size fixed.
- **Collision detection:** off-road boundary true/false (`|playerX| > roadEdge`); player↔traffic
  overlap true/false across z-range and lateral overlap cases.
- **Collision response:** applied to a mock `PlayerState` (speed reduced / x nudged) as expected.
- **Frame-table integrity:** every frame name the renderer/HUD references exists in the table.

---

## 7. Visual gate — now achievable (closes the Phase 2+3 gate too)

Environment verified this session: `npm test` green (37 baseline tests), `npm run dev` boots
Vite (~90ms, HTTP 200 at `localhost:5173`), and the `claude-in-chrome` skill can screenshot the
running dev server (requires the Chrome extension to grant localhost permission).

Gate steps:

1. `npm run dev`; open `localhost:5173` via `claude-in-chrome`; capture screenshots.
2. Confirm: sprites scale correctly with distance; **no hill bleed-through**; traffic moves and
   is depth-sorted with scenery; HUD legible (speedo/gear/timer/mini-map); nearest-neighbour
   crisp; the S-curve bends and far road disappears over the crest; parallax bands pan; 60fps.
3. **This retroactively closes the outstanding Phase 2+3 look gate** (colours, smoothness,
   bending horizon, disappearing far road, panning bands) — same running build.

---

## 8. Done-when

- Dozens of sprites + traffic render **depth-sorted with no hill bleed-through at 60fps**.
- Collision **response visibly affects** the harness (speed penalty / lateral nudge).
- HUD is **live from `PlayerState`** (speedo, gear, timer, curvature mini-map).
- The full **code-generated art set + bitmap font** are present and consumed via the atlas seam.
- **Visual gate passed with screenshots** (§7), retroactively closing the Phase 2+3 look gate.
- `npm test` and `npm run build` (`tsc --noEmit` strict + Vite) green; no third-party imports in
  `engine/`; `Renderer.render` reuses scratch (no per-frame draw list, no `ctx`).
- **480×270 + integer nearest-neighbour upscale confirmed on screen.**

### Appendix — operational carryover (now unblocked)

Phase 0 carryover was never closed because earlier sessions lacked tooling. The branch now
pushes (`origin → NCSTATEPACK16/RetrolineTurbo`, upstream set). Close as side-tasks:

- [ ] Confirm Netlify build is green from the pushed branch / `main`.
- [ ] Confirm the Supabase §8 schema + RLS migration is applied; `.env` present.

These are recommended but not core blockers of the Phase 4 look-lock.
