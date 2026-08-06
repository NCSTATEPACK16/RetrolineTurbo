# active-plan.md — Phase 4: Sprites, Traffic, Collisions, HUD; Lock the Look

Per-feature working plan (see `plan.md` §13). Replace contents when starting the next phase.
Full plan: `docs/superpowers/plans/2026-08-05-phase-4-sprites-traffic-hud.md`.
Spec: `docs/superpowers/specs/2026-08-05-phase-4-sprites-traffic-hud-design.md`.

## Goal
Add depth-sorted roadside sprites, moving AI traffic, collision detection + response, and a
live HUD to the pseudo-3D road renderer, all fed by a `PlayerState` seam, and lock the retro
look at 480×270 with a code-generated pixel-art atlas. Phase 5's real `Vehicle` implements the
same `PlayerState` interface unchanged.

## M-checklist — Phase 4 done-when
- [x] `src/types/engine.ts` — `PlayerState` seam, `SpriteFrame`/`FrameTable`, sprite-carrying `Segment`
- [x] `src/assets/spriteManifest.ts` + `packAtlas.ts` — pure manifest (scenery, 4 cars, player, 3×5 bitmap font) + shelf packer
- [x] `src/assets/generateSprites.ts` (edge, ctx) + `src/engine/SpriteAtlas.ts` (pure lookup)
- [x] `RenderBackend.drawSprite` → 10-arg source+dest+`clipBottom`; recorded in `RecordingBackend`, blitted with clip in `Canvas2DBackend`
- [x] `src/engine/Traffic.ts` — deterministic constant-speed pool with wrap (no alloc in `update`)
- [x] `TrackManager.build()` — attaches roadside scenery sprites to segments (both shoulders + sign + billboard)
- [x] `Renderer` — pre-allocated `ProjRecord[]` + far→near sprite/traffic pass, crest bottom-clip, zero per-frame alloc; constructor gains `atlas`
- [x] `src/engine/Collision.ts` — pure `isOffRoad` / `hitCar` / `responseDelta`
- [x] `src/ui/HUD.ts` — speedo/gear/timer/mini-map from `PlayerState` (bitmap-font digits + `drawQuad` strip)
- [x] `src/main.ts` — harness owns a mutable `PlayerState`; wires traffic + collision (update) and HUD (render); `present()` moved to the caller so the HUD composites before blit
- [x] `npm test` green (68 tests, up from 37) · `npm run build` clean (`tsc --noEmit` strict + Vite)
- [x] **Human visual gate PASSED** (manual, `npm run dev` @ http://localhost:5173): sprite depth-scaling, no hill bleed-through, traffic depth-sort, legible HUD, crisp nearest-neighbour, bending S-curve, disappearing far road, panning parallax, smooth ~60fps. Also closes the outstanding Phase 2+3 look gate.

## Design decisions (locked)
1. **`PlayerState` read-interface** decouples collision, HUD, and sprite render from the throwaway
   harness; Phase 5's `Vehicle` implements it unchanged.
2. **Code-generated atlas** — the pure `SPRITE_MANIFEST` (pixel-rect draw ops) is the swap seam;
   `generateSprites` draws it to one offscreen canvas at boot, `SpriteAtlas` only looks up frames.
   Art can be swapped for hand-drawn PNGs later behind the same `FrameTable`.
3. **Two-pass render** — the near→far road loop fills a pre-allocated `ProjRecord[]`; a second
   far→near pass draws sprites/traffic with painter ordering and `clipBottom = rec.maxy`. No
   per-frame allocation (hard rule 4).
4. **Determinism split** — collision + traffic advance are pure and unit-tested; the harness
   kinematics in `main.ts` stay throwaway and untested (real physics is Phase 5).
5. **`present()` is the caller's job** — `Renderer.render` no longer presents so the HUD draws
   onto the same logical frame before the blit.

## Deviations from the written plan (and why)
- **File paths** — the plan referenced `src/engine/RecordingBackend.ts`; the file actually lives at
  `src/engine/testing/RecordingBackend.ts`. Used the real location (a path fact, no design change).
- **Task 7 test 3 (bottom-clip assertion)** — the plan's literal assertion "at least one sprite has
  `clipBottom < dy+dh`" is **unsatisfiable** against the plan's own verbatim implementation: with
  base-anchored billboards (`anchorY = h`) the sprite base sits at `rec.y` and the code records
  `rec.maxy = rec.y`, so `clipBottom == dy+dh` always. The Renderer was implemented exactly as
  specified; test 3 was written as a faithful, passing substitute that exercises the same crest
  path (crest occlusion culls far sprites, mirroring the road-quad occlusion test). The
  `clipBottom` plumbing is still directly asserted at the backend level (Canvas2D save/clip/restore).
- **Type-only `engine.test.ts`** — vitest strips types via esbuild, so type-only tests can't fail at
  runtime; the red/green signal for Task 1 was `tsc --noEmit`, verified failing then clean.
- **Provisional constants** — none required retuning at the gate (look passed as-is). The sprite-scale
  expression in `Renderer.blit`, `KMH_PER_WORLD` (0.05), and the 12000 harness speed remain provisional
  and retunable without breaking the relationship-only tests.

## Done-when
Depth-sorted sprites + moving traffic render over the road, collisions slow/shove the player,
and a legible HUD (speedo/gear/timer/mini-map) reads from `PlayerState`. `npm test` + `npm run
build` green; no third-party imports in `engine/`; `Renderer.render` allocates nothing per frame
and never touches a `ctx`. Human visual gate passed (also closing Phase 2+3). ✓

## Operational carryover
- [x] `npm test` green (68) · `npm run build` clean
- [x] Supabase project `iytniuygdkwxxmtdkmlj` — `profiles`/`leaderboard`/`store_items`/`replays`
      present with **RLS enabled**; `.env` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- [ ] Netlify green — pending merge of `phase-2-3-road-rasterizer` → `main` (auto-deploys on push);
      set the two `VITE_SUPABASE_*` env vars in Netlify if not already present
