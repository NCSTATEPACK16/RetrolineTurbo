# Spec D — Props, Parallax, Effects & Font: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the world around the car — roadside props, a second parallax layer, alpha-blended effects, and (optionally) an arcade font.

**Architecture:** Props run through Spec C's Blender pipeline unchanged, so they share the cars' palette and outline automatically. The second parallax layer reuses `prep_backgrounds.py` and the existing `backdropTiles` machinery. Effects get a droppable atlas. The font is last and cuttable.

**Tech Stack:** Blender 5.2 (headless), Python 3 + Pillow, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-10-d-props-parallax-effects.md`
**Requires:** Spec C complete (`render_car_sprites.py`, `imageops.py`, `pack_atlas.py`).

## Global Constraints

- **Reuse Spec C's bake path unchanged** — same camera, same flat shading, same 1px Freestyle outline, same fixed palette clamp. That reuse is why D runs after C.
- **Every new sprite name must be added to `SPRITE_MANIFEST`.** `src/track/schema.ts:27` builds `VALID_SPRITES` from it and every track JSON validates against that set. A prop that exists only in `props.png` will fail track loading. The procedural entry registers the name; the PNG frame supplies the appearance.
- **No gradient fills and no `shadowBlur`.** Both are budget-eroders and both read as modern vector rather than 16-bit. Bake gradients into the sprite.
- **No dithering on sprites below ~16px** — no room for a pattern to read, so it is just noise.
- **No per-frame allocation.** New layers use pre-allocated tile arrays, following `Background.tileXs` (`Background.ts:21`).
- **`effects.png` must be droppable** — the game stays fully playable when it fails to load.
- Licences: CC0/CC-BY/OFL only.
- Tests: `npm test`. Build gate: `npm run build`. Commit after every task.

**Ordering advice:** §3 (parallax) has the highest visual return per hour. §6 (font) has the lowest and touches the most tests — **cut it first if time runs short.**

---

### Task 1: Second parallax layer

**Files:**
- Modify: `scripts/prep_backgrounds.py` (`ASSETS` list)
- Modify: `src/engine/Backdrop.ts:30-56`
- Modify: `src/engine/Background.ts:21,46-62`
- Test: `src/engine/Backdrop.test.ts`, `src/engine/Background.test.ts`

**Interfaces:**
- Produces: `BACKDROP_FAR_SPEED: number`; `Background` gains a second pre-allocated tile array. `Backdrop`/`BackdropMeta` are unchanged.

This closes the gap `active-plan.md:22` records explicitly: *"Not done: multiple parallax depth layers — this is one plate layer."*

- [ ] **Step 1: Acquire the far-layer art**

| Asset | URL | Licence |
|---|---|---|
| OGA **Parallax Mountain Background** | https://opengameart.org/content/parallax-mountain-background | CC0 |
| OGA **Background Clouds & Mountains Parallax** | https://opengameart.org/content/background-clouds-and-mountains-parallax | CC0 (ships layered GIMP source) |

Drop the sources into `art/source/` and record them in `art/models/LICENSES.md` (or a sibling `art/LICENSES.md`).

- [ ] **Step 2: Write the failing test**

```ts
// add to src/engine/Backdrop.test.ts
import { BACKDROP_LAYER_SPEED, BACKDROP_FAR_SPEED, backdropPan } from './Backdrop.js';

describe('parallax depth', () => {
  it('pans the far layer more slowly than the plate — that lag IS the depth cue', () => {
    expect(BACKDROP_FAR_SPEED).toBeLessThan(BACKDROP_LAYER_SPEED);
  });

  it('wraps the far layer seamlessly like the plate', () => {
    const w = 960;
    for (const x of [0, 1234, -5678, 1e6]) {
      const pan = backdropPan(x, 0, w);
      expect(pan).toBeGreaterThanOrEqual(0);
      expect(pan).toBeLessThan(w);
    }
  });
});
```

```ts
// add to src/engine/Background.test.ts
it('draws the far layer before the plate so the plate occludes it', () => {
  const backend = new RecordingBackend();
  renderBackgroundWithBothLayers(backend); // local helper
  const farIdx = backend.sprites.findIndex(isFarLayer);
  const plateIdx = backend.sprites.findIndex(isPlate);
  expect(farIdx).toBeLessThan(plateIdx);
});

it('reuses pre-allocated tile arrays across frames', () => {
  const bg = new Background();
  const backend = new RecordingBackend();
  const before = backend.sprites.length;
  for (let i = 0; i < 10; i++) bg.render(camAt(i * 100), 0, backend, plate, farPlate);
  // A stable per-frame sprite count proves no array is growing frame to frame.
  const perFrame = (backend.sprites.length - before) / 10;
  expect(Number.isInteger(perFrame)).toBe(true);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/engine/Backdrop.test.ts src/engine/Background.test.ts`
Expected: FAIL — `BACKDROP_FAR_SPEED` does not exist.

- [ ] **Step 4: Process the far layers**

Add entries to `prep_backgrounds.py`'s `ASSETS` list. The tool already does chroma-key → crop → area-downscale → palette quantise → mirror-for-wrap, so the far layer is just another entry.

⚠️ Two constraints:
- **Crop to the band between header and horizon** — with Spec A's layout that is y=40..118, only **78 rows**.
- **Quantise the far layer against the plate it sits behind.** Each plate carries its own adaptive 48-colour palette (Spec A §2), so a far layer quantised in isolation will clash. Run `scripts/sample_palette.py` on the target plate first.

- [ ] **Step 5: Add the layer to the engine**

In `Backdrop.ts`, add `export const BACKDROP_FAR_SPEED = 0.008;` (slower than the existing `BACKDROP_LAYER_SPEED = 0.02` at `Backdrop.ts:35`).

In `Background.ts`, add a second pre-allocated array beside `tileXs` (`Background.ts:21`):

```ts
  private readonly tileXs = [0, 0, 0];
  private readonly farTileXs = [0, 0, 0];
```

In `renderBackdrop`, draw the far layer **before** the plate, using `backdropTiles(farPan, farPlate.width, LOGICAL_WIDTH, this.farTileXs)`. `backdropTiles` already writes into a caller-owned array (`Backdrop.ts:50-56`), so this adds no allocation.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/engine/Backdrop.test.ts src/engine/Background.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/prep_backgrounds.py src/engine/Backdrop.ts src/engine/Background.ts src/engine/Backdrop.test.ts src/engine/Background.test.ts public/assets/backgrounds art/
git commit -m "feat(background): add a second, slower parallax layer behind the plates"
```

---

### Task 2: Roadside props

**Files:**
- Create: `scripts/render_props.py` (thin wrapper over Spec C's scene setup)
- Modify: `src/assets/spriteManifest.ts:121-168`
- Modify: `src/engine/CarFrameSet.ts` (sparse step support)
- Create: `public/assets/sprites/props.png` + `props.json`
- Test: `src/assets/spriteManifest.test.ts`, `src/track/schema.test.ts`

**Interfaces:**
- Consumes: Spec C's `setup_scene`, `setup_camera`, `render_step`, and `pack_atlas.pack`.
- Produces: new sprite names registered in `SPRITE_MANIFEST`; `props.json` in Spec B's schema.

- [ ] **Step 1: Acquire props**

| Asset | URL | Licence | Use |
|---|---|---|---|
| Kenney **Racing Kit** (110) | https://kenney.nl/assets/racing-kit | CC0 | Grandstands, tents, billboards, signs, fences, flags |
| Kenney **Background Elements Redux** | https://kenney.nl/assets/background-elements-redux | CC0 | Tree/hill silhouettes |
| Quaternius **Ultimate Nature** (150+) | https://quaternius.itch.io/150-lowpoly-nature-models | CC0 | Trees, palms |

- [ ] **Step 2: Write the failing test**

```ts
// add to src/assets/spriteManifest.test.ts
const NEW_PROPS = ['lamp_post', 'median_post', 'grandstand', 'palm', 'billboard_sponsor'];

describe('prop registration', () => {
  it('registers every new prop name in the manifest', () => {
    const names = new Set(SPRITE_MANIFEST.map((e) => e.name));
    for (const n of NEW_PROPS) expect(names.has(n), n).toBe(true);
  });

  it('authors every new prop on the 2x2 grid', () => {
    for (const e of SPRITE_MANIFEST.filter((x) => NEW_PROPS.includes(x.name))) {
      expect(e.w % 2, `${e.name}.w`).toBe(0);
      expect(e.h % 2, `${e.name}.h`).toBe(0);
    }
  });
});
```

```ts
// add to src/track/schema.test.ts
it('accepts a track that places every new prop', () => {
  for (const name of ['lamp_post', 'median_post', 'grandstand', 'palm', 'billboard_sponsor']) {
    const doc = { /* minimal valid TrackFile with one sprite rule using `name` */ };
    expect(() => parseTrackFile(doc)).not.toThrow();
  }
});
```

This second test is the one that matters — it guards the `SPRITE_MANIFEST` ↔ `VALID_SPRITES` coupling that otherwise breaks silently at track-load time.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/assets/spriteManifest.test.ts src/track/schema.test.ts`
Expected: FAIL — names not registered.

- [ ] **Step 4: Register the props procedurally**

Add entries to `SPRITE_MANIFEST` using the existing `billboard()` helper (`spriteManifest.ts:8`), which sets a base-centre anchor. Include the two the TX-1 handoff and `active-plan.md:23` still list unchecked: **`lamp_post`** (placed at `offset: ±1.2`) and **`median_post`** (hazard-striped, at fork splits).

Every entry must be on the 2×2 grid (Spec A Task 7 made that a test).

- [ ] **Step 5: Support sparse ladder steps**

Props need **fewer steps than cars** — a tree is seen briefly across a narrow distance range, and baking all 12 wastes atlas. Bake **6** (every other rung: 120/76/48/30/19/12).

This requires the frame set to record *which* steps exist rather than assuming a dense 0..11. Extend `CarFrameSet` (Spec B) with a nearest-available lookup:

```ts
  /** Nearest step that actually exists in this set — props bake a sparse ladder. */
  nearestStep(color: number, angle: number, want: number): number;
```

Add a test: asking for step 3 in a set that has only 0/2/4/6/8/10 returns 2 or 4, never a missing index.

- [ ] **Step 6: Bake and pack**

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/render_props.py -- \
  --models art/models/props --out art/build/props --steps 0,2,4,6,8,10
python3 scripts/pack_atlas.py --src art/build/props --id props --out public/assets/sprites
```

2D pixel props (the OGA set) skip Blender and need a hand recolour into `palette.json`'s foliage/sky ramps — the research budgets ~1–2 hrs per set.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add scripts/render_props.py src/assets/spriteManifest.ts src/engine/CarFrameSet.ts public/assets/sprites/props.* src/assets/spriteManifest.test.ts src/track/schema.test.ts
git commit -m "feat(props): bake roadside props through the shared pipeline with a sparse ladder"
```

---

### Task 3: Effects atlas

**Files:**
- Create: `public/assets/sprites/effects.png` + `effects.json`
- Modify: `src/engine/RenderBackend.ts`, `Canvas2DBackend.ts`, `testing/RecordingBackend.ts` (only if per-draw alpha is needed)
- Modify: `src/engine/Renderer.ts`
- Test: `src/engine/Renderer.test.ts`, `src/engine/Canvas2DBackend.test.ts`

**Interfaces:**
- Produces: `drawSprite(..., flipX?: boolean, alpha?: number)` **only if** §4's judgement call lands on needing it.

- [ ] **Step 1: Decide whether per-draw alpha is actually needed**

Prefer **baking opacity into the sprite** wherever the value is constant. Only add the parameter if an effect genuinely needs to fade at runtime (a flame that ramps with throttle, say).

If it is needed, follow Spec B Task 3's reasoning exactly: an optional trailing primitive, implemented by setting and restoring `globalAlpha`, recorded by `RecordingBackend`.

⚠️ `globalAlpha` is fine. What the research bans is **non-`source-over` composite ops** (Mozilla bug #762973 records them as very slow) and **gradient fills / `shadowBlur`**. Do not conflate the two.

- [ ] **Step 2: Write the failing test**

```ts
// add to src/engine/Renderer.test.ts
it('stays fully playable when the effects atlas is missing', () => {
  const backend = new RecordingBackend();
  const r = new Renderer(DEFAULT_TRACK_CONFIG, atlas); // no effects atlas at all
  expect(() => r.render(camAt(0), stubTrack(() => []), backend)).not.toThrow();
  expect(backend.quads.length).toBeGreaterThan(0); // road still drew
});
```

```ts
// add to src/engine/Canvas2DBackend.test.ts — only if alpha was added
it('restores globalAlpha after an alpha-blended draw', () => {
  const b = new Canvas2DBackend(canvas);
  ops.length = 0;
  b.drawSprite(img, 0, 0, 8, 8, 0, 0, 8, 8, 9999, false, 0.5);
  expect(ops).toContain('globalAlpha 0.5');
  expect(ops.at(-1)).toBe('globalAlpha 1');
});
```

- [ ] **Step 3: Bake the effects**

Exhaust flame (on gear shift), skid dust and smoke, speed streaks, headlight glow. These are the alpha-blended extras the SNES could not do (research §1c).

Pack with `pack_atlas.py --id effects`.

- [ ] **Step 4: Wire emission and guard the missing-atlas path**

Emit flame on shift, dust on skid, streaks above a speed threshold. Every effect call site must no-op when the atlas is absent — `effects.png` is the **droppable** atlas in Spec B's lifecycle split.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/assets/sprites/effects.* src/engine/Renderer.ts src/engine/Renderer.test.ts
git commit -m "feat(effects): add droppable effects atlas for flame, dust and speed streaks"
```

---

### Task 4: Press Start 2P (optional — cut this first)

**Files:**
- Create: `art/fonts/PressStart2P/` + `OFL.txt`
- Modify: `src/assets/spriteManifest.ts:52,61,112-118`
- Modify: `src/ui/HUD.ts`
- Test: `src/assets/spriteManifest.test.ts`, `src/assets/packAtlas.test.ts`, `src/ui/HUD.test.ts`

**Interfaces:**
- Produces: `maskOps(rows, hex, width)` — generalised from its current hardcoded 3 columns.

⚠️ **This is the most invasive item in Spec D and the correct thing to cut if time-boxed.** The 3×5 face is legible and shipped. Three specific hazards:

1. **`maskOps` is hardcoded to 3 columns** (`spriteManifest.ts:61`: `c < 3`, `0b100 >> c`), with a separate 7-column copy for stars (`starOps`, line 52). Press Start 2P is 8px. **Generalise `maskOps` to an arbitrary width** rather than adding a third near-duplicate.
2. **Glyph metrics change.** `drawText` advances `(f.w + 1) * scale` (`text.ts:29`), and every HUD column was laid out against a 3×5 face. Expect to re-measure the whole HUD against Spec A's coordinates.
3. **The procedural font must survive** as the headless/fallback path (Spec B §9). The PNG font augments it; it does not replace it. All six `SpriteAtlas` test files must still pass.

- [ ] **Step 1: Confirm it fits before baking 228 frames**

Press Start 2P at 8px is more than 2× the current 3×5 face. Measure the longest HUD string (`SPEED 287 km/h`) at the new metrics against the regions Spec A locks. **If it does not fit, stop here and keep the 3×5 font.**

- [ ] **Step 2: Write the regression guard**

```ts
// add to src/assets/spriteManifest.test.ts
it('generalised maskOps reproduces the 3-column output bit for bit', () => {
  // Guards the 228 already-baked glyph frames against a regression.
  for (const [ch, rows] of Object.entries(LETTER_ROWS)) {
    expect(maskOps(rows, '#ffffff', 3), ch).toEqual(legacyMaskOps(rows, '#ffffff'));
  }
});

it('handles an 8-column mask for the arcade face', () => {
  const ops = maskOps([0b10000001, 0, 0, 0, 0], '#ffffff', 8);
  expect(ops).toHaveLength(2);
  expect(ops.map((o) => o.rx)).toEqual([0, 7]);
});
```

Keep a copy of the current implementation as `legacyMaskOps` in the test file for the comparison, then delete it once green.

- [ ] **Step 3: Generalise maskOps**

```ts
// src/assets/spriteManifest.ts
/** Expand row bitmasks into 1x1 draw ops. `width` columns, MSB = leftmost. */
function maskOps(rows: readonly number[], hex: string, width = 3): DrawOp[] {
  const ops: DrawOp[] = [];
  const msb = 1 << (width - 1);
  for (const [ry, row] of rows.entries()) {
    for (let c = 0; c < width; c++) {
      if (row & (msb >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: hex });
    }
  }
  return ops;
}
```

Then fold `starOps` (`spriteManifest.ts:52`) into it as `maskOps(STAR_ROWS, STAR_ON, 7)` and delete the duplicate.

- [ ] **Step 4: Bake and re-measure the HUD**

Bake one full glyph set **per colour** into `ui.png` — `FONT_COLORS` × 38 glyphs = 228 frames, exactly as the procedural font already does (`spriteManifest.ts:112-118`). That combinatorial explosion is already proven to pack fine, and it keeps coloured text at one `drawSprite` per character with no tinting.

Ship `OFL.txt` alongside. Press Start 2P is **OFL 1.1** — free commercial use, modification and redistribution, **no attribution burden**.

Rejected alternatives: **m3x6/m5x7** (Daniel Linssen) — excellent and tiny, but the author asks for credit; only if a sub-6px face is genuinely needed. **KenPixel via FontStruct/onlinewebfonts mirrors is CC-BY-SA** — must not be used; kenney.nl's download is CC0 and is the only acceptable source.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, including all six untouched `SpriteAtlas` test files and `packAtlas.test.ts`'s glyph-coverage assertions.

- [ ] **Step 6: Commit**

```bash
git add art/fonts src/assets/spriteManifest.ts src/ui/HUD.ts public/assets/sprites/ui.*
git commit -m "feat(ui): bake Press Start 2P per colour and generalise maskOps"
```

---

### Task 5: Full gate

- [ ] **Step 1: Suite and build**

Run: `npm test && npm run build`
Expected: both green.

- [ ] **Step 2: Human visual gate**

`npm run dev`, then work the spec's §9:

1. All three stages.
2. **Parallax:** steer hard side to side. The far layer must visibly lag the plate — that lag *is* the depth cue. No seam at the wrap on either layer.
3. **Props at speed:** the research's rule, taken literally from Horizon Chase's own art direction — objects must be *"recognizable at 200 mph… more important than being realistic or detailed."* If a prop is not identifiable at full throttle, **simplify its silhouette rather than adding detail.**
4. **Effects:** trigger a skid and a gear shift. Dust and flame must read as motion, not modern particle bloom. No dithering visible on small sprites.
5. **Low-end path:** block `effects.png` in DevTools and confirm the game plays cleanly.
6. Screenshot all three stages; props, plates and cars must share one palette.

- [ ] **Step 3: Record what shipped and what was cut**

Update `active-plan.md`. If the font (Task 4) was cut, **say so explicitly in the commit message** — scaling scope down is a decision to record, not to bury.

- [ ] **Step 4: Commit**

```bash
git add active-plan.md
git commit -m "chore(plan): record Spec D completion, visual gate, and any cuts"
```

---

## Self-Review Notes

**Spec coverage:** §2 props → Task 2. §3 parallax → Task 1. §4 effects → Task 3. §5 atlas split → completed across Tasks 2–4 (`cars` from Spec C, plus `props`, `ui`, `effects`). §6 font → Task 4.

**Type consistency:** `CarFrameSet.nearestStep` (Task 2) extends Spec B's class; if props end up not sharing that class, the sparse-step lookup still belongs beside it rather than duplicated.

**Deliberate ordering:** Task 1 first despite Task 2 being the larger body of work, because parallax is the highest visual return and has no dependency on prop acquisition. Task 4 last because it is the only item whose failure mode is "the HUD no longer fits", and it is the designated cut.
