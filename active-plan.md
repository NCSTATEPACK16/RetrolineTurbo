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

- [ ] `src/assets/palette.json` + `palette.ts` — 40–48 colour master palette, shared with the
      Python bake scripts; `ui.*` provably identical to the shipped `FONT_COLORS` (vitest)
- [ ] `src/constants.ts` — `COLORS` derived from the palette; kerbs to `#d02020`/`#f0f0f0`;
      new `shoulder` (vitest)
- [ ] `src/engine/roadBanding.ts` — anti-strobe band merge at the horizon, pure + unit-tested (vitest)
- [ ] `src/engine/Renderer.ts` — shoulder quad at 1.22× drawn widest-first; merged bands; lane
      dash suppressed on merged bands (vitest)
- [ ] `src/constants.ts` — layout lock: `HORIZON_Y` 135→118, `HEADER_H` 40, `HUD_ROW_Y` 248,
      `PLAYER_CAR_BASE_Y` 232, `PLAYER_CAR_WIDTH` 120 (vitest)
      ⚠️ highest-risk change — moving the horizon shifts every projected segment and sprite
- [ ] `src/ui/HUD.ts` — 40px header; SCORE bottom-left / SPEED bottom-right; `textWidth` helper
      for right-alignment; the 9 existing tests rewritten against the new layout (vitest)
- [ ] `src/assets/spriteManifest.ts` — 2×2 grid lint with explicit exemptions (font, stars);
      non-compliant entries rounded to the grid. **No renames** — `track/schema.ts` `VALID_SPRITES`
      depends on the names (vitest)
- [ ] `scripts/sample_palette.py` + `scripts/requirements.txt` (Pillow — none declared today)
- [ ] **VISUAL GATE:** no kerb strobe at full speed **or at crawl**; road greys read as texture;
      kerb red does not vibrate against foliage green

## M-checklist — Spec B · atlas engine v2

*Depends on A. Buildable and fully testable before any PNG exists.*

- [ ] `src/math/ladder.ts` — 12-step ladder, nearest-not-floor snapping, allocation-free, total
      over degenerate input (vitest)
- [ ] `src/engine/SpriteComposer.ts` — normalised anchor → overlay rect, with the `x → 1−x`
      flip mirror. Deliberately **not** on `RenderBackend` (vitest)
- [ ] `src/engine/AtlasManifest.ts` — defensive parser; never throws (vitest)
- [ ] `src/engine/CarFrameSet.ts` — integer-indexed lookup; **no per-frame string construction** (vitest)
- [ ] `src/engine/RenderBackend.ts` + `Canvas2DBackend.ts` + `RecordingBackend.ts` — optional
      `flipX` via negative-scale transform (vitest)
- [ ] `src/engine/loadAtlases.ts` — cars/props/ui/effects, never rejects, fire-and-forget in
      `main.ts` (**no `await` before constructing `Renderer`/`HUD`**) (vitest)
- [ ] **The six existing `SpriteAtlas` test files pass unchanged** — procedural atlas is permanent
- [ ] **VISUAL GATE:** the game looks **identical** to before. Any visible change is a bug.

## M-checklist — Spec C · vehicle bake pipeline

*Depends on B. ⚠️ Requires network access for model downloads before anything else can start.*

- [ ] `art/models/` — Kenney Car Kit + RGS_Dev (CC0, separated wheels) + `LICENSES.md`;
      wheels-separate, poly count, and body symmetry all verified in Blender
- [ ] `scripts/imageops.py` — shared downscale + **both** quantise modes (adaptive for plates,
      fixed for sprites); `prep_backgrounds.py` refactored onto it with **byte-identical output**
- [ ] `scripts/render_car_sprites.py` — headless Blender 5.2 (`BLENDER_EEVEE`, `Standard` view
      transform, `film_transparent`, 1px Freestyle), 3 angles × 12 steps × N colours, body and
      wheels on separate passes, **anchors projected from the 3D scene**
- [ ] `scripts/pack_atlas.py` — POT ≤2048×2048, 2px gutter + 1px bleed, manifest accepted by
      Spec B's parser unchanged; golden-fixture round-trip test (vitest + pytest)
- [ ] `src/types/engine.ts` — `PlayerState` widened with `steer` + `skidding` (vitest)
- [ ] `src/engine/Renderer.ts` — ladder quantisation in `blit`; `selectCarFrame`; overlay culling;
      brake lights as an overlay; body roll by vertical offset, **never rotation** (vitest)
- [ ] **VISUAL GATE:** no pixel crawl at **any** speed including crawl; overlays stay attached
      through a **hard left turn**

## M-checklist — Spec D · props, parallax, effects, font

*Depends on C. Smallest and most deferrable. Parallax first, font is the designated cut.*

- [ ] Second parallax layer behind the plates (`Backdrop.ts`, `Background.ts`, `prep_backgrounds.py`)
      — closes the "one plate layer" gap (vitest)
- [ ] Roadside props baked through Spec C's pipeline; lamp posts (`offset: ±1.2`), hazard median
      posts; sparse 6-step ladder; **every new name registered in `SPRITE_MANIFEST` and passing
      `track/schema.ts` validation** (vitest)
- [ ] `effects.png` — flame / dust / speed streaks; **droppable**, game fully playable without it (vitest)
- [ ] *(optional, cut first)* Press Start 2P (OFL) baked per colour; `maskOps` generalised beyond
      3 columns with a bit-for-bit regression test; HUD re-measured (vitest)
- [ ] **VISUAL GATE:** parallax reads as depth; props identifiable at 200 km/h

---

## Gate for the phase

- [ ] `npm test` green · `npm run build` clean
- [ ] Hard rules 1–5 held — in particular **no per-frame allocation and no per-frame string
      construction** in the sprite path

## Done-when

One master palette governs every gameplay element. The road never strobes. The screen matches
the researched TX-1 composition. Cars render from pre-baked sprites on the discrete ladder with
no pixel crawl at any speed, and anchored overlays stay registered in both turn directions.

## Operational carryover

- [x] Phase 7 core branching architecture complete (196 unit tests green)
- [x] Netlify continuous deploy active at `https://retrolineturbo.netlify.app/`
- [ ] **Follow-up:** F1 open-wheel silhouette. No vetted CC0 pack contains one; Spec C proves the
      pipeline on GT/tourer models, after which F1 is a model swap, not a pipeline change.
- [ ] **Follow-up:** Phase 9 garage screen (hero render, stat-diff bars, 80 × 16×16 part icons).
      Needs its own spec once `economy/` has a parts catalogue — today it holds only `score.ts`
      and `save.ts`.
