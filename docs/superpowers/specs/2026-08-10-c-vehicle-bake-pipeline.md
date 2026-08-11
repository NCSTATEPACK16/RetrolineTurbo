# Spec C — Vehicle Bake Pipeline & Renderer Consumption

**Date:** 2026-08-10
**Roadmap:** `plan.md` §10 Phase 7.5
**Research source:** `docs/research/2026-08-10-art-direction-asset-pipeline-research.md` §2a
(CC0 car models), §3a–3d (frame size, ladder, angles, Blender settings), §4b (layering).
**Predecessor:** Spec B — Atlas Engine v2 (`2026-08-10-b-atlas-engine-v2.md`).
**Runs when:** Spec B is code-complete. **This is the only spec with an external-network
prerequisite** — see §2 before starting.
**Supersedes:** §4.2 of `2026-08-06-sprite-asset-pipeline-spec.md` (5 angles, live scaling).

---

## 1. Goal

Produce real car pixels and draw them. Spec B built the ladder, the composer, and the loader
against no assets; Spec C fills them with CC0 models rendered through Blender into a packed atlas,
and rewires `Renderer` to consume it.

Two decisions carried in from planning, both already made:

**GT/tourer silhouette now, F1 later.** The research applied a licensing gate and found that
**no vetted CC0 pack contains an open-wheel/F1 single-seater** — contradicting `plan.md`,
`active-plan.md`, and the TX-1 handoff doc, all of which specify F1. Rather than block the whole
pipeline on modelling a car, Spec C proves the pipeline end-to-end with CC0 GT/tourer models. Once
the bake works, substituting a hand-modelled single-seater is a *model swap, not a pipeline
change*. `plan.md` is amended accordingly.

**Headless CLI Blender**, so the bake is reproducible from a checked-in script and any session can
iterate on the output.

---

## 2. Prerequisite: asset acquisition (network)

**Nothing else in this spec can start until this is done.** `art/` currently holds only the three
source skyline PNGs.

Download into `art/models/`:

| Pack | URL | Licence | Why |
|---|---|---|---|
| Kenney **Car Kit** (45 assets) | https://kenney.nl/assets/car-kit | CC0 | Separated wheels confirmed; widest silhouette range |
| RGS_Dev **Free Low Poly Vehicles** (~22) | https://rgsdev.itch.io/free-low-poly-vehicles-pack | CC0 | Separated wheels **and** materials separated by colour — ideal for the tint work |

Write `art/models/LICENSES.md` recording per-pack provenance, licence, download date, and source
URL. This is not bureaucracy: the research's licensing gate rejected several tempting sources and
that reasoning must survive.

**Rejections to respect — do not substitute these in:**
- **Quaternius Cars Bundle** is CC0 on its bundle page but **some individual poly.pizza pages show
  CC-BY 3.0**. If used at all, take it from the itch/OpenGameArt CC0 listing and verify per file.
- **The Spriters Resource Top Gear rips are copyrighted** Kemco/Gremlin art. Reference only for
  proportions and steering-angle counts. Never in the build.
- **"KenPixel" via FontStruct / onlinewebfonts mirrors** is served CC-BY-SA. Kenney fonts only from
  kenney.nl.

**Verify in Blender before committing to a model** (the research flags all three as unknown):
1. Wheels are genuinely **separate objects**, not merged into the body mesh.
2. Poly counts — unpublished for both packs; measure.
3. Body geometry is **symmetric**, since Spec B's runtime flip assumes it (§5 of that spec).

---

## 3. Blender 5.2 — verified API, correcting the research

The research targets Blender 3.6. **Blender 5.2.0 LTS is what is installed**, at
`/Applications/Blender.app/Contents/MacOS/Blender` (not on PATH). The following were probed
directly against 5.2 and supersede the research's 3.6-era guidance:

| Fact | Verified value | Note |
|---|---|---|
| Available engines | `BLENDER_EEVEE`, `BLENDER_WORKBENCH`, `CYCLES` | — |
| EEVEE identifier | **`BLENDER_EEVEE`** | ⚠️ **`BLENDER_EEVEE_NEXT` does not exist in 5.2** and raises on assignment. That id was 4.2–4.5 only; 5.x reverted to `BLENDER_EEVEE`, which *is* EEVEE Next internally. |
| Default view transform | **`AgX`** | Must be set to `Standard` explicitly or colours desaturate — the research is right about this, and it is not the default. |
| `view_transform = 'Standard'` | settable | Also `Filmic`, `AgX`, `Raw`. |
| Freestyle | `scene.render.use_freestyle`; `view_layer.freestyle_settings.linesets.new(name)` | `lineset.select_silhouette` defaults `True`. |
| Freestyle thickness | **defaults to `3.0`** | Must be set to `1.0`. The research asks for ~1px and 5.2 will not give it by default. |
| Freestyle colour | defaults black `(0,0,0)` | Set to `outline` from `palette.json`. ⚠️ Blender colours are **linear**; convert the sRGB hex before assigning. |
| `film_transparent` | defaults **`False`** | Must be `True` for alpha. |
| `ShaderNodeShaderToRGB` | available | For the 2–3 stop toon ramp. |
| `eevee.taa_render_samples` | available | — |
| OBJ import | **`bpy.ops.wm.obj_import`** | ⚠️ `bpy.ops.import_scene.obj` **no longer exists** in 5.x. |
| FBX / glTF import | `bpy.ops.import_scene.fbx`, `bpy.ops.import_scene.gltf` | Still present. |
| Anchor projection | `bpy_extras.object_utils.world_to_camera_view` | Present — used in §5. |

Reproduce this probe if anything looks wrong:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-expr "import bpy; print(bpy.app.version_string); \
  print([e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items])"
```

---

## 4. `scripts/render_car_sprites.py`

Invocation (add as an npm script so it is discoverable):

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/render_car_sprites.py -- --car gt --colors red,blue --out art/build/cars
```

Note the `--` separator; args after it go to the script, not Blender.

**Scene setup** (research §3d; all camera numbers are inference — see §11):
- Engine `BLENDER_EEVEE`; `view_settings.view_transform = 'Standard'`; `film_transparent = True`.
- Camera **perspective, 50–65mm** (FOV ~30–38°). A long lens flattens the car the way a distant
  chase cam does and matches the low-distortion feel of scaled sprites.
- Camera height ~**1.2–1.5× car roof height**; pitch down **8–12°** onto the rear deck; distance
  set so the car fills ~80% of frame width.
- **Shading: flat.** Either pure `Emission`, or Principled + `Shader-to-RGB → ColorRamp` with 2–3
  **hard** stops driven by one key light. Avoid smooth specular — glossy gradients fight the
  palette and read modern. With a palette clamp downstream, lighting's only job is choosing which
  of the 5 ramp steps a face lands on.
- One sun key from upper-front-left, low strength; flat mid-grey ambient so shadows never go muddy.
- Freestyle: 1px, `palette.outline`, outer silhouette + major panel breaks only. **Mark Freestyle
  edges manually** — automatic edge detection on low-poly models produces noise.

**Render loop** — for each `(car, colour, angle ∈ {0°, 15°, 30°}, step ∈ 0..11)`:
1. Render at **2× the ladder step width**, then **BOX-downscale** to the step size. Area
   downscaling at bake time is what gives clean edges; this is the same reasoning
   `prep_backgrounds.py` documents for the plates (*nearest "would alias it into noise at this
   ratio"*).
2. **Fixed-palette clamp** against `palette.json`.
   ⚠️ This spec adds the remaining ~6 body hues (8 total × 5 steps = 40 `body` entries, up from
   Spec A's 10). That takes the stored palette from 51 to **81**, so **raise `PALETTE_BUDGET`
   from 52 to 84** in `src/assets/palette.ts` as part of this work — one line, in the same commit
   as the new ramps, so the reason is on the record. **Do not touch `CORE_MAX`**: body ramps are
   a variable role and none of this changes the always-on-screen core (26). If a car needs a
   colour that is *not* a body ramp, that is a `CORE_MAX` conversation, not a budget bump.
3. Render **body and wheels as separate passes** so overlays register independently. Both packs
   ship separated wheels; keep them parented but on their own collection.

Output: individual PNGs under `art/build/cars/` plus a sidecar JSON of anchors per frame.

**Only 3 angles are authored.** The mirrored −15°/−30° come from Spec B's runtime `flipX`. The
older spec's five-angle plan is superseded.

---

## 5. Anchors come from Blender, not by hand

This is the part that usually rots. Blender already knows where the wheel hubs, exhaust tips, and
spoiler mount are in 3D. Project them into frame-local normalised coordinates with
`bpy_extras.object_utils.world_to_camera_view` (verified present in 5.2), which returns normalised
0..1 camera-space coords directly — exactly the storage format Spec B's `overlayDest` expects.

Place named empties in the source scene (`anchor_wheelBL`, `anchor_wheelBR`, `anchor_exhaust`,
`anchor_spoiler`); the script projects every empty whose name starts with `anchor_` and writes the
result into the frame's `anchors` map.

Because anchors are normalised against the frame, **one anchor per overlay per angle covers all 12
ladder steps** — no per-step table, which is the property that makes the whole overlay scheme
affordable.

---

## 6. Shared image ops and the packer

**`scripts/imageops.py` — new.** Factor the BOX-downscale and quantise stages out of
`prep_backgrounds.py:87-122` so both scripts share one implementation.

⚠️ **The two callers need different quantisation and the shared module must expose both:**
- Backgrounds use **adaptive** median-cut (`Image.quantize(colors=48, method=MEDIANCUT)`) — each
  plate gets its own optimal palette.
- Car sprites need a **fixed** clamp against `palette.json` (`Image.quantize(palette=<palette
  image>)`) so every vehicle shares one ramp set.

Conflating them silently re-palettes the plates. Keep the functions distinct.

**`scripts/pack_atlas.py` — new.** Packs `art/build/**` → `public/assets/sprites/cars.png` +
`cars.json` in Spec B's manifest schema. Reused by Spec D for props/effects/ui.

- **≥2px transparent gutter and 1px edge bleed** (duplicate the outermost opaque row/column
  outward) on every frame. Belt-and-braces against nearest-neighbour sampling pulling in a
  neighbour's pixels.
- **≤2048×2048, power-of-two outer dimensions**, tight interior packing. Fail the build loudly if
  a pack exceeds the cap — this is the one place that *should* fail closed, because the runtime
  cannot.
- **Frame ordering:** each car's 12 steps contiguous largest→smallest, then next angle, then next
  colour, with that car's overlays immediately following its bodies. Frames drawn together end up
  physically adjacent, which helps texture-cache locality.

**`scripts/requirements.txt`** — Pillow. **Created by Spec A (Task 9)**; amend it here only if
this spec needs a package Spec A did not declare.

---

## 7. Colour variants

Research §4c ranks the options and picks **pre-baked colour variants in the atlas**, extending the
`FONT_COLORS` precedent (`spriteManifest.ts:11-30`). One `drawSprite` per car, zero per-frame
allocation, zero compositing, and it works on the headless test path.

Explicitly rejected, with reasons worth keeping:
- **`globalCompositeOperation` tinting per frame** — Mozilla bug #762973 records all non-
  `source-over` composite ops as very slow (Direct2D lacks blend control, forcing a D3D fallback),
  and the `source-atop` route needs two draws per car per frame.
- **Per-pixel `ImageData`** — slowest canvas path, and it allocates.

**The saving that makes this affordable: only the body ramp is recoloured.** Wheels, exhaust,
spoiler and intake overlays are colour-neutral chrome/black and are shared across all body
colours. You are not multiplying the whole car by 8 — only the body. This is the second dividend
of the layering scheme.

Budget: player set ≈100k px² per colour × 8 colours ≈ 800k px², fitting a 1024×1024 region.
Traffic needs fewer colours and fewer frames.

**Escalation path if `cars.png` approaches 2048×2048:** switch body colours to a **load-time
offscreen tint cache** (built once at boot into an offscreen canvas, degrading to procedural in
tests). Never to per-frame compositing.

---

## 8. Renderer consumption

⚠️ **`Renderer.ts` line numbers in this section predate Spec A**, which adds a shoulder quad,
band merging, and horizon threading. Anchor on symbol names. Two specifics: `drawPlayerCar`
already takes its size and position from `PLAYER_CAR_WIDTH` / `PLAYER_CAR_BASE_Y` after Spec A,
so this spec swaps the *artwork* only — do not re-derive the placement. And
`PLAYER_CAR_WIDTH === LADDER[0] === 120`, which is why the player draws at its largest native
step with no scaling at all.

1. **`blit`** (`Renderer.blit`, `Renderer.ts:238-246` pre-Spec-A): compute the ideal width as today, then
   `ladderStepFor(idealWidth)`, then draw that step's frame **at its native size**. The magic
   `roadHalfWidth / DEFAULT_CAMERA_HEIGHT` term (flagged *"provisional, retuned at gate"* in the
   source) feeds the ideal width only; it no longer scales the blit.
2. **`drawPlayerCar`** (`Renderer.ts:248-254`) takes arguments for the first time — steer, skid,
   brake. Frame selection: skid → skid frame; else |steer| thresholds → angle 0/1/2 with `flipX`
   for negative steer. Brake lights are an **overlay quad**, not a separate body set.
3. **Body roll:** the vertical-offset trick — nudge 1–2px and swap to the 30° frame. **Never
   rotate.** Free rotation is the Mode-7 look the project explicitly avoids (research §1c), and
   `RenderBackend` has no rotation by design.
4. **Overlays** via `SpriteComposer`, culled below `OVERLAY_CULL_STEP`.
5. **Traffic**: `TrafficCar` gains an integer variant index. Note `drawSprites`
   (`Renderer.ts:221-236`) is **O(drawDistance × cars)** — 300 × 4 = 1200 iterations/frame today.
   It rescans the whole traffic array for every visible segment. At 4 cars this is fine; the
   research's scenario is ~60. **Bucket cars by segment index before the draw pass** if car count
   grows past ~12. Do not let this spec ship a 300 × 60 = 18,000-iteration inner loop.

### The seam to settle: getting steer/skid to the renderer

`Vehicle.skidding` already exists (`src/physics/Vehicle.ts:57`) but is not surfaced. `PlayerState`
(`types/engine.ts:39`) is a deliberately narrow read-only view — `z`, `x`, `speed`, `gear` — and
its source comment says so.

**Recommendation: widen `PlayerState` with `readonly steer` and `readonly skidding`.** It keeps
the read-only seam intact and avoids handing the renderer a mutable `Vehicle`. Passing `Vehicle`
directly would be the expedient choice and would erode a boundary that was drawn on purpose.

---

## 9. Files

**New — bake side:** `scripts/render_car_sprites.py`, `scripts/pack_atlas.py`,
`scripts/imageops.py` (+ `scripts/test_imageops.py`, `scripts/test_pack_atlas.py`),
`art/models/` (CC0 packs) + `art/models/LICENSES.md`, `art/build/cars/` (intermediate, gitignored).

**New — shipped assets:** `public/assets/sprites/cars.png`, `public/assets/sprites/cars.json`.

**Modified:** `scripts/prep_backgrounds.py` (refactored onto `imageops.py`, output must stay
byte-identical), `src/engine/Renderer.ts` (ladder quantisation in `blit`, `selectCarFrame`,
`overlaysVisible`, overlay composition, `drawPlayerCar` gaining arguments),
`src/types/engine.ts` (`PlayerState` widened with `steer` + `skidding`),
`src/physics/Vehicle.ts` (`steer` getter; `skidding` already exists at `Vehicle.ts:57`),
`src/engine/Traffic.ts` (integer variant index alongside the existing `sprite` string),
`package.json` (`bake:cars` script).

**Not modified:** `packAtlas.ts`, `generateSprites.ts`, `spriteManifest.ts` — the procedural
fallback path stays intact by design (Spec B §9).

---

## 10. Known test breakage — expect this, do not paper over it

`Renderer.test.ts:230` (pre-Spec-A; Spec A adds a `road surface` block above it, so search for the
assertion rather than the line) asserts:

```ts
expect(trees[1]!.dh).toBeGreaterThan(trees[0]!.dh);   // segment 5 vs segment 30
```

Under quantisation this holds **only if those two z-values land on different ladder steps.** The
neighbouring monotonicity assertion (`Renderer.test.ts:233-244`, non-decreasing far→near) stays
valid, because a step ladder is monotonic.

The correct fix is to pick test segments far enough apart to straddle a step boundary, and to add
a new test asserting the *quantisation itself*: sprites at nearby z values now share an identical
`dw`, which is the property the whole spec exists to create. Loosening the assertion to
`toBeGreaterThanOrEqual` would delete the test's meaning.

Also: sprites are identified in tests by their atlas `sx`/`sy` (`Renderer.test.ts:218-219`), since
the image is a stub. That still works, but per-name tests become per-name-per-step.

---

## 11. Testing — Vitest

Vitest cannot run Blender or open a PNG. The split:

- **Pure/engine (Vitest):** ladder quantisation in `blit` — two nearby z values produce an
  identical `dw`; a far and near sprite produce different steps; steering-frame selection maps
  steer/skid to the expected (angle, flipX) pair at every threshold and boundary; overlay culling
  fires below the cull step; brake overlay appears only when braking; traffic variant index
  resolves without string construction.
- **Bake scripts (Python, run by hand + CI-able):** `pack_atlas.py` emits a manifest that Spec B's
  `parseAtlasManifest` accepts; no two frames overlap; every frame has ≥2px gutter; atlas is POT
  and ≤2048; every anchor is within 0..1. A tiny synthetic fixture set is enough — do not require
  Blender to test the packer.
- **Round-trip:** a golden `cars.json` fixture checked into the repo, parsed by the TS test suite.
  This is what stops the bake script and the loader drifting apart.

---

## 12. Visual gate

1. `npm run dev`. The player car is a real rendered GT, not a rectangle.
2. **Shimmer check — the reason this spec exists.** Approach a traffic car from maximum draw
   distance at full speed, then repeat at crawl. Pixels must not crawl or wink at either speed.
   Research §3b flags the documented OutRun "sprite zoom bug" as *"only noticeable when driving at
   low speeds"* — low speed is the real test.
3. **Step-pop check.** Watch a car cross the ladder's large end. If pops are visible, add steps at
   the large end (cheap); **do not add interpolation.**
4. **Overlay registration — the classic failure.** Turn hard **left** and confirm wheels and
   exhaust stay attached. That is the `ax → 1 − ax` mirror doing its job; a detachment here means
   the flip mirror is wrong.
5. Confirm overlays disappear cleanly at distance rather than popping.
6. Confirm the car reads against all three plates, and that its palette sits with the road.

---

## 13. Done-when

- CC0 models are in `art/models/` with **`LICENSES.md` recording provenance**, and separated
  wheels + symmetric bodies are verified.
- `render_car_sprites.py` bakes **3 angles × 12 ladder steps × N colours**, body and wheels on
  separate passes, palette-clamped, headless from the CLI and **re-runnable** to the same output.
- **Anchors are emitted by Blender**, normalised 0..1, and correct across every ladder step.
- `pack_atlas.py` produces a **≤2048×2048 POT atlas** with 2px gutter + 1px bleed, and a manifest
  Spec B's parser accepts unchanged.
- `Renderer` **quantises to the ladder** and draws each step at native size — verified by a test
  that nearby z values share a `dw`.
- Steering selects among **3 angles + flip**; brake lights and wheels are **anchored overlays**
  that stay attached **through a hard left turn**; overlays cull at distance.
- Body roll uses the **vertical-offset trick — no rotation anywhere**.
- `npm test` and `npm run build` green; hard rules 1–5 held, in particular **no per-frame
  allocation and no per-frame string construction** in the car draw path.
- **HUMAN VISUAL GATE:** no pixel crawl at any speed, including crawl; overlays stay registered
  both ways.

---

## 14. Caveats

- **Blender camera numbers (lens, height, pitch), the 12 ladder sizes, and the 128×80 frame size
  are inference**, not sourced constants. Tune against the plates and on-device.
- **Poly counts for both packs are unpublished** — measure rather than assume they are cheap.
- **The flip = authored-mirror equivalence holds only for symmetric bodies.** Verified at §2, but
  it silently constrains future livery design.
- **No vetted CC0 pack has an open-wheel car.** The GT silhouette is a deliberate, recorded
  deviation from `plan.md`'s F1 language, not an oversight. The F1 swap is queued as follow-up.
- The 5.2 API facts in §3 were **probed on this machine on 2026-08-10**. Re-probe after any Blender
  upgrade; `BLENDER_EEVEE` vs `BLENDER_EEVEE_NEXT` has already changed identity twice across 4.x
  and 5.x.
- **`imageops.py` conflating adaptive and fixed quantisation would silently re-palette the
  backgrounds.** Called out again here because it is the kind of regression that looks like a
  successful run.
