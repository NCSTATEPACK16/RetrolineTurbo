# Spec A — Art Direction Lock, Road Surface & Screen Layout

**Date:** 2026-08-10
**Roadmap:** `plan.md` §10 Phase 7.5 · road math in `plan.md` §7
**Research source:** `docs/research/2026-08-10-art-direction-asset-pipeline-research.md` §1 (Art
Direction Lock) and §5a (Screen Composition).
**Predecessor:** Phase 7 — Branching Pyramid (code-complete).
**Runs when:** immediately. **This spec has no asset dependency and no dependency on Specs B/C/D.**
**Supersedes:** the road/look portions of `2026-08-06-sprite-asset-pipeline-spec.md`.
**Sequence:** A → B → C → D. A is the only one that ships visible change with zero new art.

---

## 1. Goal

Lock the look. Today the palette is eight provisional hexes carrying a comment that reads
*"Retuned when the look locks in Phase 4"* (`src/constants.ts:70`); the road strobes because
bands are never merged near the horizon; the HUD follows a superseded 24px layout; and there is
no mechanical enforcement of the 2×2 authoring grid that the research names as the single
decision making the game read as 16-bit.

This spec closes all four. When it lands, every subsequent asset — every car sprite baked in
Spec C, every prop in Spec D — has one palette to clamp against and one screen layout to sit in.
Doing this *first* is the point: bake 800k px² of car sprites against the wrong palette and you
bake them twice.

---

## 2. Finding that amends the research: the plates are synthwave, not naturalistic

The research (§1a) proposes sky ramps as an explicit *"engineering starting point — sample the
three plates' quantised palettes first and nudge these to match."* That sampling has now been
done. The result materially changes the recommendation.

Dominant colours of the three shipped plates (left half only; the right half is a mirror):

| Plate | Unique colours | Top dominants |
|---|---|---|
| `city_night.png` | 48 | `#10154c` `#1e1a5b` `#0f144c` `#752b96` `#9538ab` `#441d7f` |
| `coastal_sunset.png` | 48 | `#1b0131` `#f4477e` `#f01985` `#f78270` `#d50995` `#fea263` `#fee971` |
| `desert_canyon.png` | 45 | `#6228a2` `#271059` `#c4432f` `#9132a7` `#c44270` `#fea74c` |

**The plates are saturated synthwave** — indigo/violet/magenta with hot-pink and sodium-orange
accents. The research's proposed coastal ramp (`#f8b06a → #f07850 → #c04870 → #5a3a80`) is
considerably more desaturated than what actually shipped (`#f01985`, `#d50995`). Its night ramp
(`#101038 → #282858 → #4a4a80`) is close and can stand nearly as written.

**Two consequences the implementer must not "fix" back toward the research text:**

1. **Sky/environment ramps are re-derived from the plates, not taken from §1a.** The plate is the
   ground truth — it is already on screen and already shipped.
2. **The master palette does not govern the plates themselves.** Each plate carries its own
   adaptive 48-colour median-cut palette from `prep_backgrounds.py`; three plates is up to ~141
   distinct colours, which cannot collapse into one 48-colour master without visibly degrading
   art that already looks right. **The master palette governs gameplay elements only** — road
   surface, kerbs, lane, shoulder, vehicles, props, UI. Those *do* composite against every plate,
   so they must be chosen to sit on all three. This is a deliberate scope boundary on the
   research's "one coherent film stock" framing, and it is why the road greys and kerb reds below
   are neutral/high-chroma rather than tinted to any one plate.

---

## 3. The palette as shared data

**New file: `src/assets/palette.json`** — the single source of truth, read by both sides:

- **TypeScript:** imported by a new typed `src/assets/palette.ts`. `tsconfig.json` already sets
  `resolveJsonModule: true` (verified), so this needs no build-config change.
- **Python:** read directly by `scripts/prep_backgrounds.py` and, from Spec C onward, by
  `render_car_sprites.py` and `pack_atlas.py` for the fixed-palette clamp.

Structure — role-grouped, ramps as ordered arrays dark→light. Roles split into a **core**
group (on screen every single frame) and a **variable** group (`body`, `sky` — only a subset
is ever composited at once):

```json
{
  "road":    { "surfaceA": "#4a4a55", "surfaceB": "#42424c", "shoulder": "#5a5a66" },
  "kerb":    { "red": "#d02020", "white": "#f0f0f0" },
  "lane":    "#e8e8d0",
  "outline": "#101018",
  "trunk":   "#6a4a2a",
  "foliage": ["#2a7a3a", "#3d9a4d", "#58b85a"],
  "chrome":  ["#2a2a32", "#5a5a6a", "#9a9ab0", "#d8d8e8", "#ffffff"],
  "ui": {
    "header":     "#000088",
    "headerEdge": "#3333ff",
    "treeNode":   "#5060c0",
    "starOff":    "#2a2a6a",
    "white":      "#e8e8f0",
    "magenta":    "#e040c0",
    "cyan":       "#40e0e0",
    "red":        "#f03030",
    "gold":       "#ffcc00",
    "blue":       "#5070ff"
  },
  "body": {
    "red":  ["#4a0a10", "#8a1a20", "#c02a30", "#e85a55", "#ffb0a0"],
    "blue": ["#0a1a4a", "#1a3a8a", "#2a5ac0", "#5a8ae8", "#b0d0ff"]
  },
  "sky": {
    "night":  ["#00012f", "#10154c", "#1e1a5b", "#441d7f"],
    "sunset": ["#1b0131", "#b00187", "#f01985", "#f4477e", "#fea263", "#fee971"],
    "canyon": ["#271059", "#6228a2", "#9132a7", "#c4432f", "#fea74c"]
  }
}
```

Rules the implementer must hold:

- **`ui.*` is not free to change.** `white`/`magenta`/`cyan`/`red`/`gold`/`blue` are `FONT_COLORS`
  as already baked into the atlas (`src/assets/spriteManifest.ts:17-24`), and `starOff` is
  `STAR_UNLIT` (`spriteManifest.ts:49`) baked into the `star_off` frames. Moving any of them
  invalidates 228 glyph frames plus the star gauge and breaks `HUD.test.ts` / `text.test.ts`.
  Copy them across verbatim; the palette file *records* them, it does not redefine them. (Note
  the research §1a lists slightly different UI hexes — `#ffffff`, `#e030c0`, `#30d0e0`… — those
  are wrong for this repo. The shipped values win.)
  `headerEdge` and `treeNode` are runtime quad colours (`HUD.ts:31`, `:33`), free to retune, but
  they are recorded here so the palette is genuinely the whole UI surface. `TREE_PATH` and
  `TREE_ACTIVE` are already `ui.gold` / `ui.cyan`; the mini-map's `#e8e8f0` is `ui.white`.
- **Body ramps are 5 steps** (shadow / base / mid / highlight / specular), per research §1a. Ship
  `red` and `blue` in Spec A; Spec C adds the remaining ~6 hues on the identical 5-step pattern.
- **Two budgets, not one.** The research's "40–48" is about *simultaneous on-screen coherence*,
  not library size — so counting every stored slot against it deadlocks Spec C before it starts
  (8 body hues alone is 40 entries). Split it:
  - `CORE_MAX = 28` — a **hard** ceiling on `road`+`kerb`+`lane`+`outline`+`trunk`+`foliage`+
    `chrome`+`ui`, the colours present in literally every frame. 26 today. This is the real
    16-bit discipline and it must not drift.
  - `PALETTE_BUDGET = 52` — a **soft** library ceiling exported from `palette.ts`. 51 today.
    Raising it is a one-line, reviewable art-direction decision; Spec C raises it to 84.

  Both are asserted in a test. The old flat "40–48 total" assertion is dropped.
- `COLORS` in `src/constants.ts:71-80` becomes a derived view over `palette.ts`, keeping its
  current key names so no call site changes. `sky`/`groundLight`/`groundDark` map to the fallback
  band colours (used only when no plate has loaded) — `sky.night[0]`, `foliage[1]`, `foliage[0]`.

**New: `scripts/sample_palette.py`** — regenerates the environment-ramp section by re-sampling
`public/assets/backgrounds/*.png`, so the palette can be re-derived when a plate changes rather
than hand-maintained. It writes a report, not the file; a human accepts the values.

---

## 4. Road surface

All changes land in the per-segment draw block at `src/engine/Renderer.ts:165-184`.

### 4.1 Colours

| Element | Now (`constants.ts:71-80`) | After |
|---|---|---|
| Rumble / kerb | `#d0d0d8` / `#c04040` | `#f0f0f0` / `#d02020` |
| Road surface | `#4a4a52` / `#42424a` | `#4a4a55` / `#42424c` |
| Lane line | `#d8d8e0` | `#e8e8d0` (warm off-white) |
| Shoulder | *(none)* | `#5a5a66` — **new** |

### 4.2 The shoulder band

A fourth `drawQuad`, drawn **first**, at ~`1.22×` road half-width. Painter order in this block is
widest-first (rumble `1.15×` then road `1.0×`), so a wider quad underneath leaves a thin ring
visible outside the kerb. Its job per research §1d is to stop kerb red vibrating against foliage
green — so it is drawn on **both** band phases, unlike the kerb.

### 4.3 Anti-strobe band merging — the substantive change

The existing cadence is already correct and must be kept:

```ts
const dark = Math.floor((base + i) / this.config.rumbleSegments) % 2 === 1;  // Renderer.ts:145
```

`base` is `Math.floor(camera.z / segmentLength)` (`Renderer.ts:102`), so band phase already
advances in **world Z**, not screen space — which is exactly what research §1d demands and what
Gordon's tutorial warns about. Nothing there needs changing.

What is missing is the horizon merge. As segments compress toward the vanishing point, a rumble
group eventually projects to under one framebuffer row, and alternating it produces the strobe.

**New pure module: `src/engine/roadBanding.ts`**

```ts
/** Screen rows below which a rumble group must merge to a single colour. */
export const MIN_BAND_ROWS = 2;

/**
 * True when a rumble group is too short on screen to alternate without strobing.
 * `segmentScreenHeight` is one segment's projected height in framebuffer rows.
 */
export function bandMerges(segmentScreenHeight: number, rumbleSegments: number): boolean;
```

Call site: inside the segment loop, `segmentScreenHeight` is `this.near.y - this.far.y`, already
computed. When `bandMerges(...)` is true, force the light phase for kerb and road and skip the
lane dash entirely. The result is the natural solid blur at the horizon that OutRun has.

Keeping this a standalone pure function (rather than inlining the comparison) is deliberate: it is
the one road behaviour with a numeric threshold the visual gate will want to tune, and it must be
unit-testable without a backend.

### 4.4 Banded off-road grass — stretch, perf-gated

`COLORS.groundLight` is currently unused by the road loop (`Background.fillBand` paints a single
flat `groundDark` beyond the road). Banding the grass on the same rumble cadence using
`palette.foliage` would kill the flat-green look.

Cost: one full-width `drawQuad` per segment = **+300 quads/frame** on top of the ~900 the road
loop already emits at `drawDistance: 300`.

**Gate:** implement behind a constant, measure frame time with and without on the lowest-spec
target, and keep it only if the delta is under 1 ms. If it is cut, say so in the commit message —
do not silently drop it.

---

## 5. Screen layout

Per research §5a. The target composition at 480×270:

```
(0,0)                                                             (480,0)
 +--------------------------------------------------------------------+
 |  TX-1 BLUE HEADER  #000088                        y0-40 (40px)     |
 | STAGE 3   [route tree: o-o-O-o-o]        TIME 1:23     ***** CARS  |
 +--------------------------------------------------------------------+  y=40
 |                          SKY / HORIZON PLATE                       |
 |............................ HORIZON y=118 ........................ |  y=118
 |                          ROAD (segment projection)                 |
 |  SCORE 0042100                                     SPEED 287 km/h  |  <- y~248
 |                       player car  base y=232, x-center 240         |
 +--------------------------------------------------------------------+
(0,270)                                                          (480,270)
```

Changes required:

0. **Prerequisite: make the projection horizon-aware.** `projectY` (`src/math/projection.ts:47-56`)
   does **not** read `HORIZON_Y` or `camera.horizon` — it hardcodes the vanishing row as
   `height / 2`:

   ```ts
   const half = height / 2;
   return half - scale * (worldY - cameraY) * half;   // vanishing row is ALWAYS 135
   ```

   So moving `HORIZON_Y` alone would move the backdrop and the ground band while leaving the road
   converging at 135 — a 17px band of flat ground above the road's apex, plus a broken invariant:
   `zAtScanline` (`projection.ts:73`) already divides by `screenY - camera.horizon`, and the two
   agree today only by the coincidence that `135 === 270 / 2`. The module's own docblock
   (`projection.ts:17`) promises `zAtScanline(projectY(0, h, d/z), cam) === z`; that promise
   breaks the instant the horizon is not the vertical centre.

   **Fix — separate the origin row from the NDC→pixel factor.** The `H/2` multiplier is the
   normalised-device→pixel conversion and must stay; only the *offset* moves:

   ```ts
   export function projectY(
     worldY: number, cameraY: number, scale: number,
     height: number = LOGICAL_HEIGHT,
     horizon: number = height / 2,
   ): number {
     return horizon - scale * (worldY - cameraY) * (height / 2);
   }
   ```

   Then thread `camera.horizon` through `projectSegment` and `Renderer.projectInto`. This makes
   `zAtScanline` an exact inverse for *any* horizon — it is a latent-bug fix, not a workaround.
   `horizon` is appended last so no existing positional call site moves.

   `projection.test.ts` needs updating: the two `horizon collapse` assertions and the
   `zAtScanline` round-trip must pass the horizon explicitly (or go through `levelCamera()`).
   Those are legitimate, explainable edits — but nothing else in that file should move.

1. **`HORIZON_Y`: 135 → 118.** Currently `LOGICAL_HEIGHT / 2` (`constants.ts:32`). With §5.0
   landed this genuinely shifts the vanishing point for every projected segment and sprite, so
   the road geometry visibly changes. Expect `Renderer` tests that assert absolute y-positions to
   move. The road now occupies rows 118–270 (152) instead of 135–270 (135) — **~13% more road**,
   so `DEFAULT_FOCAL_LENGTH` is the first thing to check at the gate if depth feels wrong.
   The plates (heights 119/112/99) sit with their bottom edge on the horizon;
   `Background.renderBackdrop` (`Background.ts:46-50`) computes `top = horizon - height` and
   skips its sky fill when `top <= 0`. ⚠️ `city_night` is 119px, so at horizon 118 it lands at
   `top = -1` — one row clipped off the top, and the band is fully covered by the 40px header
   regardless. Harmless, but do not "fix" it by shrinking the plate.
2. **Header 24px → 40px**, `#000088`, in `src/ui/HUD.ts`. Carries the route tree (centre), stage,
   timer, and the gold-star CARS gauge.
3. **SCORE and SPEED move out of the header** to the bottom corners at y≈248 — SCORE at x≈8,
   SPEED right-aligned ending at x≈472. Both ≥6px from every edge (`viewport-fit=cover` is set
   for the iOS notch; corners are the safe region). **GEAR stays**, as a scale-1 label
   right-aligned at `HUD_ROW_Y - 7` (y≈241), directly above SPEED.
4. **Player car:** base y=232, centred x=240, ~120px wide. `Renderer.drawPlayerCar`
   (`Renderer.ts:248-254`) currently hardcodes `dw = f.w * 3` and `dy = LOGICAL_HEIGHT - dh - 6`.
   Replace both with named layout constants (`PLAYER_CAR_BASE_Y`, `PLAYER_CAR_WIDTH`) so Spec C
   can swap the artwork without re-deriving the position. **Spec A does not change the player
   artwork** — the procedural 34×20 frame just gets drawn at the locked size and position.
   ⚠️ `PLAYER_CAR_WIDTH = 120` is deliberately `LADDER[0]` from Spec B §3. That equality is
   load-bearing: Spec C draws the player at its native largest ladder step. Spec B asserts it.
5. **The mini-map is cut.** `HUD.drawMiniMap` (`HUD.ts:114-122`) anchors at `HEADER_H + 8`, which
   becomes y=48 — on top of the sky plate. The researched TX-1 composition has no mini-map, and
   neither does TX-1, OutRun, or Pole Position; the route tree already carries stage-level
   position. Delete the method and its test (`HUD.test.ts:41`). Keep `render`'s signature intact
   — rename the now-unused `track`/`camera` params to `_track`/`_camera` (required by
   `noUnusedParameters: true`) so Spec D can revive them for camera-driven effects.
6. **What actually breaks in `HUD.test.ts`:** contrary to an earlier draft of this spec, **none**
   of its 14 tests assert a column position, and the header-band tests reference `HUD.HEADER_H`
   symbolically, so they survive the 24→40 change untouched. Exactly one test breaks — the
   mini-map test above. The new layout needs *new* tests (§8), not a rewrite of the old ones.

---

## 6. The 2×2 virtual grid, enforced

Research §1b names this the key decision: author on a 2×2 pixel-cluster grid so *effective* art
resolution is ~240×135 while the framebuffer stays 480×270. That is a discipline in the art, and
disciplines that are not mechanised decay.

**Add a vitest lint** over `SPRITE_MANIFEST` (`src/assets/spriteManifest.ts:121`): every `DrawOp`
in a scenery or vehicle entry must have even `rx`, `ry`, `rw`, `rh`, and every such entry must
have even `w`/`h`.

**Exemptions:**
- All 228 glyph frames (`glyph_*`, `digit_*`) — the font is 3×5 and predates the rule.
- `star_on` / `star_off` — 7×7 star masks.

⚠️ The exemption test must **not** be written as "filter by the exemption predicate, then check
the results satisfy the exemption predicate" — that is a tautology that passes no matter what
anyone adds to the list. Assert instead that the exempt set is **exactly 230 entries** and that
every one of them is 3×5 or 7×7. That catches someone quietly adding `bush` to the predicate.

**The actual state of the manifest, measured:**

- **Every `w`/`h` is already even** — `tree` 16×40, `bush` 14×12, `rock` 12×10, `sign` 14×22,
  `billboard` 28×24, `car0-3` 22×14, `player` 34×20. An earlier draft of this spec claimed these
  were odd; they are not. **No sprite dimension changes.** That is a meaningful simplification:
  `packAtlas(SPRITE_MANIFEST, 256)` produces a byte-identical layout, so `packAtlas.test.ts` and
  every atlas-dependent test are untouched by this task.
- **All 10 non-exempt entries fail on their `ops`** — including `tree` (op0 `rx: 7`) and
  `billboard` (op3 `rx: 3, ry: 3`), which an earlier draft claimed already complied.

Rounding is constrained by two things beyond parity: ops must stay inside their `w`×`h` box, and
symmetric features must stay centred on `anchorX = floor(w / 2)`. For an even-width sprite with
an odd centre (`player` w=34 → 17, `car` w=22 → 11), a centred even-width op needs
`rw ≡ 2 (mod 4)`. The concrete table is in the plan (Task 7); ops not listed there are already
compliant and must not be touched.

⚠️ **Do not rename any sprite.** `src/track/schema.ts:27` builds `VALID_SPRITES` from
`SPRITE_MANIFEST` names, and every track JSON validates against it. Changing op geometry is safe;
changing names breaks track loading.

---

## 7. Files

**New:** `src/assets/palette.json`, `src/assets/palette.ts`, `src/assets/palette.test.ts`,
`src/engine/roadBanding.ts`, `src/engine/roadBanding.test.ts`, `scripts/sample_palette.py`,
`scripts/requirements.txt` (Pillow — none exists today).

**Modified:** `src/math/projection.ts` + `projection.test.ts` (**horizon-aware `projectY`** — §5.0),
`src/constants.ts` (COLORS derived; `HORIZON_Y`; new layout constants),
`src/engine/Renderer.ts` (horizon threading, shoulder quad, band merge, player-car layout constants),
`src/ui/HUD.ts` + `HUD.test.ts` (40px header, corner readouts, mini-map cut),
`src/ui/text.ts` (+ `textWidth` for right-alignment),
`src/assets/spriteManifest.ts` (grid-compliant ops; export `STAR_UNLIT`) + `spriteManifest.test.ts` (lint),
`src/engine/Renderer.test.ts` (horizon-dependent assertions).

---

## 8. Testing — Vitest

Following the `RecordingBackend` convention: assert **relationships**, not absolute pixels,
except where a pixel *is* the contract (layout constants, palette hexes).

- **Palette:** parses; `coreEntryCount() <= CORE_MAX (28)`; `paletteEntryCount() <=
  PALETTE_BUDGET (52)`; every value matches `/^#[0-9a-f]{6}$/`; each body ramp is exactly 5
  entries ordered monotonically increasing in luminance; `ui.*` is byte-identical to
  `FONT_COLORS` **and `ui.starOff === STAR_UNLIT`** (this is the regression guard against
  silently re-theming the font or the star gauge).
- **Projection (§5.0):** `projectY` with an explicit `horizon` returns that row in the
  `scale → 0` limit; `zAtScanline(projectY(0, h, d/z), cam) === z` round-trips **for a camera
  whose horizon is not `height / 2`** — the assertion that would have caught this bug.
- **`bandMerges`:** true below the threshold, false above, exact at the boundary; monotonic in
  `segmentScreenHeight`; independent of `rumbleSegments` sign/zero (guard against divide-by-zero).
- **Road rendering (RecordingBackend):** four quads per segment per road, ordered widest-first
  (shoulder > rumble > road > lane); shoulder present on both band phases while kerb alternates;
  near the horizon, quads within one merged group all share a colour; lane dash absent on merged
  bands.
- **Layout:** `HORIZON_Y === 118`; header band is exactly 40 rows of `#000088`; SCORE and SPEED
  draw calls fall ≥6px inside every edge; player car dest rect is centred on x=240 with its
  bottom edge at y=232.
- **2×2 grid lint:** described in §6, with the exemption list asserted explicitly so a future
  contributor cannot quietly widen it.

---

## 9. Visual gate

1. `npm run dev`, drive each of the three plate stages (city → coastal → desert).
2. **Strobe check — the one that matters.** Hold full throttle on a straight, then crawl at
   ~20 km/h. Research §1d flags low speed as where stepping artifacts show. The kerb must read as
   solid near the horizon and cleanly alternating near the car, with no flicker at either speed.
3. Confirm the road greys read as *texture*, not stripes — if you can see two distinct greys, they
   are too far apart.
4. Confirm kerb red does not vibrate against foliage green (that is the shoulder's whole job).
5. Screenshot each stage; verify HUD readouts are legible against all three plates, and that the
   40px header does not crowd the horizon.

---

## 10. Done-when

- `palette.json` is the **single source of truth**, consumed by both TypeScript and Python, with
  `ui.*` provably identical to the shipped `FONT_COLORS` + `STAR_UNLIT`, and both budgets
  (`CORE_MAX`, `PALETTE_BUDGET`) asserted.
- The road draws **shoulder / kerb / surface / lane** with the locked hexes, and **bands merge**
  near the horizon instead of strobing — verified at both full speed and crawl.
- **`projectY` is horizon-aware** and `zAtScanline` round-trips it for a non-centred horizon.
- Screen layout matches §5: **horizon at 118 (road *and* plate), 40px header, SCORE/SPEED in the
  bottom corners, GEAR above SPEED, mini-map gone, player car based at y=232**.
- The **2×2 grid rule is enforced by a test**, with exemptions explicit, and every non-exempt
  manifest entry complies.
- `npm test` and `npm run build` green. Hard rules 1–5 held — in particular **no new per-frame
  allocation**: `bandMerges` takes and returns primitives, and the shoulder quad adds no object.
- **HUMAN VISUAL GATE:** the look reads as 16-bit arcade against all three plates. This gate also
  retires the *"Retuned when the look locks in Phase 4"* note at `constants.ts:70`.

---

## 11. Caveats

Carried forward from the research, which flags these as inference rather than sourced constants:

- **Road, kerb, lane, shoulder, body-ramp and foliage hexes are starting points**, not measured
  values. Tune at the visual gate. The plate-derived environment ramps (§2) *are* measured.
- **`1.22×` shoulder width and `MIN_BAND_ROWS = 2` are estimates.** Widen the shoulder if the red
  still vibrates; raise the merge threshold if strobe survives.
- **`HORIZON_Y = 118` is a layout inference** ("just above vertical centre"). It interacts with
  `DEFAULT_FOCAL_LENGTH` and `DEFAULT_CAMERA_HEIGHT`, both themselves marked provisional at
  `constants.ts:30-31`. If the road looks wrong after the change, the horizon is the first
  suspect and the focal length is the second — and the road gaining 17 rows makes a focal-length
  retune *likely*, not merely possible.
- **`CORE_MAX = 28` and `PALETTE_BUDGET = 52` are judgement calls**, not sourced constants. The
  research's "40–48" is about on-screen coherence; the split in §3 is this spec's reading of that
  intent. `CORE_MAX` is the one to defend — treat a request to raise it as an art-direction
  decision, not a formality.
- The research's own §1a UI hexes conflict with the shipped `FONT_COLORS`; §3 resolves this in
  favour of the shipped values. Recorded here so the discrepancy is not rediscovered as a bug.
