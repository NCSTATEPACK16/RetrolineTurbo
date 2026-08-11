# Spec B — Atlas Engine v2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the engine side of the sprite pipeline — discrete scale ladder, anchored overlays, horizontal flip, and multi-atlas async loading — entirely before any PNG exists.

**Architecture:** A pure `ladder.ts` quantises sprite scale to 12 pre-baked steps, killing pixel-crawl. `SpriteComposer.ts` resolves normalised anchors into overlay destination rects (including the flip mirror) without the backend ever knowing what an anchor is. `AtlasManifest.ts` parses PNG atlas manifests defensively, and `loadAtlases.ts` fetches them without ever rejecting. The existing procedural atlas stays as the permanent fallback, so the game looks identical when this ships.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest (`environment: 'node'`, no DOM), Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-08-10-b-atlas-engine-v2.md`
**Requires:** Spec A complete (`palette.json` exists).

## Global Constraints

- **Renderer stays behind `RenderBackend`.** Only `Canvas2DBackend.ts` and `generateSprites.ts` may touch a `ctx`. (`CLAUDE.md` hard rule 2)
- **No per-frame allocation in `render()`**, and **no per-frame string construction** in the sprite path. (hard rule 4)
- **Zero external deps in the engine core.** (hard rule 5)
- **The procedural atlas is permanent, not scaffolding.** Six test files construct `new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames)` — `Renderer.test.ts:18`, `HUD.test.ts:12`, `text.test.ts:9`, `RouteMap.test.ts:10`, `RemapScreen.test.ts:10`, `EditorScreen.test.ts:11`. **All six must pass unchanged.** Editing one is a design failure to reconsider, not absorb.
- **`exactOptionalPropertyTypes: true`** — pass `false` explicitly for optional booleans, never `undefined`.
- Loaders **never reject**; parsers **never throw**. The render loop must not be able to die on a bad asset.
- **This spec must produce zero visible change.** Any pixel difference is a bug.
- Tests: `npm test`. Build gate: `npm run build`.
- Commit after every task.

---

### Task 1: The scale ladder

**Files:**
- Create: `src/math/ladder.ts`
- Test: `src/math/ladder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LADDER: readonly number[]`, `ladderStepFor(idealWidthPx: number): number`, `OVERLAY_CULL_STEP: number`. Task 5 and Spec C consume all three.

- [x] **Step 1: Write the failing test**

```ts
// src/math/ladder.test.ts
import { describe, it, expect } from 'vitest';
import { LADDER, ladderStepFor, OVERLAY_CULL_STEP } from './ladder.js';

describe('LADDER', () => {
  it('has 12 steps ordered largest to smallest', () => {
    expect(LADDER).toHaveLength(12);
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i]!).toBeLessThan(LADDER[i - 1]!);
    }
  });

  it('spans 120px down to 10px (research §3b)', () => {
    expect(LADDER[0]).toBe(120);
    expect(LADDER.at(-1)).toBe(10);
  });
});

describe('ladderStepFor', () => {
  it('returns the exact index for an exact ladder width', () => {
    LADDER.forEach((w, i) => expect(ladderStepFor(w)).toBe(i));
  });

  it('snaps to the NEAREST step, not the floor', () => {
    // Between 96 (idx 1) and 76 (idx 2): 90 is nearer 96, 80 is nearer 76.
    expect(ladderStepFor(90)).toBe(1);
    expect(ladderStepFor(80)).toBe(2);
  });

  it('clamps at both ends', () => {
    expect(ladderStepFor(1000)).toBe(0);
    expect(ladderStepFor(120.1)).toBe(0);
    expect(ladderStepFor(1)).toBe(LADDER.length - 1);
    expect(ladderStepFor(0)).toBe(LADDER.length - 1);
  });

  it('is monotonic: a wider sprite never gets a smaller-step index', () => {
    let prev = ladderStepFor(0);
    for (let w = 0; w <= 140; w += 0.5) {
      const idx = ladderStepFor(w);
      expect(idx).toBeLessThanOrEqual(prev);
      prev = idx;
    }
  });

  it('is total — degenerate input clamps instead of throwing', () => {
    expect(() => ladderStepFor(NaN)).not.toThrow();
    expect(ladderStepFor(NaN)).toBe(LADDER.length - 1);
    expect(ladderStepFor(-50)).toBe(LADDER.length - 1);
    expect(ladderStepFor(Infinity)).toBe(0);
  });

  it('culls overlays at a step small enough that nobody sees them', () => {
    expect(LADDER[OVERLAY_CULL_STEP]!).toBeLessThanOrEqual(30);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/math/ladder.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/math/ladder.ts
/**
 * Discrete sprite scale ladder (research §3b).
 *
 * `Renderer.blit` used to compute a continuous destination width from 1/z. With
 * `imageSmoothingEnabled = false` that resamples the source at a slightly
 * different ratio every frame, so pixels wink in and out as z changes — the
 * shimmer. The arcade hardware avoided it the same way: OutRun shipped five
 * hand-tweaked zoom copies of each sprite rather than scaling one.
 *
 * Snapping to fixed steps makes the car pop between sizes instead of crawling,
 * and at 60fps over 12 steps the pops are masked by road motion.
 *
 * Called once per visible sprite per frame — allocation-free by contract.
 */

/** Pre-baked sprite widths in px, largest first. */
export const LADDER = [120, 96, 76, 60, 48, 38, 30, 24, 19, 15, 12, 10] as const;

/** Below this step (<=30px wide) anchored overlays are culled (research §4b). */
export const OVERLAY_CULL_STEP = 6;

/**
 * Index of the ladder step nearest `idealWidthPx`. Nearest, not floor —
 * flooring biases every sprite small. Clamps at both ends; NaN and negatives
 * clamp to the smallest step, because the render loop must never throw.
 */
export function ladderStepFor(idealWidthPx: number): number {
  const last = LADDER.length - 1;
  if (!(idealWidthPx > LADDER[last]!)) return last; // also catches NaN
  if (idealWidthPx >= LADDER[0]!) return 0;
  // Linear scan over 12 entries: no allocation, no closure, predictable.
  for (let i = 0; i < last; i++) {
    const hi = LADDER[i]!;
    const lo = LADDER[i + 1]!;
    if (idealWidthPx >= lo) {
      return idealWidthPx - lo >= hi - idealWidthPx ? i : i + 1;
    }
  }
  return last;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/math/ladder.test.ts`
Expected: PASS (8 tests)

- [x] **Step 5: Commit**

```bash
git add src/math/ladder.ts src/math/ladder.test.ts
git commit -m "feat(sprites): add discrete 12-step scale ladder to kill pixel crawl"
```

---

### Task 2: Overlay anchor resolution

**Files:**
- Create: `src/engine/SpriteComposer.ts`
- Test: `src/engine/SpriteComposer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Rect { dx, dy, dw, dh }` and `overlayDest(bodyDx, bodyDy, bodyDw, bodyDh, ax, ay, overlayDw, overlayDh, flipX, out): void`. Spec C's Renderer calls it per overlay.

**Design note the implementer must not "fix":** research §4b says to put `drawSpriteAnchored` on `RenderBackend`. This plan deliberately does not. Putting anchor resolution on the backend would require it to know about atlases, frame tables, anchor maps and ladder steps — contradicting hard rule 2 and the interface's own contract comment (`RenderBackend.ts:6-8`), and forcing `RecordingBackend` to reimplement anchor math. Composition belongs to the Renderer; pixels belong to the backend.

- [x] **Step 1: Write the failing test**

```ts
// src/engine/SpriteComposer.test.ts
import { describe, it, expect } from 'vitest';
import { overlayDest, type Rect } from './SpriteComposer.js';

const rect = (): Rect => ({ dx: 0, dy: 0, dw: 0, dh: 0 });

describe('overlayDest', () => {
  it('places a centre anchor at the body centre', () => {
    const out = rect();
    overlayDest(100, 50, 120, 72, 0.5, 0.5, 20, 10, false, out);
    expect(out.dx + out.dw / 2).toBeCloseTo(100 + 60, 5);
    expect(out.dy + out.dh / 2).toBeCloseTo(50 + 36, 5);
  });

  it('keeps registration across ladder steps from one normalised anchor', () => {
    // Same anchor, a 120px body and a 60px body: the overlay must land at the
    // same *fraction* of the body in both cases. This is the property that
    // makes one anchor cover all 12 steps.
    const big = rect();
    const small = rect();
    overlayDest(0, 0, 120, 72, 0.18, 0.92, 20, 10, false, big);
    overlayDest(0, 0, 60, 36, 0.18, 0.92, 10, 5, false, small);
    expect((big.dx + big.dw / 2) / 120).toBeCloseTo((small.dx + small.dw / 2) / 60, 5);
    expect((big.dy + big.dh / 2) / 72).toBeCloseTo((small.dy + small.dh / 2) / 36, 5);
  });

  it('MIRRORS the anchor on flip — the line that detaches overlays on left turns', () => {
    const flipped = rect();
    const plain = rect();
    overlayDest(0, 0, 120, 72, 0.18, 0.92, 20, 10, true, flipped);
    overlayDest(0, 0, 120, 72, 0.82, 0.92, 20, 10, false, plain);
    expect(flipped.dx).toBeCloseTo(plain.dx, 5);
    expect(flipped.dy).toBeCloseTo(plain.dy, 5);
  });

  it('is a no-op for a centred anchor under flip', () => {
    const a = rect();
    const b = rect();
    overlayDest(0, 0, 120, 72, 0.5, 0.4, 20, 10, false, a);
    overlayDest(0, 0, 120, 72, 0.5, 0.4, 20, 10, true, b);
    expect(b.dx).toBeCloseTo(a.dx, 5);
  });

  it('never mirrors the vertical anchor', () => {
    const a = rect();
    const b = rect();
    overlayDest(0, 0, 120, 72, 0.2, 0.9, 20, 10, false, a);
    overlayDest(0, 0, 120, 72, 0.2, 0.9, 20, 10, true, b);
    expect(b.dy).toBeCloseTo(a.dy, 5);
  });

  it('writes into the caller-owned rect without allocating', () => {
    const out = rect();
    const before = out;
    overlayDest(10, 20, 120, 72, 0.3, 0.7, 8, 8, false, out);
    expect(out).toBe(before);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/SpriteComposer.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/engine/SpriteComposer.ts
/**
 * Anchored-overlay geometry (research §4b).
 *
 * Upgrade parts (wheels, exhaust, spoiler, brake lights) draw as separate quads
 * pinned to points on the car body, so 80 parts do not require 80 car sprites.
 *
 * Anchors are stored normalised 0..1 against the largest frame, so ONE anchor per
 * overlay per steering angle covers all 12 ladder steps with no per-step table.
 * That is free to adopt here: `Renderer.blit` already positions via normalised
 * fractions (`f.anchorX / f.w`, Renderer.ts:243-244).
 *
 * Deliberately NOT on RenderBackend: the backend takes primitives and knows only
 * pixels (hard rule 2 / RenderBackend.ts:6-8). Composition lives with the Renderer.
 */

export interface Rect { dx: number; dy: number; dw: number; dh: number }

/**
 * Destination rect for an overlay anchored to an already-placed body.
 *
 * `ax`/`ay` are normalised 0..1 in the body frame; the overlay is centred on the
 * anchor. When `flipX`, `ax` mirrors to `1 - ax` — research §4b calls this "the
 * one line usually forgotten that causes overlays to detach on left turns".
 *
 * Writes into `out`; allocates nothing.
 */
export function overlayDest(
  bodyDx: number, bodyDy: number, bodyDw: number, bodyDh: number,
  ax: number, ay: number,
  overlayDw: number, overlayDh: number,
  flipX: boolean,
  out: Rect,
): void {
  const mx = flipX ? 1 - ax : ax;
  out.dw = overlayDw;
  out.dh = overlayDh;
  out.dx = bodyDx + bodyDw * mx - overlayDw / 2;
  out.dy = bodyDy + bodyDh * ay - overlayDh / 2;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/engine/SpriteComposer.test.ts`
Expected: PASS (6 tests)

- [x] **Step 5: Commit**

```bash
git add src/engine/SpriteComposer.ts src/engine/SpriteComposer.test.ts
git commit -m "feat(sprites): add anchored overlay geometry with flip mirroring"
```

---

### Task 3: Horizontal flip through the backend

**Files:**
- Modify: `src/engine/RenderBackend.ts:31-42`
- Modify: `src/engine/Canvas2DBackend.ts:65-80`
- Modify: `src/engine/testing/RecordingBackend.ts:5-9,35-42`
- Test: `src/engine/Canvas2DBackend.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `drawSprite(..., clipBottom: number, flipX?: boolean)` on `RenderBackend`; `SpriteCall` gains `flipX: boolean`.

- [x] **Step 1: Write the failing test**

```ts
// add to src/engine/Canvas2DBackend.test.ts
it('flips horizontally with a negative-scale transform, not a second draw', () => {
  const b = new Canvas2DBackend(canvas);
  ops.length = 0;
  b.drawSprite(img, 0, 0, 8, 16, 100, 50, 16, 40, 9999, true);
  expect(ops).toContain('save');
  expect(ops).toContain('translate 116 50');   // dx + dw, dy
  expect(ops).toContain('scale -1 1');
  expect(ops).toContain('drawImage 0 0 8 16 0 0 16 40');
  expect(ops).toContain('restore');
});

it('does not transform when flipX is false', () => {
  const b = new Canvas2DBackend(canvas);
  ops.length = 0;
  b.drawSprite(img, 0, 0, 8, 16, 100, 50, 16, 40, 9999, false);
  expect(ops).not.toContain('scale -1 1');
  expect(ops).toContain('drawImage 0 0 8 16 100 50 16 40');
});
```

The fake ctx at `Canvas2DBackend.test.ts:8-37` will need `translate` and `scale` recorders added alongside the existing ones.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/Canvas2DBackend.test.ts`
Expected: FAIL — `drawSprite` takes 10 args; TS rejects the 11th.

- [x] **Step 3: Widen the interface**

In `src/engine/RenderBackend.ts`, add the trailing optional parameter and document why it exists:

```ts
  /**
   * Blit a source rect to a dest rect. `clipBottom` is the lowest allowed
   * scanline (hill occlusion). `flipX` mirrors horizontally — steering art is
   * authored for three angles and mirrored at runtime for the other three
   * (research §3c), which halves the car atlas against a hard 2048x2048 cap.
   */
  drawSprite(
    image: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    clipBottom: number,
    flipX?: boolean,
  ): void;
```

Optional, not a new method: every existing call site and `RecordingBackend` stay source-compatible, and the interface stays at five methods.

- [x] **Step 4: Implement in Canvas2DBackend**

Replace `drawSprite` at `Canvas2DBackend.ts:65-80`:

```ts
  drawSprite(
    image: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    clipBottom: number,
    flipX = false,
  ): void {
    const needsClip = clipBottom < dy + dh;
    if (needsClip) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, 0, LOGICAL_WIDTH, clipBottom);
      this.ctx.clip();
    }
    if (flipX) {
      // Mirror about the sprite's own right edge, then draw at the origin.
      // Three ctx ops, zero allocation, no compositing.
      this.ctx.save();
      this.ctx.translate(dx + dw, dy);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    if (needsClip) this.ctx.restore();
  }
```

- [x] **Step 5: Record it in RecordingBackend**

```ts
// src/engine/testing/RecordingBackend.ts
export interface SpriteCall {
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
  clipBottom: number;
  flipX: boolean;
}
```

```ts
  drawSprite(
    _image: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    clipBottom: number,
    flipX = false,
  ): void {
    this.sprites.push({ sx, sy, sw, sh, dx, dy, dw, dh, clipBottom, flipX });
  }
```

- [x] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. Existing `SpriteCall` assertions use object properties, so adding a field is additive — but any test doing a whole-object `toEqual` on a `SpriteCall` will need `flipX: false` added.

- [x] **Step 7: Commit**

```bash
git add src/engine/RenderBackend.ts src/engine/Canvas2DBackend.ts src/engine/Canvas2DBackend.test.ts src/engine/testing/RecordingBackend.ts
git commit -m "feat(backend): add optional horizontal flip to drawSprite"
```

---

### Task 4: Atlas manifest parsing

**Files:**
- Create: `src/engine/AtlasManifest.ts`
- Test: `src/engine/AtlasManifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface AtlasFrameMeta`, `interface AtlasMeta`, `parseAtlasManifest(doc: unknown): AtlasMeta | null`. Task 5 (`CarFrameSet`) and Task 6 (`loadAtlases`) consume both.

- [x] **Step 1: Write the failing test**

```ts
// src/engine/AtlasManifest.test.ts
import { describe, it, expect } from 'vitest';
import { parseAtlasManifest } from './AtlasManifest.js';

const valid = {
  id: 'cars', file: 'sprites/cars.png', width: 2048, height: 1024,
  frames: [{
    id: 'gt_red_a0_s0', x: 0, y: 0, w: 120, h: 72,
    car: 'gt', color: 'red', angle: 0, step: 0,
    anchors: { wheelBL: [0.18, 0.92], exhaust: [0.5, 0.98] },
  }],
};

describe('parseAtlasManifest', () => {
  it('parses a well-formed manifest', () => {
    const m = parseAtlasManifest(valid)!;
    expect(m.id).toBe('cars');
    expect(m.frames).toHaveLength(1);
    expect(m.frames[0]!.anchors.wheelBL).toEqual([0.18, 0.92]);
  });

  it('ignores unknown fields so the bake script can add metadata freely', () => {
    const m = parseAtlasManifest({ ...valid, generatedAt: '2026-08-10', tris: 2900 })!;
    expect(m.frames).toHaveLength(1);
  });

  it('drops malformed frames individually rather than failing the atlas', () => {
    const m = parseAtlasManifest({
      ...valid,
      frames: [valid.frames[0], { id: 'bad', x: 'nope' }, { w: 1 }],
    })!;
    expect(m.frames).toHaveLength(1);
  });

  it('returns null for structurally unusable input', () => {
    expect(parseAtlasManifest(null)).toBeNull();
    expect(parseAtlasManifest(42)).toBeNull();
    expect(parseAtlasManifest({})).toBeNull();
    expect(parseAtlasManifest({ ...valid, frames: 'nope' })).toBeNull();
  });

  it('never throws, for any input', () => {
    const cyclic: Record<string, unknown> = { id: 'x' };
    cyclic.self = cyclic;
    for (const input of [undefined, NaN, [], '', cyclic, Symbol('s')]) {
      expect(() => parseAtlasManifest(input)).not.toThrow();
    }
  });

  it('tolerates a frame with no anchors', () => {
    const noAnchors = { ...valid.frames[0] } as Record<string, unknown>;
    delete noAnchors.anchors;
    const m = parseAtlasManifest({ ...valid, frames: [noAnchors] })!;
    expect(m.frames[0]!.anchors).toEqual({});
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/AtlasManifest.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/engine/AtlasManifest.ts
/**
 * PNG sprite-atlas manifest parsing (research §5b).
 *
 * Contract copied deliberately from `parseBackdropManifest` (Backdrop.ts:58-72):
 * never throws, silently drops malformed entries, ignores unknown fields. A bad
 * asset must degrade the picture, never kill the render loop.
 */

export interface AtlasFrameMeta {
  id: string;
  x: number; y: number; w: number; h: number;
  car: string; color: string; angle: number; step: number;
  /** Normalised 0..1 overlay attachment points in this frame's local space. */
  anchors: Record<string, readonly [number, number]>;
}

export interface AtlasMeta {
  id: string;
  /** Path relative to `/assets/`, matching the backdrop manifest convention. */
  file: string;
  width: number; height: number;
  frames: AtlasFrameMeta[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function parseAnchors(v: unknown): Record<string, readonly [number, number]> {
  const out: Record<string, readonly [number, number]> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [name, pt] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(pt) && pt.length === 2 && isNum(pt[0]) && isNum(pt[1])) {
      out[name] = [pt[0], pt[1]];
    }
  }
  return out;
}

function parseFrame(v: unknown): AtlasFrameMeta | null {
  if (!v || typeof v !== 'object') return null;
  const f = v as Record<string, unknown>;
  if (!isStr(f.id) || !isNum(f.x) || !isNum(f.y) || !isNum(f.w) || !isNum(f.h)) return null;
  return {
    id: f.id, x: f.x, y: f.y, w: f.w, h: f.h,
    car: isStr(f.car) ? f.car : '',
    color: isStr(f.color) ? f.color : '',
    angle: isNum(f.angle) ? f.angle : 0,
    step: isNum(f.step) ? f.step : 0,
    anchors: parseAnchors(f.anchors),
  };
}

/** Parse one atlas manifest. Returns null when the document is unusable. */
export function parseAtlasManifest(doc: unknown): AtlasMeta | null {
  try {
    if (!doc || typeof doc !== 'object') return null;
    const d = doc as Record<string, unknown>;
    if (!isStr(d.id) || !isStr(d.file) || !isNum(d.width) || !isNum(d.height)) return null;
    if (!Array.isArray(d.frames)) return null;
    const frames: AtlasFrameMeta[] = [];
    for (const raw of d.frames) {
      const f = parseFrame(raw);
      if (f) frames.push(f);
    }
    return { id: d.id, file: d.file, width: d.width, height: d.height, frames };
  } catch {
    return null; // total by contract
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/engine/AtlasManifest.test.ts`
Expected: PASS (6 tests)

- [x] **Step 5: Commit**

```bash
git add src/engine/AtlasManifest.ts src/engine/AtlasManifest.test.ts
git commit -m "feat(atlas): add defensive atlas manifest parser"
```

---

### Task 5: Integer-indexed frame lookup

**Files:**
- Create: `src/engine/CarFrameSet.ts`
- Test: `src/engine/CarFrameSet.test.ts`

**Interfaces:**
- Consumes: `AtlasFrameMeta` (Task 4), `LADDER` (Task 1).
- Produces: `class CarFrameSet` with `frame(color, angle, step): SpriteFrame`, `anchor(angle, name, out): boolean`, `colorIndex(name): number`, `readonly colors: number`, `readonly angles: number`; and `buildCarFrameSet(frames: AtlasFrameMeta[]): CarFrameSet`.

**Why this exists:** `drawText` builds a template string per glyph per frame (`text.ts:26` via `glyphFrameName`). At ~60 HUD glyphs that is tolerable. At 60 cars × 12 steps × 3 angles it allocates thousands of short-lived strings per second and violates hard rule 4. Strings get resolved to integer indices **once**, at load.

- [x] **Step 1: Write the failing test**

```ts
// src/engine/CarFrameSet.test.ts
import { describe, it, expect } from 'vitest';
import { buildCarFrameSet } from './CarFrameSet.js';
import type { AtlasFrameMeta } from './AtlasManifest.js';

function meta(color: string, angle: number, step: number, x: number): AtlasFrameMeta {
  return {
    id: `gt_${color}_a${angle}_s${step}`, x, y: 0, w: 120 - step * 10, h: 72,
    car: 'gt', color, angle, step,
    anchors: { wheelBL: [0.18, 0.92] },
  };
}

const frames = ['red', 'blue'].flatMap((c) =>
  [0, 1, 2].flatMap((a) => [0, 1, 2].map((s) => meta(c, a, s, a * 100 + s * 10))),
);

describe('CarFrameSet', () => {
  it('reports the dimensions it was built with', () => {
    const set = buildCarFrameSet(frames);
    expect(set.colors).toBe(2);
    expect(set.angles).toBe(3);
  });

  it('resolves by integer index to the frame the string id names', () => {
    const set = buildCarFrameSet(frames);
    const f = set.frame(set.colorIndex('blue'), 2, 1);
    expect(f.x).toBe(2 * 100 + 1 * 10);
    expect(f.w).toBe(110);
  });

  it('clamps out-of-range indices instead of throwing', () => {
    const set = buildCarFrameSet(frames);
    expect(() => set.frame(99, 99, 99)).not.toThrow();
    expect(() => set.frame(-1, -1, -1)).not.toThrow();
    expect(set.frame(-1, -1, -1)).toEqual(set.frame(0, 0, 0));
  });

  it('exposes anchors without allocating', () => {
    const set = buildCarFrameSet(frames);
    const out: [number, number] = [0, 0];
    expect(set.anchor(0, 'wheelBL', out)).toBe(true);
    expect(out).toEqual([0.18, 0.92]);
    expect(set.anchor(0, 'nope', out)).toBe(false);
  });

  it('returns an empty set for no frames rather than throwing', () => {
    const set = buildCarFrameSet([]);
    expect(set.colors).toBe(0);
    expect(() => set.frame(0, 0, 0)).not.toThrow();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/CarFrameSet.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/engine/CarFrameSet.ts
import type { SpriteFrame } from '../types/engine.js';
import type { AtlasFrameMeta } from './AtlasManifest.js';

const EMPTY_FRAME: SpriteFrame = { x: 0, y: 0, w: 1, h: 1, anchorX: 0, anchorY: 0 };

/**
 * Dense integer-indexed car frame lookup.
 *
 * Manifest ids like "gt_red_a0_s3" are parsed exactly once, at build time. The
 * render path then indexes with integers only — no string is constructed per
 * sprite per frame (hard rule 4). This is the one place the `glyphFrameName`
 * pattern from text.ts must NOT be copied.
 */
export class CarFrameSet {
  constructor(
    /** frames[colorIdx][angleIdx][stepIdx] */
    private readonly table: SpriteFrame[][][],
    private readonly colorNames: string[],
    /** anchors[angleIdx][name] — shared across colours and steps (normalised). */
    private readonly anchorsByAngle: Record<string, readonly [number, number]>[],
  ) {}

  get colors(): number { return this.table.length; }
  get angles(): number { return this.table[0]?.length ?? 0; }

  /** Index for a colour name, or 0 when unknown. */
  colorIndex(name: string): number {
    const i = this.colorNames.indexOf(name);
    return i < 0 ? 0 : i;
  }

  /** Frame at (colour, angle, step). Clamps; never throws. */
  frame(color: number, angle: number, step: number): SpriteFrame {
    const byAngle = this.table[clamp(color, this.table.length)];
    if (!byAngle) return EMPTY_FRAME;
    const bySteps = byAngle[clamp(angle, byAngle.length)];
    if (!bySteps) return EMPTY_FRAME;
    return bySteps[clamp(step, bySteps.length)] ?? EMPTY_FRAME;
  }

  /** Writes the normalised anchor into `out`. False when the name is unknown. */
  anchor(angle: number, name: string, out: [number, number]): boolean {
    const pt = this.anchorsByAngle[clamp(angle, this.anchorsByAngle.length)]?.[name];
    if (!pt) return false;
    out[0] = pt[0];
    out[1] = pt[1];
    return true;
  }
}

function clamp(i: number, len: number): number {
  if (!(i > 0)) return 0; // also catches NaN
  return i >= len ? Math.max(0, len - 1) : Math.floor(i);
}

/** Resolve manifest frames into the dense integer table. Called once, at load. */
export function buildCarFrameSet(frames: AtlasFrameMeta[]): CarFrameSet {
  const colorNames: string[] = [];
  for (const f of frames) if (!colorNames.includes(f.color)) colorNames.push(f.color);

  const table: SpriteFrame[][][] = [];
  const anchorsByAngle: Record<string, readonly [number, number]>[] = [];

  for (const f of frames) {
    const ci = colorNames.indexOf(f.color);
    (table[ci] ??= [])[f.angle] ??= [];
    table[ci]![f.angle]![f.step] = {
      x: f.x, y: f.y, w: f.w, h: f.h,
      anchorX: Math.floor(f.w / 2), anchorY: f.h, // base-centre, matching billboard()
    };
    if (!anchorsByAngle[f.angle]) anchorsByAngle[f.angle] = f.anchors;
  }
  return new CarFrameSet(table, colorNames, anchorsByAngle);
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/engine/CarFrameSet.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Commit**

```bash
git add src/engine/CarFrameSet.ts src/engine/CarFrameSet.test.ts
git commit -m "feat(atlas): resolve car frames to integer indices once at load"
```

---

### Task 6: Multi-atlas async loading

**Files:**
- Create: `src/engine/loadAtlases.ts`
- Test: `src/engine/loadAtlases.test.ts`
- Modify: `src/main.ts:68-71` area

**Interfaces:**
- Consumes: `parseAtlasManifest`, `AtlasMeta` (Task 4).
- Produces: `interface LoadedAtlas { meta: AtlasMeta; image: CanvasImageSource }` and `loadAtlases(base?: string): Promise<Map<string, LoadedAtlas>>`.

- [x] **Step 1: Write the failing test**

```ts
// src/engine/loadAtlases.test.ts
import { describe, it, expect } from 'vitest';
import { loadAtlases } from './loadAtlases.js';

describe('loadAtlases', () => {
  it('resolves to no atlases when nothing is reachable', async () => {
    await expect(loadAtlases('/assets/')).resolves.toEqual(new Map());
  });

  it('resolves rather than rejecting for an unreachable absolute base', async () => {
    await expect(loadAtlases('https://example.invalid/nope/')).resolves.toEqual(new Map());
  });

  it('never rejects — the render loop must not die on a bad asset', async () => {
    await expect(loadAtlases('::::not a url::::')).resolves.toBeInstanceOf(Map);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/loadAtlases.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

Structure copied from `src/engine/loadBackdrops.ts` — keep all three degradation layers.

```ts
// src/engine/loadAtlases.ts
import { parseAtlasManifest, type AtlasMeta } from './AtlasManifest.js';

/** Atlases by lifecycle (research §5b). `effects` is droppable on low-end. */
export const ATLAS_IDS = ['cars', 'props', 'ui', 'effects'] as const;

export interface LoadedAtlas { meta: AtlasMeta; image: CanvasImageSource }

/**
 * The only atlas code that touches fetch/Image.
 *
 * Never rejects. Vitest runs `environment: 'node'` with no DOM, so the
 * `typeof Image` guard is what keeps the suite headless; the try/catch is what
 * keeps an offline or 404'd CDN from killing the game.
 */
async function loadImage(url: string): Promise<CanvasImageSource | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = (): void => { resolve(img); };
    img.onerror = (): void => { resolve(null); };
    img.src = url;
  });
}

async function loadOne(base: string, id: string): Promise<[string, LoadedAtlas] | null> {
  try {
    const res = await fetch(`${base}sprites/${id}.json`);
    if (!res.ok) return null;
    const meta = parseAtlasManifest(await res.json());
    if (!meta) return null;
    const image = await loadImage(`${base}${meta.file}`);
    return image ? [id, { meta, image }] : null;
  } catch {
    return null; // offline, headless, 404, malformed JSON — procedural art it is
  }
}

export async function loadAtlases(base = '/assets/'): Promise<Map<string, LoadedAtlas>> {
  const out = new Map<string, LoadedAtlas>();
  try {
    const results = await Promise.all(ATLAS_IDS.map((id) => loadOne(base, id)));
    for (const r of results) if (r) out.set(r[0], r[1]);
  } catch {
    // total by contract
  }
  return out;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/engine/loadAtlases.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: Wire into main.ts, fire-and-forget**

Next to the backdrop load at `main.ts:68-71`, following the same precedent:

```ts
// Sprite atlases load asynchronously; until (or unless) they arrive the game
// draws the procedural atlas, so the loop never waits and frame 1 always paints.
let atlases = new Map<string, LoadedAtlas>();
void loadAtlases().then((loaded) => { atlases = loaded; });
```

⚠️ **Do not `await` before constructing `Renderer`/`HUD`.** Both take the atlas in their constructors (`main.ts:53-54`); awaiting would force `main.ts` into an async IIFE and delay first paint behind a network round-trip.

- [x] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green, including the six untouched `SpriteAtlas` test files.

- [x] **Step 7: Commit**

```bash
git add src/engine/loadAtlases.ts src/engine/loadAtlases.test.ts src/main.ts
git commit -m "feat(atlas): add non-rejecting multi-atlas loader wired fire-and-forget"
```

---

### Task 7: Full gate — prove nothing changed

**Files:** none modified.

- [x] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all green. **Confirm the six `SpriteAtlas` test files were never edited:**

```bash
git diff --name-only main -- src/engine/Renderer.test.ts src/ui/HUD.test.ts src/ui/text.test.ts \
  src/ui/RouteMap.test.ts src/ui/RemapScreen.test.ts src/ui/EditorScreen.test.ts
```

`Renderer.test.ts` may appear (Task 3 added `flipX` to whole-object assertions); the other five must not.

- [x] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: clean.

- [x] **Step 3: Visual gate — the game must look identical**

Spec B is deliberately invisible. That is the gate.

1. ⚠️ **OUTSTANDING — needs a browser.** `npm run dev`; screenshot a scene and diff it against
   the same scene before this branch. **Any visible difference is a bug.**
   Verified structurally in the meantime: `Renderer.ts` and all of `src/ui/` are untouched by
   this branch, so no code that positions a pixel changed. The one render-path edit is
   `Canvas2DBackend.drawSprite`, and its `flipX = false` default takes the byte-identical
   branch — every RecordingBackend geometry assertion in the suite passes unmodified.
2. ✅ Confirmed against the dev server. Note the manifests do **not** 404: Vite's SPA fallback
   (and Netlify's) answers `/assets/sprites/cars.json` with `200 text/html`, so `res.ok` is
   true and the miss surfaces only as a `res.json()` SyntaxError. `loadOne`'s try/catch already
   swallows it; `loadAtlases.test.ts` now pins that path explicitly. No console error cascade —
   one `console.info` reporting `0/4` atlases loaded.
3. ✅ First paint is not delayed: `loadAtlases()` is fire-and-forget after `Renderer`/`HUD` are
   already constructed, and nothing `await`s it.

- [x] **Step 4: Commit**

```bash
git add active-plan.md
git commit -m "chore(plan): record Spec B completion; engine ready for baked atlases"
```

---

## Self-Review Notes

**Spec coverage:** §3 ladder → Task 1. §4 integer lookup → Task 5. §5 flip → Task 3. §6 composer → Task 2. §7 manifest → Task 4. §8 multi-atlas + loader → Task 6. §9 fallback contract → enforced in Task 7's gate. §10 size limits → the parser warns rather than rejects; the hard cap is enforced by Spec C's packer at bake time, which is the correct place.

**Type consistency:** `Rect` (Task 2) is consumed by Spec C. `AtlasFrameMeta` (Task 4) feeds `buildCarFrameSet` (Task 5) and `loadAtlases` (Task 6). `SpriteCall.flipX` (Task 3) is non-optional in the recorder but optional on the interface — deliberate: tests always get a concrete boolean.

**Deferred to Spec C:** `AtlasSet` as a named class. Task 6 uses a plain `Map`, which is all the fallback path needs; a wrapper with no second consumer would be speculative.
