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
      → **de-risked 2026-08-11 via headless Playwright pass** (crawl→top-speed screenshots, zero
        console errors) — kerb/shoulder bands read clean and merge smoothly toward the horizon at
        every captured speed, no obvious moiré. Static screenshots can't prove the *temporal*
        no-strobe property the gate is actually about; a human glance at `npm run dev` is still the
        real close. Automated gates are green: **401 tests / 40 files**, `npm run build` clean.

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
      → **de-risked 2026-08-11 via headless Playwright pass.** Pixel crawl: the mechanism is
        unit-tested directly (`quantisedWidth` fixed-point + anti-shimmer run tests), and
        screenshots across the speed range show no resampling artifacts. Overlay registration:
        **ambiguous in screenshots** — front/rear wheels look slightly detached from the fender
        line on both a hard left and hard right, while on-road. The anchor math itself is covered
        by a dedicated test (`keeps overlays attached when the car is mirrored`) and passes, so
        this reads more like a low-res bake/stylistic artifact than a broken registration — but
        it's the one item from this session worth an actual human look before calling it closed.

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
      → **de-risked 2026-08-11 via headless Playwright pass.** Parallax: city/bridge/mountain
        layers visibly separate and pan at different rates across the captured speed range — reads
        as depth. Effects: a dust puff is visibly rendering off-road at speed (confirms
        `effects.png` is loaded and drawing, not just passing its tests). Props: **not visually
        confirmed** — the driven stretch of the default procedural track didn't place a
        `lamp_post`/`billboard_sponsor`/etc. within the captured draw distance, so "identifiable at
        200 km/h" wasn't actually exercised on screen this session, only through the new Renderer
        unit tests + a clean build. Automated gates are green: **401 vitest / 40 files**, **17
        pytest**, `npm run build` clean.

- [x] **Wired** `props.png` into the draw path (2026-08-11): `Renderer.setBakedProps` mirrors
      `setBakedCar` — one shared image + a `CarFrameSet` per prop name. `blit` now takes a sprite
      *name* (not a pre-resolved frame) so it can check `bakedProps.sets.get(name)` before falling
      back to the procedural atlas; when baked, `ladderStepFor` picks the ideal rung and
      `CarFrameSet.nearestStep` snaps it onto whichever rungs that prop actually baked (sparse
      table). `main.ts` builds the per-name `Map<string, CarFrameSet>` from `props.meta.frames`
      the same way it partitions car parts by id. Traffic-car sprites go through the same `blit`
      unchanged — they're just never in the props map, so they always fall through to procedural.
      3 new Renderer tests (baked draw, procedural fallback for an unbaked name, `null` clears it);
      401/40 files green, `npm run build` clean.

---

## Gate for the phase

- [x] `npm test` green (401 / 40 files) · `npm run build` clean · `pytest scripts/` green (17)
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
- [x] Spec D complete: `props.png` is now wired (see M-checklist above); only its human visual gate
      remains, and only for the props half — parallax + effects were visually confirmed this
      session. **401 vitest + 17 pytest green**, `npm run build` clean.
- [x] Netlify continuous deploy active at `https://retrolineturbo.netlify.app/`
- [ ] **Follow-up:** F1 open-wheel silhouette. No vetted CC0 pack contains one; Spec C proves the
      pipeline on GT/tourer models, after which F1 is a model swap, not a pipeline change.
- [ ] **Follow-up:** Phase 9 garage screen (hero render, stat-diff bars, 80 × 16×16 part icons).
      Needs its own spec once `economy/` has a parts catalogue — today it holds only `score.ts`
      and `save.ts`.

---

## What's left — read this first in a new session

Verified against the tree on 2026-08-11 (props wiring + headless visual pass landed this session).

### Blocking, and cheap

1. **One real `npm run dev` session still closes Phase 7.5**, now down to two open items rather
   than three: (a) a human's own eyes on kerb strobe at speed/crawl and props at 200 km/h (the
   headless pass above de-risked both but couldn't prove either outright), and (b) specifically
   the wheel-overlay positioning through a hard turn, which looked slightly off in headless
   screenshots even though the anchor math is unit-tested green. Everything else automated is
   green — this is a look, not more code.
2. ~~Two manual Supabase steps~~ — **done 2026-08-11.** `retroline` schema exposed in Settings →
   API → Exposed schemas; `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set in Netlify env
   (redeploy triggered so the build picks them up). Phase 8 code can now be written against a
   real schema instead of the null-client fallback.

### Phase 8 — Supabase persistence · *code complete 2026-08-11, one manual gap left*

Built this session on branch `phase-8-supabase-persistence` (plan:
`docs/superpowers/plans/2026-08-11-phase-8-supabase-persistence.md`), each as a small `net/`
edge module that degrades to a no-op when `supabase` is the null client:

- `net/SupabaseBackend.ts` — `SaveBackend` over one `saves.settings` jsonb blob keyed by user
  (bindings + local editor track drafts); `net/saveBackend.ts` picks it over
  `LocalStorageSaveBackend` in `main.ts` when configured.
- `route.baseSeed` + `routeIdentity()` (`track/route.ts`) → `net/raceResults.ts` inserts
  `race_results` on `route.finish()`.
- `net/leaderboard.ts` + `ui/LeaderboardScreen.ts` (**F3**) — top times per route from
  `race_results` (not the `leaderboard_best` view, which is `distinct on (track_id)` and only
  ever returns the single best row — no use for a top-N screen).
- `net/tracks.ts` (`publishTrack`/`browsePublicTracks`/`fetchTrack`) — publish via `EditorScreen`'s
  new `KeyP`, browse via `ui/TrackBrowserScreen.ts` (**F4**).
- `net/account.ts` + `ui/AccountScreen.ts` (**F5**) — anonymous→permanent upgrade
  (`auth.updateUser({ email })` then `{ password }` per Supabase's documented flow). Email/password
  entry is `window.prompt`, not on-canvas — the bitmap font has no `@` glyph.

436 vitest / 49 files green (was 401/40 before this phase), `npm run build` clean.

**Still open:** the plan's own manual smoke pass (`npm run dev`, drive a full route, F3/F4/F5) has
not been run by a human yet — automated coverage is real but nobody has watched a race actually
insert a leaderboard row, a published track round-trip through F4, or a real confirmation email
land. Separately, the account-upgrade flow needs **"manual linking" enabled** in the Supabase
dashboard (Authentication → Settings) before `linkEmail` will succeed against the real backend —
a dashboard toggle, not something any commit here can set.

### Phase 9 — modular economy · *code complete 2026-08-11, one verification gap*

Built on branch `phase-9-modular-economy` (spec:
`docs/superpowers/specs/2026-08-11-phase-9-modular-economy-shop.md`, plan:
`docs/superpowers/plans/2026-08-11-phase-9-modular-economy-shop.md`). The 2026-08-05 spec is
superseded: its payout model (placement 1st/2nd/3rd, fastest lap) assumes rivals and laps that
this game does not have, so payout was re-based on route stages, banked time, passed cars and
collisions — all signals already in the tree.

- `physics/Vehicle.ts` — `VehicleParams` (gear ceilings, gear accel, steer authority,
  centrifugal) injected at construction, defaulted to the old constants so a stock car is
  bit-for-bit the pre-Phase-9 car. Every prior Vehicle test passes untouched.
- `types/inventory.ts` + `economy/partCurves.ts` — 80 parts (4 categories × 20) generated from
  tier curves, snapshotted to `economy/parts.json` behind a golden test (`UPDATE_PARTS=1 npm test`
  regenerates). Balance guards assert every tier-20 part carries a penalty and that no loadout
  leads on all four metrics.
- `economy/Garage.ts` — pure `resolveMetrics` (baseline 50 + mods, clamped 5..95) and
  `metricsToParams`, calibrated so metric 50 = ×1.0 exactly.
- `economy/GarageState.ts` — credits, inventory, fitted loadout, `bestStage`; five part states
  (locked → unaffordable → purchasable → owned → equipped); corrupt-save tolerant; persists
  through the existing `SaveBackend`, so Supabase cross-device comes free.
- `economy/payout.ts` — pure ledger: stages×250 + 1000 completion + 10c/banked-second +
  points/10, ×1.1 clean-race. `ScoreState` gained a collisions counter.
- `ui/SummaryScreen.ts` (auto on run end) + `ui/GarageScreen.ts` (**F6**, stat-diff bars driven by
  the same resolver the physics uses).

491 vitest / 56 files green (was 436/49), `npm run build` clean. Headless drive confirmed: the
summary panel renders its ledger on expiry, F6 buys + fits a part, and credits/loadout survive a
reload (50,000 → 46,311 for a tier-10 engine, matching the cost curve).

**Still open:** no in-browser run has yet earned a *non-zero* payout — the headless driver has no
steering feedback and ends up in the grass, so every scripted run expired at stage 0 with no
overtakes. The award path's parts are all unit-tested and the commit path is proven (the summary
appears with the real ledger; the buy path proves credit mutation + persistence), but a human
should drive one real route and confirm the earned figure lands in the wallet.

**Also seen during verification:** with the repo `.env` in place the save backend is
`SupabaseBackend` and every call failed with `Invalid schema: retroline` (plus one
`JWT issued at future`, i.e. clock skew) — despite the note above recording that schema as exposed
on 2026-08-11. Worth re-checking Settings → API → Exposed schemas against the project those local
keys point at; Phase 9 code is backend-agnostic and was verified against the localStorage backend.

### Carried fix — centrifugal-vs-steer-authority + input correctness · *2026-08-12*

Landed on `phase-9-modular-economy` alongside the Phase 9 commits (not part of the economy
spec — a driving-feel bug found while playtesting that phase): `CENTRIFUGAL` was 9000 against
`STEER_MAX_WPS` 2500, so the sharpest curves `generate.ts` emits could out-pull full steering
lock and shove the driver off-road with the stick pinned. Dropped to 600. Landed alongside it:
rate-limited steer approach (~170ms to full lock, sprite still leans instantly on the raw
command), a hard lateral clamp (off-road drag alone didn't stop a stuck steer input walking the
car out of the world), pointer-lock + relative-delta mouse steering (the old absolute-cursor
mapping made the resting cursor spot a permanent steer command), a gamepad deadzone, one device
voting per read instead of summing all three, and a `ContactLatch` so one collision produces one
response instead of one per physics step it spans (was compounding into a near-stop and
over-counting hits against the clean-race payout multiplier). Verified via headless
`drive_game.mjs` — car tracks cleanly through both turn directions. 509/56 tests, build clean.

### Phase 10 — audio + CRT · *code complete 2026-08-12, one scope note*

Built on branch `phase-10-audio-crt` (spec:
`docs/superpowers/specs/2026-08-12-phase-10-audio.md`, brainstormed and finalized the same
session). Bundles audio and the CRT post-pass together rather than deferring CRT to Phase 11,
per an explicit user call during design — the spec's own first draft had recommended splitting
them.

- `src/audio/engineTone.ts` — pure `computeEngineTone` (sawtooth pitch + lowpass cutoff as a
  0..1 function of speed-in-gear) and `squealGain` (skid-magnitude-scaled), fully unit-tested.
- `src/audio/SoundEngine.ts` — the Web Audio edge: one persistent AudioContext + node graph
  (engine tone, tire squeal, music/SFX buses), gesture-gated `resume()` wired into both the
  existing pointer-lock click handler and the top of the main keydown handler (so keyboard-only
  drivers who never click still get audio), and a one-shot `collisionCue()` triggered directly
  off `ContactLatch.enter()` in the physics update. Never throws — no Web Audio support (this
  repo's own `environment: 'node'` vitest run included) degrades the whole engine to inert
  no-ops, same contract as `net/supabase.ts`/`loadAtlases.ts`.
- `physics/Vehicle.ts` / `types/engine.ts` — `PlayerState.skidMagnitude`, a real field (not an
  approximation) derived from existing `recoverySteps` state: 1 at trigger, easing to 0 only
  on a sustained recovery attempt.
- `src/ui/CrtEffect.ts` — a raw WebGL2 fragment shader (scanlines + barrel distortion + a
  cheap single-pass neighbour-bloom) reading the game's existing offscreen Canvas2D buffer as a
  texture and drawing to a second `#crt` canvas (`index.html`); `#game`/`#crt` share one CSS
  grid cell and main.ts toggles which is visible. `Canvas2DBackend` gained one read-only
  `surface` getter — its drawing path is otherwise untouched. Off by default under
  `CRT_MOBILE_MAX_WIDTH` (768px), toggleable with `KeyV`. Never throws — no WebGL2, or a driver
  that rejects the shader, leaves `supported` false and the game renders the plain Canvas2D path
  regardless.
  ⚠️ **Caught and fixed this session, not upstream**: the first working version rendered the
  whole frame upside down — `texImage2D` from a canvas source needs
  `UNPACK_FLIP_Y_WEBGL` set, since canvas pixel data is top-down but WebGL texture V=0 is
  conventionally the bottom of the image. Only visible via an actual screenshot; the unit tests
  (which only exercise the no-WebGL2-support path, per the spec's own "thin at the edge" call)
  could not have caught it. Worth remembering for any future WebGL work in this repo.

531 vitest / 59 files green (was 512/56 before this phase, +19 from `skidMagnitude` +
`engineTone` + `SoundEngine` + `CrtEffect` tests), `npm run build` clean. Verified via headless
`drive_game.mjs` (no new console errors, frame time unchanged) plus a throwaway Playwright
script (not committed) confirming: a mobile-width viewport defaults CRT off, `KeyV` toggles it
on and off correctly, a desktop-width viewport defaults CRT on, and the corrected orientation
holds — screenshots inspected directly, not just asserted programmatically.

**Scope note — the spec's "hybrid streamed music / preloaded SFX-from-file" layer was not
built.** No music or SFX asset files exist anywhere in this repo and there is no bake pipeline
for audio content (unlike sprites/props/backgrounds, which all have one) — wiring a generic
loader with nothing to call it would be dead, untested code, which the project's own engineering
discipline rules out. The music/SFX bus split the spec calls for is real and already routes the
procedural cues that do exist (engine tone, squeal, collision thud); it's ready for real files
whenever a future session has content to load. This is a content gap, not a missed
implementation detail.

**Still open:** no human has heard this yet — `npm run dev` and a real drive is the actual gate,
same as every prior phase's headless-de-risked-but-not-human-confirmed visual items. The pitch/
filter/shader tuning constants (`ENGINE_F_BASE_LOW` etc., `CRT_SCANLINE_INTENSITY` etc.) are
shipped as reasonable defaults per the spec's own instruction, not ear/eye-tuned — expect a pass
similar to `CENTRIFUGAL`'s this session once someone actually listens/looks.

### Phases 11–12 — polish, then iOS

Phase 11 needs a real frame-time baseline before anything else; two deferred items are explicitly
waiting on one (see below). Phase 12 (Capacitor) stays off the critical path by design.

### Loose threads carried across phases

- ~~Wire `props.png` into `Renderer.drawSprites`~~ — done 2026-08-11, see the M-checklist entry above.
- **F1 open-wheel silhouette.** No vetted CC0 pack contains one. Out of scope until one is sourced
  — this is a model swap on Spec C's pipeline, not new pipeline work, so there is nothing to build
  today. Spec C proved the pipeline on GT/tourer models.
- **Spec A's grass banding stretch item** (spec §4.4) was cut, perf-gated on a frame-time baseline
  existing. **First baseline taken 2026-08-11** (headless Chromium, no GPU accel, driving at
  cruising speed): ~180 frames averaged 16.66ms, p95 17.7ms, max 17.7ms — a tight distribution
  right at vsync with no spike pattern, i.e. no evidence of exceeding budget. Caveat: headless/
  software rendering isn't the "mid-range laptop + mobile Safari" profiling pass plan.md §12
  actually wants for Phase 11 — this is a first data point, not that pass. It does not, on its
  own, justify spending the grass-banding item now.
- **WebGL/PixiJS backend** stays hypothetical: the threshold in plan.md §12 is sustained >16.6ms
  in profiling. The one baseline taken so far shows no sign of it. The `RenderBackend` seam is the
  hedge; do not pre-emptively cash it.
