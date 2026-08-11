# active-plan.md — Phase 7.5: TX-1 Arcade Visuals & the Sprite/Asset Pipeline

Per-feature working plan (see `plan.md` §10 Phase 7.5).

**Research:** `docs/research/2026-08-10-art-direction-asset-pipeline-research.md`
**Specs (sequenced A→B→C→D):**
- A — `docs/superpowers/specs/2026-08-10-a-art-direction-road-layout.md`
- B — `docs/superpowers/specs/2026-08-10-b-atlas-engine-v2.md`
- C — `docs/superpowers/specs/2026-08-10-c-vehicle-bake-pipeline.md`
- D — `docs/superpowers/specs/2026-08-10-d-props-parallax-effects.md`

**Implementation plans:** matching filenames under `docs/superpowers/plans/`.
**Superseded:** `docs/superpowers/specs/2026-08-06-sprite-asset-pipeline-spec.md` (see its banner).

## Goal

Reframe the game with the proper assets: one master palette, a road that never strobes,
the researched TX-1 screen layout, and pre-rendered car sprites drawn on a discrete scale
ladder with anchored overlays — so the 80-part Phase 9 economy has somewhere to land.

---

## Already done (carried forward)

- [x] `ui/HUD.ts` — TX-1 solid blue header (`#000088`) + accent border, persistent 5-stage
      route tree, colour-coded captions/values, gold star `PASSED CARS` gauge (vitest, 9 tests).
      Enabled by a palette-baked colour font: `FONT_COLORS` glyph sets in `spriteManifest.ts`
      + `drawText(..., color)` (vitest, 5+4 tests).
      ⚠️ **Spec A reworks this** to a 40px header with SCORE/SPEED in the bottom corners.
- [x] `engine/Background.ts` — pre-rendered horizon plates (`Backdrop.ts` pure math +
      `loadBackdrops.ts` edge) panning with camera-x and curvature, seam-free wrap, band
      fallback when unloaded; stage→plate journey map city→coastal→desert (vitest, 19 tests).
- [x] `scripts/prep_backgrounds.py` — chroma-key letterbox crop, horizon crop, area-downscale,
      adaptive palette quantise, mirror for seamless wrap → `public/assets/backgrounds/*.png`
      + `manifest.json`. 14.7 MB source → 152 KB shipped.
- [x] `Traffic.ts` & `main.ts` — overtake detection (`Traffic.countOvertakes`, wrap/hand-off
      guarded) feeding `economy/score.ts` `ScoreState` (`passedCars`, +100 pts/pass); reset on
      restart (vitest, 10 tests).

---

## M-checklist — Spec A · art direction, road surface, layout lock

*No asset dependency. Ships visible value on its own.*

- [x] `src/assets/palette.json` + `palette.ts` — 40–48 colour master palette, shared with the
      Python bake scripts; `ui.*` provably identical to the shipped `FONT_COLORS` (vitest)
      → 51 colours stored, core 26/28, budget 52. `STAR_UNLIT` exported to be guarded.
- [x] `src/constants.ts` — `COLORS` derived from the palette; kerbs to `#d02020`/`#f0f0f0`;
      new `shoulder` (vitest)
- [x] `src/engine/roadBanding.ts` — anti-strobe band merge at the horizon, pure + unit-tested (vitest)
- [x] `src/engine/Renderer.ts` — shoulder quad at 1.22× drawn widest-first; merged bands; lane
      dash suppressed on merged bands (vitest)
- [x] `src/math/projection.ts` — `projectY` made horizon-aware *(added task, not in the original
      checklist)*. It hardcoded `height / 2`, so moving `HORIZON_Y` alone would have slid the
      backdrop without moving the road. Landed first as a pure refactor with a green suite.
- [x] `src/constants.ts` — layout lock: `HORIZON_Y` 135→118, `HEADER_H` 40, `HUD_ROW_Y` 248,
      `PLAYER_CAR_BASE_Y` 232, `PLAYER_CAR_WIDTH` 120 (vitest)
      ⚠️ highest-risk change — moving the horizon shifts every projected segment and sprite
- [x] `src/ui/HUD.ts` — 40px header; SCORE bottom-left / SPEED bottom-right; `textWidth` helper
      for right-alignment (vitest). Only the mini-map test needed deleting; the other 13 HUD
      tests reference `HUD.HEADER_H` symbolically and passed 24→40 unchanged.
- [x] `src/assets/spriteManifest.ts` — 2×2 grid lint with explicit exemptions (font, stars);
      non-compliant entries rounded to the grid. **No renames** — `track/schema.ts` `VALID_SPRITES`
      depends on the names (vitest). No `w`/`h` changed, so the packed atlas is byte-identical.
- [x] `scripts/sample_palette.py` + `scripts/requirements.txt` (Pillow — none declared today)
- [ ] **VISUAL GATE:** no kerb strobe at full speed **or at crawl**; road greys read as texture;
      kerb red does not vibrate against foliage green
      → **still owed — requires a human at `npm run dev`.** Automated gates are green:
        **281 tests / 33 files** (was 243/30), `npm run build` clean.

**Cut from Spec A:** the grass banding stretch item (spec §4.4) has no task and was not
implemented. It is perf-gated in the spec and should be attempted only after a frame-time
baseline exists.

## M-checklist — Spec B · atlas engine v2

*Depends on A. Buildable and fully testable before any PNG exists.*

- [x] `src/math/ladder.ts` — 12-step ladder, nearest-not-floor snapping, allocation-free, total
      over degenerate input (vitest, 9 tests). Guards `LADDER[0] === PLAYER_CAR_WIDTH` so Spec C
      can draw the player at a native step.
- [x] `src/engine/SpriteComposer.ts` — normalised anchor → overlay rect, with the `x → 1−x`
      flip mirror. Deliberately **not** on `RenderBackend` (vitest, 6 tests)
- [x] `src/engine/AtlasManifest.ts` — defensive parser; never throws (vitest, 6 tests)
- [x] `src/engine/CarFrameSet.ts` — integer-indexed lookup; **no per-frame string construction**
      (vitest, 5 tests)
- [x] `src/engine/RenderBackend.ts` + `Canvas2DBackend.ts` + `RecordingBackend.ts` — optional
      `flipX` via negative-scale transform (vitest, 4 tests). `SpriteCall` gains `flipX`.
- [x] `src/engine/loadAtlases.ts` — cars/props/ui/effects, never rejects, fire-and-forget in
      `main.ts` (**no `await` before constructing `Renderer`/`HUD`**) (vitest, 5 tests).
      Covers the real miss path: Vite/Netlify answer a missing manifest **200 with index.html**,
      so `res.ok` is true and only the JSON parse reveals it.
- [x] **The six existing `SpriteAtlas` test files pass unchanged** — procedural atlas is permanent.
      None of the six is in the Spec B diff at all.
- [x] **VISUAL GATE:** `Renderer.ts` and all of `src/ui/` are untouched by Spec B; the only
      render-path edit is `Canvas2DBackend.drawSprite`, whose `flipX = false` default takes the
      byte-identical branch. Every RecordingBackend geometry assertion passes unmodified.
      ⚠️ Not yet done: the interactive before/after screenshot diff (needs a browser).

## M-checklist — Spec C · vehicle bake pipeline

*Depends on B. ⚠️ Requires network access for model downloads before anything else can start.*

- [x] `art/models/` — Kenney Car Kit + RGS_Dev (CC0, separated wheels) + `LICENSES.md`;
      wheels-separate, poly count, and body symmetry all verified in Blender. **The bake uses
      RGS_Dev `Sports.fbx`** (794-tri body + 4 separate wheels, materials split by function).
      Kenney's cars are one mesh with a single texture-atlas material — no separate wheel
      passes, no cheap repaint — so they stay as a fallback source only.
- [x] `scripts/imageops.py` — shared downscale + **both** quantise modes (adaptive for plates,
      fixed for sprites); `prep_backgrounds.py` refactored onto it with **byte-identical output**
- [x] `scripts/render_car_sprites.py` + `scripts/postprocess_cars.py` — headless Blender 5.2
      (`BLENDER_EEVEE`, `Standard` view transform, `film_transparent`, 1px Freestyle), 3 angles ×
      12 steps × 2 colours, body / per-wheel / brake-light passes, **anchors projected from the
      3D scene** and cross-checked against each overlay's own crop centre.
      **Split across two interpreters:** Blender 5.2 bundles Python 3.13 with no Pillow, so the
      render stage is stdlib-only and the image stages run under `.venv`. `npm run bake:cars`
      chains render → clamp → pack.
- [x] `scripts/pack_atlas.py` — POT ≤2048×2048 (actual: **1024×1024**, 252 frames, 90 KB), 2px
      gutter + 1px bleed, manifest accepted by Spec B's parser unchanged; golden-fixture
      round-trip test (vitest + pytest)
- [x] `src/types/engine.ts` — `PlayerState` widened with `steer`, `skidding` **and `braking`**
      (the brake-light overlay needed a signal Task 5 had not surfaced) (vitest)
- [x] `src/engine/Renderer.ts` — ladder quantisation in `blit`; `selectCarFrame`; overlay culling;
      brake lights as an overlay; body roll by vertical offset, **never rotation** (vitest).
      **`quantisedWidth` extends the ladder's geometric series past both ends**: roadside props
      project from ~32px down to half a pixel, and clamping them to the ladder's 10px floor would
      have drawn a tree 300 segments away the same size as one 30 segments away.
      Wheels draw **under** the body — they are baked with the body hidden, so painting them on
      top laid a whole wheel over the arch.
- [ ] **VISUAL GATE:** no pixel crawl at **any** speed including crawl; overlays stay attached
      through a **hard left turn**

## M-checklist — Spec D · props, parallax, effects, font

*Depends on C. Smallest and most deferrable. Parallax first, font is the designated cut.*

- [x] Second parallax layer — **drawn in FRONT of the plates, not behind them.** The spec and plan
      both called for a far layer behind at `BACKDROP_FAR_SPEED < BACKDROP_LAYER_SPEED`. That
      cannot work: `prep_backgrounds.py` builds every plate as an opaque RGB image 99–119px tall
      resting on the horizon, so a layer behind one is never seen — and the plan's own ordering
      test would have gone green over an unchanged screen. Flipped to a transparent ridge over the
      plate at `BACKDROP_NEAR_SPEED = 0.05` vs the plate's `0.02`; the lag between them is the same
      depth cue, built from the side of the plate we can reach. Ridge is baked from the **alpha
      mask** of a CC0 OGA layer (never its colours) and refilled from tones sampled out of the
      plate it sits on, which is what stops one ridge clashing across city/coastal/desert.
      `Backdrop` gained an optional `near` rather than `Background.render` gaining a parameter, so
      `main.ts` is untouched (vitest, +12 tests).
- [x] Roadside props — `lamp_post`, `median_post`, `grandstand`, `palm`, `billboard_sponsor`
      registered in `SPRITE_MANIFEST` (procedural fallback art, on the 2×2 grid, all colours from
      `palette.json`) and baked through Spec C's pipeline unchanged via `scripts/render_props.py`
      → `props.png` **1024×512, 30 frames, 20 KB**. Sparse 6-rung ladder indexed by **width**, not
      height — `Renderer.blit` picks a step with `ladderStepFor(idealWidthPx)`, so a height-indexed
      bake would put every prop on the wrong rung. `CarFrameSet.nearestStep` is what makes sparse
      safe: without it a hole in the step array resolves to the 1×1 empty frame and the prop
      silently vanishes at some distances (vitest, +10 tests; pytest, +3).
- [x] `effects.png` — dust / flame / speed streaks, **droppable and proven so** (a null set draws
      nothing and throws nothing; `main.ts` resolves it independently of the car's early return; a
      partial `effects.json` costs only the missing effect). `drawSprite` gained an optional
      trailing `alpha`, because the plan's own rule is to bake opacity only where it is *constant*
      and particle fade is a function of age, streak intensity a function of speed. Shape is still
      baked as a short animation strip. `Effects` is a fixed 24-slot pool in parallel typed arrays,
      allocation-free, deterministic scatter (vitest, +25 tests).
- [x] **CUT: Press Start 2P.** Task 4 Step 1 was a gate — measure at 8px, stop if it does not fit.
      It does not, in three places: `passed cars` runs x394→**x493**, 19px past the x474 safe
      margin; the time countdown occupies y16→**y32** against an elapsed clock at y30; the score
      label occupies y241→**y249** against a value at y248. Two are vertical collisions inside the
      locked `HEADER_H = 40` band, so absorbing them means re-laying-out the header. The 3×5 face
      is legible and shipped. **`maskOps` was generalised to any width anyway** and the duplicate
      7-column `starOps` folded into it and deleted — pinned bit-for-bit against verbatim copies of
      both originals, since 228 baked glyph frames already exist against that output (vitest, +5).
- [ ] **VISUAL GATE:** parallax reads as depth; props identifiable at 200 km/h
      → **still owed — requires a human at `npm run dev`.** Automated gates are green:
        **398 vitest / 40 files** (was 350/39), **17 pytest**, `npm run build` clean.

**Also cut from Spec D:** the plan's Task 2 does not wire `props.png` into the draw path (it wires
effects in Task 3 and deliberately does not wire props), so the atlas ships baked and packed while
`Renderer.drawSprites` still renders the procedural `SPRITE_MANIFEST` entries. Wiring it is the
natural next task and needs a `setBakedProps` mirroring `setBakedCar`.

---

## Gate for the phase

- [x] `npm test` green (398 / 40 files) · `npm run build` clean · `pytest scripts/` green (17)
- [x] Hard rules 1–5 held — in particular **no per-frame allocation and no per-frame string
      construction** in the sprite path. Spec D's two new render-path additions both honour it:
      `Background` pre-allocates a second tile array beside `tileXs`, and `Effects` is a
      fixed-size pool in parallel typed arrays with swap-with-last retirement.

## Done-when

One master palette governs every gameplay element. The road never strobes. The screen matches
the researched TX-1 composition. Cars render from pre-baked sprites on the discrete ladder with
no pixel crawl at any speed, and anchored overlays stay registered in both turn directions.

## Operational carryover

- [x] Phase 7 core branching architecture complete (196 unit tests green)
- [x] Spec C complete except its human visual gate: **350 vitest + 14 pytest green**, `npm run build` clean
- [x] Spec D complete except its human visual gate: **398 vitest + 17 pytest green**, `npm run build` clean.
      Three visual gates (A, C, D) are now owed to one `npm run dev` session.
- [ ] **Follow-up:** wire `props.png` into `Renderer.drawSprites` (see the Spec D cut note above).
- [x] Netlify continuous deploy active at `https://retrolineturbo.netlify.app/`
- [ ] **Follow-up:** F1 open-wheel silhouette. No vetted CC0 pack contains one; Spec C proves the
      pipeline on GT/tourer models, after which F1 is a model swap, not a pipeline change.
- [ ] **Follow-up:** Phase 9 garage screen (hero render, stat-diff bars, 80 × 16×16 part icons).
      Needs its own spec once `economy/` has a parts catalogue — today it holds only `score.ts`
      and `save.ts`.

---

## What's left — read this first in a new session

Verified against the tree on 2026-08-11, not copied from `plan.md`.

### Blocking, and cheap

1. **One `npm run dev` session settles three owed visual gates at once** — Spec A (kerb strobe at
   speed *and* at crawl), Spec C (pixel crawl; overlays through a hard left turn), Spec D
   (parallax depth, props at 200 km/h, effects, `effects.png` blocked in DevTools). Every
   automated gate is green; these are the only things standing between Phase 7.5 and closed.
2. **Two manual Supabase steps, user-side, before any Phase 8 work compiles against real data:**
   expose the `retroline` schema in Settings → API → Exposed schemas, and set
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Netlify env. Auth-only calls
   (`ensureAnonSession()`) already work without either.

### Phase 8 — Supabase persistence · *partly built, more than plan.md implies*

Already there: `supabase/migrations/0001_init.sql` (schema + RLS, applied), `src/net/supabase.ts`
(client scoped to the `retroline` schema, anonymous auth, degrades to a null client when env vars
are unset), and the `SaveBackend` seam with `MemorySaveBackend` + `LocalStorageSaveBackend`.

Not there: `SupabaseBackend implements SaveBackend`; save sync on race end; `race_results` insert;
`leaderboard_best` reads; community track publish/browse against `tracks.is_public`; anonymous →
account upgrade. The seam means none of this should touch game logic.

### Phase 9 — modular economy · *needs a spec before code*

`economy/` holds only `score.ts` and `save.ts`. Everything in plan.md §10 Phase 9 is unwritten:
`types/inventory.ts`, the 80-part JSON catalogue (4 categories × 20), `Garage.ts` as a pure
baseline+mod resolver feeding `physics/Vehicle.ts`, payout logic, and `ui/GarageScreen`. The
source spec is `docs/superpowers/specs/2026-08-05-phase-9-modular-economy.md`; the garage *screen*
still needs its own spec on top of it.

### Phase 10 — audio · *nothing exists*

`src/audio/` is absent entirely. Greenfield.

### Phases 11–12 — polish, then iOS

Phase 11 needs a real frame-time baseline before anything else; two deferred items are explicitly
waiting on one (see below). Phase 12 (Capacitor) stays off the critical path by design.

### Loose threads carried across phases

- **Wire `props.png` into `Renderer.drawSprites`** (Spec D's recorded gap). Needs a
  `setBakedProps` mirroring `setBakedCar`, plus `CarFrameSet.nearestStep` at the call site —
  that method exists and is tested but has no production caller yet.
- **F1 open-wheel silhouette.** No vetted CC0 pack contains one. Spec C proved the pipeline on
  GT/tourer models, so this is a model swap, not a pipeline change.
- **Spec A's grass banding stretch item** (spec §4.4) was cut, perf-gated. Needs the frame-time
  baseline first.
- **WebGL/PixiJS backend** stays hypothetical: the threshold in plan.md §12 is sustained >16.6ms
  in profiling, which nobody has measured yet. The `RenderBackend` seam is the hedge; do not
  pre-emptively cash it.
