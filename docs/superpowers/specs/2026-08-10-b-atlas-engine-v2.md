# Spec B — Atlas Engine v2: Multi-Atlas, Scale Ladder, Anchored Overlays

**Date:** 2026-08-10
**Roadmap:** `plan.md` §10 Phase 7.5
**Research source:** `docs/research/2026-08-10-art-direction-asset-pipeline-research.md` §3b
(scale ladder), §4b (layering & anchors), §4c (colour variants), §5b (atlas layout).
**Predecessor:** Spec A — Art Direction Lock (`2026-08-10-a-art-direction-road-layout.md`).
**Runs when:** Spec A is code-complete (this spec consumes `palette.json`).
**Supersedes:** §4.1 of `2026-08-06-sprite-asset-pipeline-spec.md`, which assumed live scaling.

---

## 1. Goal

Build the engine side of the sprite pipeline — **entirely before any PNG exists.**

That is the load-bearing property of this spec. The procedural atlas
(`src/assets/generateSprites.ts`) already produces every frame the game currently draws, and it
stays. Spec B adds the *capability* to consume pre-baked PNG atlases with a discrete scale
ladder and anchored overlays, with the procedural atlas as the permanent fallback. Every line is
unit-testable headlessly on day one, and the game keeps rendering identically until Spec C
delivers actual pixels.

Three capabilities land here:

1. **A discrete scale ladder** replacing continuous sprite scaling — the fix for pixel-crawl.
2. **Anchored overlays** — the mechanism that lets 80 upgrade parts exist without 80 cars.
3. **Multi-atlas async loading** — cars / props / ui / effects, each with its own lifecycle.

---

## 2. The problem being fixed

`Renderer.blit` (`src/engine/Renderer.ts:238-246`) computes a continuous destination width:

```ts
const scale = scaleFor(camera.focalLength, rec.relZ);
const dw = scale * f.w * (LOGICAL_WIDTH / 2) * (roadHalfWidth / DEFAULT_CAMERA_HEIGHT);
const dh = dw * (f.h / f.w);
```

`dw` varies smoothly with `1/z`. Combined with `imageSmoothingEnabled = false`
(`Canvas2DBackend.ts:34`), every frame resamples the source at a slightly different ratio, so
individual pixels wink in and out as `z` changes — the shimmer. This is precisely what the
arcade hardware avoided: OutRun shipped five hand-tweaked zoom copies of each sprite rather than
scaling one.

**The fix:** quantise `dw` to a fixed ladder of pre-baked sizes and draw *that step's frame* at
its native size. The car pops between sizes rather than crawling; over 12 steps at 60fps the pops
are masked by road motion, and every step is a clean image.

---

## 3. The scale ladder

**New pure module: `src/math/ladder.ts`**, sitting beside `scaleFor` in `projection.ts`.

```ts
/** Pre-baked sprite widths, largest first. Research §3b. */
export const LADDER = [120, 96, 76, 60, 48, 38, 30, 24, 19, 15, 12, 10] as const;

/** Index of the ladder step nearest `idealWidthPx`. Clamps at both ends. */
export function ladderStepFor(idealWidthPx: number): number;

/** Step index below which anchored overlays are culled. Research §4b. */
export const OVERLAY_CULL_STEP = 6;
```

Requirements:

- **Zero allocation.** Called once per visible sprite per frame. A linear scan over 12 entries or
  a precomputed threshold table — never `.map`, `.find`, or `Math.min(...arr)`.
- **Nearest, not floor.** Snap to whichever step is closest; flooring biases every sprite small.
- **Monotonic and total:** any finite input returns a valid index; ≥120 → 0, ≤10 → 11, NaN →
  clamp to the smallest step rather than throwing (the render loop must never throw).

---

## 4. Frame lookup without string building — hot-path critical

`drawText` builds a template string per glyph per frame (`src/ui/text.ts:26`, via
`glyphFrameName`). At ~60 HUD glyphs that is tolerable. **It must not be copied for cars**: at 60
cars × 12 steps × 3 angles the same pattern allocates thousands of short-lived strings per second
and violates hard rule 4.

**Design: resolve strings to integer indices once at load.**

`src/engine/CarFrameSet.ts` builds, at atlas-load time, a dense lookup:

```ts
/** frames[colorIdx][angleIdx][stepIdx] — all integer indices, resolved once. */
export class CarFrameSet {
  frame(color: number, angle: number, step: number): SpriteFrame;
  anchor(angle: number, name: number, out: Vec2): void;  // writes into caller-owned out
  readonly colors: number;
  readonly angles: number;
}
```

The `"gt_red_a0_s0"` strings from the manifest are parsed exactly once, during
`buildCarFrameSet(manifest)`. Nothing in `render()` ever sees a string.

`TrafficCar.sprite` is a `string` today (`src/engine/Traffic.ts:1`) resolved per frame via
`atlas.frame(car.sprite)` (`Renderer.ts:232`). It gains an integer variant index alongside; the
string field stays for the procedural fallback path and for track-file compatibility.

---

## 5. Horizontal flip — the RenderBackend decision

Research §3c ships **3 authored steering angles (0°, 15°, 30°) plus a runtime horizontal flip**
for the mirrored three. `RenderBackend` has no flip today — five methods, primitive args, no
tint, no alpha, no rotation (`src/engine/RenderBackend.ts:10-56`).

**Decision: add an optional trailing `flipX?: boolean` to `drawSprite`.**

```ts
drawSprite(
  image: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw: number, dh: number,
  clipBottom: number,
  flipX?: boolean,
): void;
```

`Canvas2DBackend` implements it with `save() / translate(dx + dw, dy) / scale(-1, 1) /
drawImage(…, 0, 0, …) / restore()` — three extra ctx ops, zero allocation, no compositing.

**Why not the alternative.** Baking both mirrors into the atlas doubles car-atlas area against a
hard 2048×2048 cap (§7), and the research explicitly offers either route. Runtime flip is the
cheaper one here.

**Why an optional param and not a new method.** Optional keeps all ~10 existing call sites and
`RecordingBackend` source-compatible, and keeps the interface at five methods. `RecordingBackend`
records `flipX` in `SpriteCall` so tests can assert it.

⚠️ `exactOptionalPropertyTypes: true` is set in `tsconfig.json`. Pass `false` explicitly rather
than `undefined` where the value is computed.

---

## 6. Anchored overlays — a deliberate deviation from the research

Research §4b says: *"expose `drawSpriteAnchored(bodyId, overlayId, angle, step, x, y)` on the
RenderBackend."*

**This spec does not do that, and the implementer should not "correct" it back.**

Putting anchor resolution on `RenderBackend` would require the backend to know about atlases,
frame tables, anchor maps, and ladder steps. That contradicts hard rule 2 (`CLAUDE.md:33`) and
the interface's own contract comment (`RenderBackend.ts:6-8`): the backend takes primitives and
knows only pixels. It would also mean `RecordingBackend` has to reimplement anchor math to stay
useful in tests.

**Instead: `src/engine/SpriteComposer.ts`** — a pure-math module that computes the overlay
destination rect and hands primitives to `backend.drawSprite`. The backend stays dumb; the
composer is unit-testable with no backend at all.

```ts
export interface Rect { dx: number; dy: number; dw: number; dh: number }

/**
 * Destination rect for an overlay anchored to a drawn body.
 * `ax`/`ay` are normalised 0..1 in the body frame. When `flipX`, `ax` mirrors to `1 - ax`.
 * Writes into `out` — no allocation.
 */
export function overlayDest(
  bodyDx: number, bodyDy: number, bodyDw: number, bodyDh: number,
  ax: number, ay: number,
  overlayDw: number, overlayDh: number,
  flipX: boolean,
  out: Rect,
): void;
```

**The mirror line is the whole point.** Research §4b calls `x → 1 − x` *"the one line usually
forgotten that causes overlays to detach on left turns."* It lives here, in one place, with a
dedicated test.

Anchors are stored **normalised 0..1 against the largest frame**, so one anchor per overlay per
angle covers all 12 steps with no per-step table. This costs nothing to adopt: `Renderer.blit`
already positions via normalised fractions (`f.anchorX / f.w`, `Renderer.ts:243-244`).

**Overlay culling:** below `OVERLAY_CULL_STEP` (≤30px wide) overlays are skipped entirely.
Research §4b's budget: player ~10 quads, near traffic 3, distant 1 → ~85 quads for all cars,
inside the 150 soft budget.

---

## 7. Manifest schema and parsing

**New: `src/engine/AtlasManifest.ts`** — modelled directly on `parseBackdropManifest`
(`src/engine/Backdrop.ts:58-72`). The contract, copied deliberately:

- **Never throws.** A non-object, a missing `frames`, or a non-array all yield `[]`.
- **Silently drops** malformed entries via a hand-rolled structural guard.
- **Ignores unknown fields**, so the bake script can add metadata without breaking the loader.

Schema (research §5b), extending the shape of `public/assets/backgrounds/manifest.json`:

```json
{
  "id": "cars", "file": "sprites/cars.png", "width": 2048, "height": 1024,
  "frames": [
    { "id": "gt_red_a0_s0", "x": 0, "y": 0, "w": 120, "h": 72,
      "car": "gt", "color": "red", "angle": 0, "step": 0,
      "anchors": { "wheelBL": [0.18, 0.92], "wheelBR": [0.82, 0.92],
                   "exhaust": [0.50, 0.98], "spoiler": [0.50, 0.10] } }
  ]
}
```

`file` is relative to `/assets/`, matching the backdrop manifest convention that
`loadBackdrops.ts:35` relies on.

---

## 8. Multi-atlas and async loading

Four atlases by lifecycle, per research §5b: `cars`, `props`, `ui`, `effects`. UI stays resident;
effects are droppable on low-end; each loads in parallel and stays well under mobile texture caps.

**`RenderBackend` needs no change for this.** `drawSprite` already takes `image` per call
(`RenderBackend.ts:31`), so a second atlas is just a different first argument.

**New: `src/engine/loadAtlases.ts`** — copy `loadBackdrops.ts` structurally, all three
degradation layers intact:

1. `if (typeof Image === 'undefined') return null` — Vitest runs `environment: 'node'`
   (`vite.config.ts`); there is no DOM at all.
2. `fetch(...)` in try/catch; non-`res.ok` **and** any throw both return the empty result.
3. Per-atlas `Promise.all`; one atlas failing does not fail the others.

**It must never reject.** `loadAtlases.test.ts` asserts that in node, mirroring
`loadBackdrops.test.ts`.

**Wiring in `main.ts`:** fire-and-forget into a mutable reference, per the backdrop precedent at
`main.ts:68-71`:

```ts
// Procedural art draws until (or unless) the PNG atlases arrive.
let atlases = new Map<string, LoadedAtlas>();
void loadAtlases().then((loaded) => { atlases = loaded; });
```

A plain `Map` keyed by atlas id is sufficient — do **not** build an `AtlasSet` wrapper class
here. It would have exactly one consumer and no behaviour of its own. Introduce one only if
Spec C or D finds a second reason for it to exist.

**Do not** `await` before constructing `Renderer`/`HUD`. Both take the atlas in their
constructors (`main.ts:53-54`); awaiting would force `main.ts` into an async IIFE and delay first
paint behind a network round-trip. The game must render on frame 1 with procedural art and
upgrade in place.

---

## 9. The fallback is permanent

`generateSprites.ts` / `packAtlas.ts` are **not scaffolding to be deleted in Spec C.** They are:

- the **headless Vitest path** — six test files construct
  `new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames)`
  (`Renderer.test.ts:18`, `HUD.test.ts:12`, `text.test.ts:9`, `RouteMap.test.ts:10`,
  `RemapScreen.test.ts:10`, `EditorScreen.test.ts:11`). **All six must still pass unchanged.**
- the **offline / CDN-failure path**;
- the **boot-before-load path** for frame 1.

The pure-packer vs ctx-rasteriser split (`packAtlas.ts` pure, `generateSprites.ts` touching a
ctx) is what makes this work, and Spec B must preserve it exactly.

---

## 10. Atlas size limits

From research §5b, with the citation quality noted:

- **iOS Safari hard cap 4096×4096** (MDN) — exceeding it renders the canvas unusable, silently.
- Chrome 32,767–65,535 per dimension; Firefox ~32,767. Area caps circulating for both are from
  secondary sources and should not be relied on.
- iOS Safari also has a **total canvas memory budget** (~384MB), so many resident canvases can
  fail even when each is small — release offscreen build canvases after baking.

**Rule: every shipped atlas ≤2048×2048, power-of-two, released after bake.** Safe on every
current mobile Safari and Chrome. Spec C's packer enforces it at bake time; Spec B's parser
**warns but does not reject** an oversize manifest — failing closed at runtime would black out
the game over a bad build artifact.

---

## 11. Files

**New:** `src/math/ladder.ts` (+test), `src/engine/AtlasManifest.ts` (+test),
`src/engine/SpriteComposer.ts` (+test), `src/engine/CarFrameSet.ts` (+test),
`src/engine/loadAtlases.ts` (+test).

**Modified:** `src/engine/RenderBackend.ts` (`flipX?`), `src/engine/Canvas2DBackend.ts` (+test),
`src/engine/testing/RecordingBackend.ts` (record `flipX`), `src/engine/SpriteAtlas.ts`
(multi-atlas aware), `src/main.ts` (fire-and-forget load), `src/engine/Traffic.ts` (integer
variant index).

**Not modified:** `packAtlas.ts`, `generateSprites.ts`, `spriteManifest.ts` — the fallback path
is untouched by design.

---

## 12. Testing — Vitest

- **Ladder:** nearest-not-floor at midpoints; clamps at both ends; monotonic non-increasing index
  as width grows; total over NaN/Infinity/negative; allocation-free (call in a loop, assert no
  throw and stable results).
- **Manifest:** valid doc parses; missing/extra fields tolerated; malformed frames dropped
  individually; non-object / missing `frames` / non-array all yield `[]`; **never throws** for any
  input including cyclic objects.
- **`overlayDest` — the highest-value tests in this spec:** anchor at (0.5, 0.5) lands at body
  centre; anchors scale correctly across two different ladder steps (same normalised anchor,
  proportional result); **`flipX` mirrors `ax` to `1 − ax`** and an anchor at 0.18 flipped lands
  where 0.82 unflipped does; `flipX` at `ax = 0.5` is a no-op.
- **`CarFrameSet`:** integer lookup returns the frame the string id would have; out-of-range
  indices clamp rather than throw; **no string is constructed after build** (assert by building a
  set with a Proxy-trapped or frozen frame table, or by asserting the resolved structure directly).
- **Flip in backends:** `Canvas2DBackend` emits `save/translate/scale/drawImage/restore` in order
  when `flipX` is true and plain `drawImage` when false — asserted on the op-string log, matching
  the existing style at `Canvas2DBackend.test.ts:73-81`. `RecordingBackend` surfaces `flipX`.
- **Loader:** resolves to an empty result in node for both a relative and an unreachable absolute
  base; never rejects — mirrors `loadBackdrops.test.ts`.
- **Regression:** all six existing `new SpriteAtlas({} as CanvasImageSource, …)` test files pass
  **unchanged**. Treat any edit to them as a design failure to be reconsidered, not absorbed.

---

## 13. Visual gate

Spec B is deliberately invisible — with no PNG present, the game must look **identical** to
before. That is the gate:

1. `npm run dev`, screenshot, and diff against a pre-Spec-B screenshot of the same scene. Any
   visible difference is a bug.
2. Confirm in DevTools that a missing `/assets/sprites/cars.json` produces a caught, logged
   failure and no console error cascade — the offline path.
3. Confirm first paint is not delayed: the game renders before any sprite fetch resolves.

---

## 14. Done-when

- `ladderStepFor` snaps to the **nearest of 12 fixed steps**, allocation-free, total over all
  finite input.
- `overlayDest` resolves normalised anchors across every ladder step and **mirrors `ax → 1 − ax`
  on flip**, with a dedicated test for the mirror.
- Frame lookup in the render path uses **integer indices only** — no string is constructed per
  frame per sprite.
- `RenderBackend.drawSprite` accepts `flipX`; `Canvas2DBackend` implements it with **no
  allocation and no compositing**; `RecordingBackend` records it.
- Atlas manifests parse defensively and **never throw**; loading **never rejects**; a missing
  atlas leaves the game fully playable on procedural art.
- **All six existing `SpriteAtlas` test files pass unchanged.**
- `npm test` and `npm run build` green; hard rules 1–5 held.
- **VISUAL GATE: the game looks identical to before this spec.**

---

## 15. Caveats

- **The 12 ladder sizes are inference**, not measured (research §3b). If between-step pops are
  visible at low speed, research §3b's own remedy is to add steps 13–16 *at the large end* — which
  is cheap, since the geometric tail is where the area is small. **Do not fall back to live
  interpolation**; that reintroduces the exact defect this spec exists to fix.
- **`OVERLAY_CULL_STEP = 6` (≤30px) is an estimate.** Tune against the quad budget once Spec C
  gives real overlays to count.
- **Flip reads as a true mirror only for symmetric liveries** (research §3c). Bodies pre-rendered
  from symmetric 3D models are fine; asymmetric decals would need authored mirror art. Flagged
  because it silently constrains future livery design.
- The **2048×2048 cap is conservative by choice.** iOS 18+ raised the ceiling to 8192, but 4096 is
  the floor for older iOS and 2048 is safe everywhere.
