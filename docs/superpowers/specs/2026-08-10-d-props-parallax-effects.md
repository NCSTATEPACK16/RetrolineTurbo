# Spec D — Roadside Props, Parallax Depth, Effects & Arcade Font

**Date:** 2026-08-10
**Roadmap:** `plan.md` §10 Phase 7.5
**Research source:** `docs/research/2026-08-10-art-direction-asset-pipeline-research.md` §2c
(props), §2d (parallax strips), §2e (fonts), §1c (what 2026 buys), §5b (atlas split).
**Predecessor:** Spec C — Vehicle Bake Pipeline (`2026-08-10-c-vehicle-bake-pipeline.md`).
**Runs when:** Spec C is code-complete — D reuses its `render_car_sprites.py` scene setup,
`imageops.py`, and `pack_atlas.py` unchanged.
**Supersedes:** §4.3 of `2026-08-06-sprite-asset-pipeline-spec.md` (960×270 skylines — already
shipped differently as 960×119/112/99 plates).

---

## 1. Goal

Fill the world around the car. Spec C proved the bake pipeline on vehicles; D runs the same
pipeline over everything else and closes the three remaining visual gaps:

- **Roadside props** — currently five procedural rectangles (`tree`, `bush`, `rock`, `sign`,
  `billboard`) plus the lamp posts and hazard median posts that `active-plan.md:23` still lists
  unchecked.
- **Parallax depth** — `active-plan.md:22` records explicitly: *"Not done: multiple parallax depth
  layers — this is one plate layer."* One plate is the whole background today.
- **Effects and font** — the alpha-blended extras the research calls out as what 2026 buys, and
  Press Start 2P replacing the 3×5 procedural glyphs.

This is the smallest and most deferrable of the four specs. If time runs short, §3 (parallax) has
the highest visual return per hour; §6 (font) has the lowest and touches the most tests.

---

## 2. Roadside props → `props.png`

Sources, all CC0 and already licence-vetted by the research:

| Asset | URL | Licence | Use |
|---|---|---|---|
| Kenney **Racing Kit** (110 assets) | https://kenney.nl/assets/racing-kit | CC0 | Grandstands, tents, billboards, signs, fences, flags |
| Kenney **Background Elements Redux** | https://kenney.nl/assets/background-elements-redux | CC0 | Tree/hill silhouettes |
| Quaternius **Ultimate Nature** (150+) | https://quaternius.itch.io/150-lowpoly-nature-models | CC0 | Trees, palms |
| OGA **Background Clouds & Mountains** | https://opengameart.org/content/background-clouds-and-mountains-parallax | CC0 | Pixel clouds/mountains (2D, §3) |

3D props go through **Spec C's Blender path unchanged** — same camera, same flat shading, same
1px Freestyle outline, same fixed palette clamp — so they sit with the cars automatically. That
reuse is the reason D runs after C rather than in parallel.

Props need **fewer ladder steps than cars.** A tree is seen briefly and at a narrow range of
distances; baking all 12 steps for every prop wastes atlas. **Bake 6 steps** (every other rung:
120/76/48/30/19/12) and let `ladderStepFor` snap to the nearest available. This requires the frame
set to record *which* steps exist rather than assuming a dense 0..11 — a small, explicit extension
to Spec B's lookup, not an assumption to make silently.

**2D pixel props** (OGA) skip Blender and need a modest hand recolour into the foliage/sky ramps
of `palette.json` — the research budgets ~1–2 hrs per set.

⚠️ **New sprite names must be added to `SPRITE_MANIFEST`.** `src/track/schema.ts:27` builds
`VALID_SPRITES` from it, and every track JSON validates against that set — a prop that exists only
in `props.png` will fail track loading. The procedural entry is the name's registration; the PNG
frame is its appearance.

Also in scope, from the TX-1 handoff and `active-plan.md:23`: **lamp posts** at `offset: ±1.2`,
and **hazard-striped median posts** at fork splits.

---

## 3. Parallax depth — the highest-value item here

Today `Background.renderBackdrop` (`src/engine/Background.ts:46-59`) draws exactly one plate layer
at native scale, panned by `backdropPan` and wrapped by `backdropTiles`. The research's §2d assets
are chosen to sit *behind* it.

Add a **second, slower layer**: distant mountains/clouds behind the plate, at a lower
`BACKDROP_LAYER_SPEED` (currently a single constant, `Backdrop.ts:35`). The existing machinery
generalises cleanly — `backdropTiles` already writes into a caller-owned array
(`Background.tileXs`, `Background.ts:21`), and a second layer means a second pre-allocated array,
not a per-frame allocation.

Sources: OGA **Parallax Mountain Background** (https://opengameart.org/content/parallax-mountain-background,
CC0) and **Background Clouds & Mountains Parallax** (CC0, ships layered GIMP source).

**Route them through the existing `scripts/prep_backgrounds.py`** — chroma-key → crop →
area-downscale → palette quantise → mirror-for-wrap. That tool already exists and already produces
seam-free wrapping plates; the far layer is just another entry in its `ASSETS` list.

⚠️ Two constraints the far layer must respect:
- **It must sit above the header and below the horizon.** With Spec A's layout that is the band
  y=40..118 — only 78 rows. Crop accordingly. ✅ Confirmed against Spec A as amended: `HORIZON_Y`
  is now the *road's* vanishing row as well as the backdrop's (Spec A §5.0 made `projectY`
  horizon-aware), so 118 is a single number both layers agree on. Note the near plates are
  taller than 78 (119/112/99) and deliberately run under the header; **the far layer must not** —
  it has no plate above it to hide the overlap.
- **Each plate gets its own adaptive 48-colour palette** (per Spec A §2), so a far layer must be
  quantised *against the plate it sits behind*, or the two will clash. Sample first.

---

## 4. Effects → `effects.png`

The alpha-blended extras the SNES could not do (research §1c): exhaust flame on gear shift, dust
and smoke on skid, speed streaks at high velocity, headlight glow.

These are the one place `globalAlpha` is welcome — the research bans per-frame *compositing ops*
and gradient fills, not alpha. Two rules hold:

- **No `shadowBlur`, no gradient fills.** Both are listed budget-eroders and both read as modern
  vector rather than 16-bit. Bake any gradient into the sprite.
- **No dithering on sprites below ~16px** — there is no room for a pattern to read, so it is just
  noise.

`effects.png` is the **droppable atlas** in Spec B's lifecycle split: on a low-end device it can
fail to load and the game must be fully playable without it. Verify that path explicitly rather
than assuming it.

`RenderBackend` has no alpha parameter today. If effects need per-draw alpha, add
`alpha?: number` alongside Spec B's `flipX?` following the same reasoning — optional trailing
primitive, implemented in `Canvas2DBackend` by setting and restoring `globalAlpha`, recorded by
`RecordingBackend`. Prefer baking opacity into the sprite where the value is constant.

---

## 5. Atlas split

With D complete, all four atlases from research §5b exist:

| Atlas | Contents | Lifecycle |
|---|---|---|
| `cars.png` | Bodies (all colours) + wheel/exhaust/spoiler/intake overlays, 12 steps | Always resident (Spec C) |
| `props.png` | Trees, palms, signs, billboards, grandstands, lamp posts, 6 steps | Always resident |
| `ui.png` | Font glyph sets per colour, route-tree pieces, gold star, part icons, stat bars | Always resident |
| `effects.png` | Flame, smoke, dust, speed streaks | **Droppable on low-end** |

All ≤2048×2048 POT, 2px gutter + 1px bleed, built by `pack_atlas.py`, released after bake.

---

## 6. Press Start 2P → `ui.png`

**Press Start 2P** (https://fonts.google.com/specimen/Press+Start+2P) is **OFL 1.1** — free
commercial use, modification and redistribution, **no attribution burden**, bitmap-crisp at 8/16px,
with Namco-arcade letterforms. Ship the licence file alongside it.

Rejected alternatives, with reasons: **m3x6/m5x7** (Daniel Linssen) is excellent and tiny but the
author asks for credit — acceptable only if a sub-6px face is genuinely needed. **KenPixel via
FontStruct/onlinewebfonts mirrors is CC-BY-SA** and must not be used; the kenney.nl download is
CC0 and is the only acceptable source.

Bake **one full glyph set per colour** into `ui.png`, exactly as the procedural font already does
— `FONT_COLORS` × 38 glyphs = 228 frames today (`spriteManifest.ts:112-118`). That combinatorial
explosion is already proven to pack fine, and it keeps coloured text at one `drawSprite` per
character with no tinting.

⚠️ **This is the most invasive item in Spec D.** Three specific hazards:

1. **`maskOps` is hardcoded to 3 columns** (`spriteManifest.ts:61`: `c < 3`, `0b100 >> c`), with a
   separate 7-column copy for stars (`starOps`, line 52). Press Start 2P is 8px. Generalise
   `maskOps` to an arbitrary width rather than adding a third near-duplicate.
2. **Glyph metrics change.** `drawText` advances `(f.w + 1) * scale` (`text.ts:28`); every HUD
   column position in `HUD.ts` was laid out against a 3×5 face. Expect the whole HUD layout to
   need re-measuring against Spec A's coordinates. Spec A adds `textWidth` to `text.ts` for
   right-alignment — it derives from the same advance, so it re-measures for free, but the
   *fixed* header column positions do not.
3. **The procedural font must survive** as the headless/fallback path — Spec B §9. The PNG font
   augments it; it does not replace it. All six `SpriteAtlas` test files must still pass.

Given the blast radius, **the font is the correct thing to cut first** if Spec D is time-boxed.
The 3×5 face is legible and shipped.

---

## 7. Files

**New:** `public/assets/sprites/props.png` + `props.json`, `effects.png` + `effects.json`,
`ui.png` + `ui.json`; `art/models/` prop sources + licence records; `art/fonts/PressStart2P` +
`OFL.txt`.

**Modified:** `scripts/prep_backgrounds.py` (far parallax layer entries),
`src/engine/Backdrop.ts` + `Background.ts` (second layer, second pre-allocated tile array),
`src/assets/spriteManifest.ts` (new prop names, generalised `maskOps`), `src/engine/Renderer.ts`
(lamp posts, median posts, effect emission), `src/ui/HUD.ts` (font metrics, if §6 ships),
`src/engine/RenderBackend.ts` (`alpha?`, only if §4 needs it).

---

## 8. Testing — Vitest

- **Parallax:** the far layer pans **slower** than the plate at the same camera-x (a relationship,
  not a pixel); both layers wrap seam-free; the far layer draws **before** the plate; tile arrays
  are pre-allocated — assert no growth across frames.
- **Props:** every new sprite name resolves in `SPRITE_MANIFEST` **and** validates through
  `src/track/schema.ts`'s `VALID_SPRITES` (this is the coupling that breaks silently); sparse
  ladder steps snap to the nearest *available* step, not a missing one.
- **Effects:** a missing `effects.png` leaves the game fully playable — assert the render path
  tolerates an absent atlas; alpha, if added, is recorded by `RecordingBackend` and restored after
  each draw in `Canvas2DBackend` (assert on the op-string log).
- **Font, if shipped:** generalised `maskOps` reproduces the existing 3-column output **bit for
  bit** for every current glyph (the regression guard), and handles 8 columns; glyph coverage
  assertions in `packAtlas.test.ts` still pass.
- **Regression:** all six existing `SpriteAtlas` test files pass unchanged.

---

## 9. Visual gate

1. `npm run dev` through all three stages.
2. **Parallax:** steer hard side to side. The far layer must lag the plate visibly — that lag *is*
   the depth cue. Confirm no seam at the wrap on either layer.
3. **Props at speed:** the research's rule, taken literally from Horizon Chase's own art direction
   — objects must be *"recognizable at 200 mph… more important than being realistic or detailed."*
   If a prop is not identifiable at full throttle, simplify its silhouette rather than adding
   detail.
4. **Effects:** trigger a skid and a gear shift. Dust and flame should read as motion, not as
   modern particle bloom. Confirm no dithering is visible on small sprites.
5. **Low-end path:** block `effects.png` in DevTools and confirm the game plays cleanly.
6. Screenshot all three stages and confirm props, plates, and cars share one palette.

---

## 10. Done-when

- **Props are 3D-baked through Spec C's unchanged pipeline** and sit with the cars in one palette;
  lamp posts (`offset: ±1.2`) and hazard median posts render.
- Every new sprite name is registered in `SPRITE_MANIFEST` and **passes track-schema validation**.
- A **second parallax layer** renders behind the plates, panning slower, seam-free — closing the
  gap `active-plan.md:22` records as not done.
- `effects.png` supplies flame/smoke/dust/streaks, and its **absence leaves the game fully
  playable**.
- All four atlases exist, each **≤2048×2048 POT** with gutter and bleed.
- If the font ships: Press Start 2P is baked per colour with **OFL licence included**, `maskOps` is
  generalised with a bit-for-bit regression test, and HUD layout is re-measured.
- `npm test` and `npm run build` green; hard rules 1–5 held — **no gradient fills, no `shadowBlur`,
  no per-frame allocation** in the new layers.
- **HUMAN VISUAL GATE:** the world reads as one coherent 16-bit scene at 200 km/h, with visible
  parallax depth.

---

## 11. Caveats

- **Poly counts and exact prop contents of the Kenney and Quaternius packs are unverified** —
  inspect before committing to a prop list.
- **6 ladder steps for props is an estimate.** If props pop visibly, add rungs at the large end;
  as with cars, **never interpolate**.
- **The far parallax layer's crop band (y=40..118, 78 rows) depends on Spec A's `HORIZON_Y = 118`**,
  itself flagged as inference. If the horizon moves, re-crop the far layer. Since Spec A §5.0 the
  horizon also drives the road's vanishing row, so a retune there is more consequential than it
  looks — it will most likely arrive paired with a `DEFAULT_FOCAL_LENGTH` change.
- **New prop entries must be authored on the 2×2 grid** (Spec A §6) — the lint runs over the whole
  of `SPRITE_MANIFEST`, so every prop registered here is subject to it. Exemptions are pinned by
  count in `spriteManifest.test.ts`; adding a prop is not a reason to widen them. If §6's font
  work ships, the generalised `maskOps` must emit even-aligned ops for anything non-exempt.
- **Press Start 2P at 8px is more than 2× the current 3×5 face.** It may simply not fit the HUD
  regions Spec A locks. Measure before baking 228 frames — this is why §6 is the first cut.
- The research could not verify a **citeable Chrome-Android per-dimension canvas limit**; 2048
  remains safe regardless.
