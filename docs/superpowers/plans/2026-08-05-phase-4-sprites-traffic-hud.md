# Phase 4 — Sprites, Traffic, Collisions, HUD; Lock the Look — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add depth-sorted roadside sprites, moving AI traffic, collision detection + response, and a live HUD to the existing pseudo-3D road renderer, all fed by a `PlayerState` seam, and lock the retro look at 480×270 with a code-generated pixel-art atlas.

**Architecture:** A `PlayerState` read-interface decouples every new consumer (collision, HUD, sprite render) from today's throwaway camera harness; Phase 5's real `Vehicle` will implement the same interface unchanged. Sprite art is produced by an edge-side code generator (`src/assets/`) into one atlas bitmap + a pure frame table; the engine only consumes frames. The `Renderer` gains a pre-allocated projection-record array (allocated once in the constructor) so a second far→near pass can draw sprites/traffic with correct painter ordering and hill-crest bottom-clipping without any per-frame allocation. Collision is pure geometry run inside the deterministic fixed-step update; the HUD is pure render reading `PlayerState`.

**Tech Stack:** TypeScript (strict), Vite, Vitest (node environment, zero deps). Canvas 2D behind `RenderBackend`.

## Global Constraints

- **Segment model only** — no WebGL/Three.js/real 3D. (`CLAUDE.md` hard rule 1)
- **Renderer stays behind `RenderBackend`** — game/engine code never touches a `ctx`. The *only* files allowed to use a canvas `ctx` are `src/engine/Canvas2DBackend.ts` and, as an edge asset-production concern, `src/assets/generateSprites.ts`. (hard rule 2)
- **Physics is deterministic & fixed-timestep** (1/60s), decoupled from render, unit-tested. Phase 4's harness kinematics are throwaway and are NOT unit-tested as physics; collision detection + traffic advance ARE pure and unit-tested. (hard rule 3)
- **No per-frame allocation in `render()`** — pre-allocate arrays/scratch; backend methods take primitive args only. (hard rule 4)
- **Zero external deps in the engine core** — native browser APIs only. (hard rule 5)
- **Test environment is Vitest `node`** — no jsdom, no `document` in tests. Anything needing a canvas `ctx` must be split so its pure data is testable in node (see Task 2). Pattern precedent: `Canvas2DBackend.test.ts` uses `vi.stubGlobal`.
- **Fixed logical framebuffer** `LOGICAL_WIDTH=480`, `LOGICAL_HEIGHT=270`, integer nearest-neighbour upscale (already implemented in `Canvas2DBackend`).
- Tests assert **relationships** (near wider than far, monotonic ordering, occlusion cuts counts), never absolute pixels — provisional constants stay retunable at the visual gate. (Phase 2/3 convention)
- Run `npm test` (all) and `npm run build` (`tsc --noEmit` strict + Vite) green before every commit that closes a task.

**Spec:** `docs/superpowers/specs/2026-08-05-phase-4-sprites-traffic-hud-design.md`

---

## File Structure

**Create:**
- `src/assets/spriteManifest.ts` — pure data: sprite names, pixel sizes, anchors, draw-op lists. No canvas.
- `src/assets/packAtlas.ts` — pure shelf-packer: manifest → `FrameTable` + atlas dimensions.
- `src/assets/generateSprites.ts` — edge generator: manifest + frame table → drawn atlas canvas (uses `ctx`).
- `src/engine/SpriteAtlas.ts` — holds atlas image + frame table; pure `frame(name)` lookup.
- `src/engine/Traffic.ts` — `TrafficCar` pool; deterministic advance + wrap.
- `src/engine/Collision.ts` — pure detection + response-delta functions.
- `src/ui/HUD.ts` — renders speedo/gear/timer/mini-map from `PlayerState`.
- Test files mirroring each of the above under the same directory.

**Modify:**
- `src/types/engine.ts` — add `PlayerState`, `SpriteFrame`, `FrameTable`; flesh out `Sprite`; add `sprites` to `Segment`.
- `src/engine/RecordingBackend.ts` — record `drawSprite` calls.
- `src/engine/Canvas2DBackend.ts` — implement `drawSprite` with `clipBottom`.
- `src/engine/TrackManager.ts` — attach sprites to segments in `build()`.
- `src/engine/Renderer.ts` — pre-allocated projection records + far→near sprite/traffic pass + player car; new constructor deps.
- `src/main.ts` — harness implements `PlayerState`; wire traffic + collision (update) + HUD (render).

---

## Task 1: `PlayerState` seam + engine type extensions

**Files:**
- Modify: `src/types/engine.ts`
- Test: `src/types/engine.test.ts` (create)

**Interfaces:**
- Produces: `PlayerState { readonly z, x, speed, gear: number }`; `SpriteFrame { x, y, w, h, anchorX, anchorY: number }`; `FrameTable = Record<string, SpriteFrame>`; `Sprite { name: string; offset: number }` (offset in road-half-width units, ±1 = road edge); `Segment` gains `sprites: Sprite[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/types/engine.test.ts
import { describe, it, expect } from 'vitest';
import type { PlayerState, Segment, Sprite, SpriteFrame } from './engine.js';

describe('engine domain types', () => {
  it('PlayerState is satisfiable by a plain readonly object', () => {
    const p: PlayerState = { z: 0, x: 0, speed: 0, gear: 1 };
    expect(p.gear).toBe(1);
  });

  it('Segment carries a sprite list keyed by atlas frame name', () => {
    const s: Sprite = { name: 'tree', offset: 1.4 };
    const seg: Segment = { index: 0, z: 0, curve: 0, pitch: 0, sprites: [s] };
    expect(seg.sprites[0]!.name).toBe('tree');
  });

  it('SpriteFrame carries an anchor for base-aligned billboards', () => {
    const f: SpriteFrame = { x: 0, y: 0, w: 8, h: 16, anchorX: 4, anchorY: 16 };
    expect(f.anchorY).toBe(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/engine.test.ts`
Expected: FAIL — `PlayerState`, `SpriteFrame` not exported; `Segment` has no `sprites`.

- [ ] **Step 3: Edit `src/types/engine.ts`**

Add these exports; replace the placeholder `Sprite`; add `sprites` to `Segment`:

```ts
/** Read-only view of the player used by collision, HUD, and sprite render.
 * Phase 4: implemented by the throwaway harness. Phase 5: implemented by Vehicle. */
export interface PlayerState {
  readonly z: number;      // world depth along the track
  readonly x: number;      // world lateral position (track-centre-relative)
  readonly speed: number;  // world units / second (HUD converts to km/h)
  readonly gear: number;   // current gear index (Phase 4: stubbed at 1)
}

/** A packed sprite region in the atlas. `anchor` is the sprite-local pixel that
 * lands on the projected road point (base-centre for a billboard). */
export interface SpriteFrame {
  x: number; y: number; w: number; h: number; anchorX: number; anchorY: number;
}
export type FrameTable = Record<string, SpriteFrame>;
```

Replace the existing `Sprite` interface with:

```ts
/** A billboard placed on a segment. `offset` is in road-half-width units:
 * ±1 sits on the road edge, >1 is off-road scenery. `name` indexes the atlas. */
export interface Sprite {
  name: string;
  offset: number;
}
```

Add `sprites` to `Segment` (keep existing fields):

```ts
export interface Segment {
  index: number;
  z: number;
  curve: number;
  pitch: number;
  sprites: Sprite[]; // billboards attached to this segment (may be empty)
}
```

- [ ] **Step 4: Fix the one existing construction site**

`src/engine/TrackManager.ts` `build()` pushes `{ index, z, curve, pitch }`. Add `sprites: []` to that literal so it satisfies the new `Segment` (Task 6 fills it):

```ts
segments.push({ index: segments.length, z: segments.length * this.config.segmentLength, curve, pitch, sprites: [] });
```

- [ ] **Step 5: Run tests to verify pass + build**

Run: `npx vitest run src/types/engine.test.ts && npm run build`
Expected: PASS; `tsc --noEmit` clean (no other site constructs a `Segment`).

- [ ] **Step 6: Commit**

```bash
git add src/types/engine.ts src/types/engine.test.ts src/engine/TrackManager.ts
git commit -m "feat(types): add PlayerState seam, SpriteFrame/FrameTable, sprite-carrying Segment"
```

---

## Task 2: Pure atlas frame table (shelf packer)

**Files:**
- Create: `src/assets/spriteManifest.ts`, `src/assets/packAtlas.ts`
- Test: `src/assets/packAtlas.test.ts`

**Interfaces:**
- Consumes: `SpriteFrame`, `FrameTable` (Task 1).
- Produces: `SPRITE_MANIFEST: SpriteEntry[]` where `SpriteEntry { name: string; w: number; h: number; anchorX: number; anchorY: number; ops: DrawOp[] }`; `DrawOp { rx: number; ry: number; rw: number; rh: number; color: string }` (a filled pixel rectangle in sprite-local coords); `packAtlas(entries, atlasWidth): { frames: FrameTable; width: number; height: number }`.

The manifest is pure data so the frame table is testable in node without a canvas. The generator (Task 3) draws the `ops`.

- [ ] **Step 1: Write the failing test**

```ts
// src/assets/packAtlas.test.ts
import { describe, it, expect } from 'vitest';
import { packAtlas } from './packAtlas.js';
import { SPRITE_MANIFEST } from './spriteManifest.js';

describe('packAtlas', () => {
  it('produces a frame for every manifest entry', () => {
    const { frames } = packAtlas(SPRITE_MANIFEST, 256);
    for (const e of SPRITE_MANIFEST) expect(frames[e.name]).toBeDefined();
  });

  it('never places two frames overlapping', () => {
    const { frames } = packAtlas(SPRITE_MANIFEST, 256);
    const rects = Object.values(frames);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!, b = rects[j]!;
        const disjoint = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(disjoint).toBe(true);
      }
  });

  it('carries anchors through from the manifest', () => {
    const { frames } = packAtlas(SPRITE_MANIFEST, 256);
    const tree = SPRITE_MANIFEST.find((e) => e.name === 'tree')!;
    expect(frames['tree']!.anchorX).toBe(tree.anchorX);
    expect(frames['tree']!.anchorY).toBe(tree.anchorY);
  });

  it('includes the full look-lock set (scenery, 4 cars, player, digits)', () => {
    const names = SPRITE_MANIFEST.map((e) => e.name);
    for (const n of ['tree', 'bush', 'rock', 'sign', 'billboard',
                     'car0', 'car1', 'car2', 'car3', 'player',
                     'digit_0', 'digit_9', 'glyph_colon'])
      expect(names).toContain(n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/assets/packAtlas.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/assets/spriteManifest.ts`**

Each entry lists pixel-primitive `ops`. Keep art compact; the 480×270 nearest-neighbour scale makes chunky reads intentional. Draw ops are in sprite-local pixels, top-left origin. Anchor is base-centre for billboards (`anchorX=w/2, anchorY=h`), centre for HUD glyphs.

```ts
import type { SpriteFrame } from '../types/engine.js';

export interface DrawOp { rx: number; ry: number; rw: number; rh: number; color: string; }
export interface SpriteEntry {
  name: string; w: number; h: number; anchorX: number; anchorY: number; ops: DrawOp[];
}

const billboard = (name: string, w: number, h: number, ops: DrawOp[]): SpriteEntry =>
  ({ name, w, h, anchorX: Math.floor(w / 2), anchorY: h, ops });

// Compact pixel-art. Palette is provisional; retuned at the visual gate.
export const SPRITE_MANIFEST: SpriteEntry[] = [
  billboard('tree', 16, 40, [
    { rx: 7, ry: 24, rw: 2, rh: 16, color: '#5a3a1a' },        // trunk
    { rx: 2, ry: 4, rw: 12, rh: 22, color: '#1e7a34' },        // canopy
    { rx: 4, ry: 0, rw: 8, rh: 8, color: '#2a9a44' },          // highlight
  ]),
  billboard('bush', 14, 12, [
    { rx: 0, ry: 4, rw: 14, rh: 8, color: '#1e7a34' },
    { rx: 3, ry: 0, rw: 8, rh: 6, color: '#2a9a44' },
  ]),
  billboard('rock', 12, 10, [
    { rx: 0, ry: 3, rw: 12, rh: 7, color: '#7a7a82' },
    { rx: 2, ry: 0, rw: 7, rh: 5, color: '#9a9aa2' },
  ]),
  billboard('sign', 14, 22, [
    { rx: 6, ry: 8, rw: 2, rh: 14, color: '#5a3a1a' },         // post
    { rx: 0, ry: 0, rw: 14, rh: 9, color: '#d0d0d8' },         // board
    { rx: 2, ry: 2, rw: 10, rh: 5, color: '#c04040' },         // legend
  ]),
  billboard('billboard', 28, 24, [
    { rx: 2, ry: 14, rw: 2, rh: 10, color: '#3a3a42' },
    { rx: 24, ry: 14, rw: 2, rh: 10, color: '#3a3a42' },
    { rx: 0, ry: 0, rw: 28, rh: 14, color: '#204a8a' },
    { rx: 3, ry: 3, rw: 22, rh: 8, color: '#f0c040' },
  ]),
  // Traffic cars — rear-view billboards, four liveries.
  ...(['#c83028', '#2860c8', '#28a848', '#d0a020'] as const).map((body, i) =>
    billboard(`car${i}`, 22, 14, [
      { rx: 1, ry: 6, rw: 20, rh: 7, color: '#101014' },       // shadow/underbody
      { rx: 2, ry: 2, rw: 18, rh: 6, color: body },            // body
      { rx: 5, ry: 3, rw: 12, rh: 3, color: '#101830' },       // window
      { rx: 1, ry: 11, rw: 4, rh: 3, color: '#202024' },       // wheels
      { rx: 17, ry: 11, rw: 4, rh: 3, color: '#202024' },
    ])),
  billboard('player', 34, 20, [
    { rx: 2, ry: 9, rw: 30, rh: 10, color: '#101014' },
    { rx: 3, ry: 3, rw: 28, rh: 8, color: '#e03028' },
    { rx: 9, ry: 4, rw: 16, rh: 4, color: '#101830' },
    { rx: 1, ry: 15, rw: 6, rh: 5, color: '#202024' },
    { rx: 27, ry: 15, rw: 6, rh: 5, color: '#202024' },
  ]),
  // HUD bitmap font: digits 0–9 as 3×5 pixel glyphs, plus a colon.
  ...digitEntries(),
  { name: 'glyph_colon', w: 3, h: 5, anchorX: 1, anchorY: 2,
    ops: [{ rx: 1, ry: 1, rw: 1, rh: 1, color: '#e8e8f0' }, { rx: 1, ry: 3, rw: 1, rh: 1, color: '#e8e8f0' }] },
];

// 3×5 digit fonts as row bitmasks (bit 2..0 = left..right pixel per row).
const DIGIT_ROWS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111], '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111], '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001], '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111], '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111], '9': [0b111, 0b101, 0b111, 0b001, 0b111],
};
function digitEntries(): SpriteEntry[] {
  return Object.entries(DIGIT_ROWS).map(([d, rows]) => {
    const ops: DrawOp[] = [];
    rows.forEach((mask, ry) => {
      for (let c = 0; c < 3; c++) if (mask & (0b100 >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: '#e8e8f0' });
    });
    return { name: `digit_${d}`, w: 3, h: 5, anchorX: 1, anchorY: 2, ops };
  });
}

export type { SpriteFrame };
```

- [ ] **Step 4: Write `src/assets/packAtlas.ts`**

```ts
import type { FrameTable } from '../types/engine.js';
import type { SpriteEntry } from './spriteManifest.js';

/** Deterministic shelf packer: rows of frames, wrapping at `atlasWidth`, 1px gutter. */
export function packAtlas(entries: SpriteEntry[], atlasWidth: number): { frames: FrameTable; width: number; height: number } {
  const frames: FrameTable = {};
  const gutter = 1;
  let x = gutter, y = gutter, rowH = 0;
  for (const e of entries) {
    if (x + e.w + gutter > atlasWidth) { x = gutter; y += rowH + gutter; rowH = 0; }
    frames[e.name] = { x, y, w: e.w, h: e.h, anchorX: e.anchorX, anchorY: e.anchorY };
    x += e.w + gutter;
    rowH = Math.max(rowH, e.h);
  }
  return { frames, width: atlasWidth, height: y + rowH + gutter };
}
```

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run src/assets/packAtlas.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/assets/spriteManifest.ts src/assets/packAtlas.ts src/assets/packAtlas.test.ts
git commit -m "feat(assets): pure sprite manifest + shelf packer for the code-generated atlas"
```

---

## Task 3: Atlas generator + `SpriteAtlas`

**Files:**
- Create: `src/assets/generateSprites.ts`, `src/engine/SpriteAtlas.ts`
- Test: `src/engine/SpriteAtlas.test.ts`

**Interfaces:**
- Consumes: `SPRITE_MANIFEST`, `packAtlas` (Task 2); `SpriteFrame`, `FrameTable` (Task 1).
- Produces: `generateAtlas(atlasWidth?: number): { image: HTMLCanvasElement; frames: FrameTable }` (edge, uses `ctx`); `class SpriteAtlas { constructor(image: CanvasImageSource, frames: FrameTable); readonly image: CanvasImageSource; frame(name: string): SpriteFrame }`.

`generateAtlas` needs a canvas, so it is NOT unit-tested in node. `SpriteAtlas` is pure (holds refs, looks up frames) and IS tested with a stub image + a hand-built frame table.

- [ ] **Step 1: Write the failing test (SpriteAtlas only)**

```ts
// src/engine/SpriteAtlas.test.ts
import { describe, it, expect } from 'vitest';
import { SpriteAtlas } from './SpriteAtlas.js';
import type { FrameTable } from '../types/engine.js';

const frames: FrameTable = { tree: { x: 1, y: 1, w: 16, h: 40, anchorX: 8, anchorY: 40 } };
const stubImage = {} as CanvasImageSource;

describe('SpriteAtlas', () => {
  it('returns the frame for a known name', () => {
    const atlas = new SpriteAtlas(stubImage, frames);
    expect(atlas.frame('tree').w).toBe(16);
  });
  it('throws a clear error for an unknown frame name', () => {
    const atlas = new SpriteAtlas(stubImage, frames);
    expect(() => atlas.frame('nope')).toThrow(/unknown sprite frame: nope/);
  });
  it('exposes the backing image for the backend to blit', () => {
    const atlas = new SpriteAtlas(stubImage, frames);
    expect(atlas.image).toBe(stubImage);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/SpriteAtlas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/engine/SpriteAtlas.ts`**

```ts
import type { FrameTable, SpriteFrame } from '../types/engine.js';

/** Holds a generated atlas image and its frame table. Pure lookups only —
 * no drawing, no ctx. The image is opaque to the engine (blitted by the backend). */
export class SpriteAtlas {
  constructor(readonly image: CanvasImageSource, private readonly frames: FrameTable) {}

  frame(name: string): SpriteFrame {
    const f = this.frames[name];
    if (!f) throw new Error(`SpriteAtlas: unknown sprite frame: ${name}`);
    return f;
  }
}
```

- [ ] **Step 4: Write `src/assets/generateSprites.ts` (edge, not unit-tested)**

```ts
import { SPRITE_MANIFEST } from './spriteManifest.js';
import { packAtlas } from './packAtlas.js';
import type { FrameTable } from '../types/engine.js';

/** Draw the whole manifest into one offscreen canvas. Edge asset production —
 * the only place besides Canvas2DBackend allowed to touch a ctx. Deterministic:
 * same manifest ⇒ same pixels. Called once at boot; result handed to SpriteAtlas. */
export function generateAtlas(atlasWidth = 256): { image: HTMLCanvasElement; frames: FrameTable } {
  const { frames, width, height } = packAtlas(SPRITE_MANIFEST, atlasWidth);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('generateAtlas: 2D context unavailable');
  ctx.imageSmoothingEnabled = false;
  for (const e of SPRITE_MANIFEST) {
    const f = frames[e.name]!;
    for (const op of e.ops) {
      ctx.fillStyle = op.color;
      ctx.fillRect(f.x + op.rx, f.y + op.ry, op.rw, op.rh);
    }
  }
  return { image: canvas, frames };
}
```

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run src/engine/SpriteAtlas.test.ts && npm run build`
Expected: PASS; build clean (generator compiles; `document` is a browser global, fine for `tsc`/Vite).

- [ ] **Step 6: Commit**

```bash
git add src/assets/generateSprites.ts src/engine/SpriteAtlas.ts src/engine/SpriteAtlas.test.ts
git commit -m "feat(assets): atlas generator (edge) + pure SpriteAtlas lookup"
```

---

## Task 4: Record `drawSprite` in the test backend + implement it in Canvas2D

**Files:**
- Modify: `src/engine/RecordingBackend.ts`, `src/engine/Canvas2DBackend.ts`
- Test: `src/engine/RecordingBackend.test.ts` (extend), `src/engine/Canvas2DBackend.test.ts` (extend)

**Interfaces:**
- Produces: `RecordingBackend.sprites: SpriteCall[]` where `SpriteCall { dx, dy, dw, dh, clipBottom: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/RecordingBackend.test.ts — add
it('records drawSprite calls with geometry and clip', () => {
  const b = new RecordingBackend();
  const img = {} as CanvasImageSource;
  b.drawSprite(img, 10, 20, 8, 16, 200);
  expect(b.sprites).toEqual([{ dx: 10, dy: 20, dw: 8, dh: 16, clipBottom: 200 }]);
});
```

```ts
// src/engine/Canvas2DBackend.test.ts — add (follows the existing vi.stubGlobal pattern in this file)
it('drawSprite blits the source rect and honours clipBottom via a clip region', () => {
  // Reuse this file's existing canvas/ctx stub setup. Assert drawImage is called
  // once and that clip/save/restore bracket it when clipBottom < dy+dh.
  // (Mirror the assertion style already used for drawQuad in this file.)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/RecordingBackend.test.ts src/engine/Canvas2DBackend.test.ts`
Expected: FAIL — `sprites` undefined; `drawImage` never called.

- [ ] **Step 3: Implement `RecordingBackend.drawSprite`**

```ts
export interface SpriteCall { dx: number; dy: number; dw: number; dh: number; clipBottom: number; }
```

Add `readonly sprites: SpriteCall[] = [];` and replace the no-op:

```ts
drawSprite(_image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number, clipBottom: number): void {
  this.sprites.push({ dx, dy, dw, dh, clipBottom });
}
```

- [ ] **Step 4: Implement `Canvas2DBackend.drawSprite`**

The backend receives *destination* rect + `clipBottom`; the caller (Renderer, Task 7) computes the source rect from the atlas frame and passes the atlas image. To keep `RenderBackend` primitive-only, extend the signature source args. **Update the interface** `RenderBackend.drawSprite` and both implementers + RecordingBackend to:

```ts
drawSprite(
  image: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,   // source rect in the atlas
  dx: number, dy: number, dw: number, dh: number,   // destination rect (logical px)
  clipBottom: number,
): void;
```

Canvas2D implementation:

```ts
drawSprite(image, sx, sy, sw, sh, dx, dy, dw, dh, clipBottom): void {
  const needsClip = clipBottom < dy + dh;
  if (needsClip) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, LOGICAL_WIDTH, clipBottom);
    this.ctx.clip();
  }
  this.ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  if (needsClip) this.ctx.restore();
}
```

Update `RecordingBackend.SpriteCall` to `{ sx, sy, sw, sh, dx, dy, dw, dh, clipBottom }` and the Step-1 RecordingBackend test accordingly.

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run && npm run build`
Expected: PASS (existing 37 still green); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/RenderBackend.ts src/engine/RecordingBackend.ts src/engine/Canvas2DBackend.ts src/engine/RecordingBackend.test.ts src/engine/Canvas2DBackend.test.ts
git commit -m "feat(engine): drawSprite records geometry (test backend) + blits with clip (Canvas2D)"
```

---

## Task 5: Traffic pool (deterministic advance + wrap)

**Files:**
- Create: `src/engine/Traffic.ts`
- Test: `src/engine/Traffic.test.ts`

**Interfaces:**
- Consumes: `TrackConfig` (for `segmentLength * length` = track world length).
- Produces: `interface TrafficCar { z: number; offset: number; speed: number; sprite: string }`; `class Traffic { constructor(cars: TrafficCar[], trackLength: number); readonly cars: readonly TrafficCar[]; update(dt: number): void }`. `update` advances each car's `z` by `speed*dt` and wraps modulo `trackLength`. No allocation in `update`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/Traffic.test.ts
import { describe, it, expect } from 'vitest';
import { Traffic, type TrafficCar } from './Traffic.js';

const mk = (over: Partial<TrafficCar> = {}): TrafficCar => ({ z: 0, offset: 0, speed: 100, sprite: 'car0', ...over });

describe('Traffic', () => {
  it('advances each car by speed*dt', () => {
    const t = new Traffic([mk({ z: 10, speed: 100 })], 10000);
    t.update(0.5);
    expect(t.cars[0]!.z).toBe(60);
  });
  it('wraps z modulo the track length', () => {
    const t = new Traffic([mk({ z: 9990, speed: 100 })], 10000);
    t.update(1); // 9990 + 100 = 10090 → 90
    expect(t.cars[0]!.z).toBeCloseTo(90);
  });
  it('is deterministic across identical update scripts', () => {
    const script = (t: Traffic) => { for (let i = 0; i < 100; i++) t.update(1 / 60); };
    const a = new Traffic([mk({ z: 0, speed: 137 })], 10000); script(a);
    const b = new Traffic([mk({ z: 0, speed: 137 })], 10000); script(b);
    expect(a.cars[0]!.z).toBe(b.cars[0]!.z);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/Traffic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/engine/Traffic.ts`**

```ts
export interface TrafficCar { z: number; offset: number; speed: number; sprite: string; }

/** A fixed pool of AI cars moving down-track at constant speed. Deterministic;
 * `update` mutates each car in place (no allocation). Phase 4: constant-speed
 * lane traffic — no avoidance AI (that is Phase 7 behavioural work). */
export class Traffic {
  constructor(readonly cars: TrafficCar[], private readonly trackLength: number) {}

  update(dt: number): void {
    const L = this.trackLength;
    for (const c of this.cars) {
      c.z += c.speed * dt;
      if (c.z >= L) c.z -= L;
      else if (c.z < 0) c.z += L;
    }
  }
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run src/engine/Traffic.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/Traffic.ts src/engine/Traffic.test.ts
git commit -m "feat(engine): deterministic constant-speed traffic pool with wrap"
```

---

## Task 6: Attach sprites to segments in `TrackManager.build()`

**Files:**
- Modify: `src/engine/TrackManager.ts`
- Test: `src/engine/TrackManager.test.ts` (extend)

**Interfaces:**
- Consumes: `Sprite` (Task 1).
- Produces: segments in the built track carry scenery sprites (trees/bushes alternating sides on the straight and curve sections; a `sign` at the curve entry; a `billboard` on the run-out).

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/TrackManager.test.ts — add
it('populates segments with roadside sprites', () => {
  const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
  const total = tm.segments.reduce((n, s) => n + s.sprites.length, 0);
  expect(total).toBeGreaterThan(20);
});
it('places sprites on both sides of the road', () => {
  const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
  const offs = tm.segments.flatMap((s) => s.sprites.map((sp) => sp.offset));
  expect(offs.some((o) => o < -1)).toBe(true);
  expect(offs.some((o) => o > 1)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/TrackManager.test.ts`
Expected: FAIL — no sprites attached (totals are 0).

- [ ] **Step 3: Edit `build()` to attach sprites**

After the `push(...)` calls build the segment array, decorate before returning:

```ts
// Scenery pass: alternate trees/bushes off both shoulders every few segments.
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i]!;
  if (i % 6 === 0) seg.sprites.push({ name: i % 12 === 0 ? 'tree' : 'bush', offset: -1.6 - (i % 3) * 0.4 });
  if (i % 6 === 3) seg.sprites.push({ name: i % 12 === 3 ? 'tree' : 'rock', offset: 1.6 + (i % 3) * 0.4 });
}
segments[60]?.sprites.push({ name: 'sign', offset: -1.3 });       // curve-entry sign
segments[220]?.sprites.push({ name: 'billboard', offset: 1.8 });  // run-out billboard
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run src/engine/TrackManager.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/TrackManager.ts src/engine/TrackManager.test.ts
git commit -m "feat(engine): attach roadside scenery sprites to track segments"
```

---

## Task 7: Renderer far→near sprite + traffic pass (no per-frame alloc)

**Files:**
- Modify: `src/engine/Renderer.ts`
- Test: `src/engine/Renderer.test.ts` (extend)

**Interfaces:**
- Consumes: `SpriteAtlas` (Task 3), `Traffic`/`TrafficCar` (Task 5), `PlayerState` (Task 1), `RecordingBackend.sprites` (Task 4).
- Produces: `Renderer` constructor becomes `new Renderer(config, atlas)`; `render(camera, track, backend, background?, traffic?, curvatureAtCamera?)`. Player-car draw uses `player`/steer from camera-derived state (Phase 4: centred). A reused `ProjRecord[]` of length `drawDistance` is allocated once in the constructor.

**Design:** the existing near→far loop already computes each visible segment's projected `x/y/w` and the running `maxy` crest clip. Store each into `this.records[k]` (pre-allocated) as it is drawn. After the loop, walk `records` **far→near** (reverse) and, per record, draw that segment's static sprites and any traffic car whose segment maps to that record, using `clipBottom = record.maxy`. Sprite screen geometry per the spec §7 formula.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/Renderer.test.ts — add
import { SpriteAtlas } from './SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

it('draws nearer sprites larger than far ones (monotonic with 1/z)', () => {
  const b = new RecordingBackend();
  // Track with a tree on a near segment and the same tree far, straight lead-in.
  // Render; find the two sprite calls for 'tree'; assert near dh > far dh.
  // (Build a minimal TrackManager or stub track.segment to return controlled sprites.)
});

it('emits sprite calls in far→near order (later calls are nearer/larger)', () => {
  const b = new RecordingBackend();
  // Assert b.sprites dh is non-decreasing across the array.
});

it('bottom-clips sprites against the segment crest (clipBottom passed through)', () => {
  const b = new RecordingBackend();
  // On a crest track, assert at least one sprite call has clipBottom < dy+dh.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/Renderer.test.ts`
Expected: FAIL — constructor arity changed / no sprite calls recorded.

- [ ] **Step 3: Implement the sprite pass**

Add a pre-allocated record array and fill it in the road loop; add a reverse pass. Key additions to `Renderer`:

```ts
interface ProjRecord { valid: boolean; x: number; y: number; w: number; relZ: number; maxy: number; base: number; }

// in constructor:
constructor(private readonly config: TrackConfig, private readonly atlas: SpriteAtlas) {
  this.records = Array.from({ length: config.drawDistance }, () => (
    { valid: false, x: 0, y: 0, w: 0, relZ: 0, maxy: LOGICAL_HEIGHT, base: 0 }));
}
private readonly records: ProjRecord[];
```

Inside the existing near→far loop, after computing `this.far` and the crest clip for a visible segment, record it:

```ts
const rec = this.records[i]!;
rec.valid = clip.visible;
rec.x = this.far.x; rec.y = this.far.y; rec.w = this.far.w;
rec.relZ = relZ; rec.maxy = maxy; rec.base = base + i;
```

Set `rec.valid = false` for skipped/occluded segments. After the loop, before `present()`:

```ts
this.drawSprites(camera, track, backend, traffic);
this.drawPlayerCar(backend);
```

```ts
private drawSprites(camera: Camera, track: TrackManager, backend: RenderBackend, traffic?: Traffic): void {
  const { segmentLength, roadWidth, drawDistance } = this.config;
  for (let i = drawDistance - 1; i >= 0; i--) {          // far → near
    const rec = this.records[i]!;
    if (!rec.valid) continue;
    const seg = track.segment(rec.base);
    for (const sp of seg.sprites) this.blit(backend, this.atlas.frame(sp.name), rec, sp.offset, camera, roadWidth);
    if (traffic) for (const car of traffic.cars) {
      if (Math.floor(car.z / segmentLength) === rec.base) {
        this.blit(backend, this.atlas.frame(car.sprite), rec, car.offset, camera, roadWidth);
      }
    }
  }
}

private blit(backend: RenderBackend, f: SpriteFrame, rec: ProjRecord, offset: number, camera: Camera, roadHalfWidth: number): void {
  const scale = scaleFor(camera.focalLength, rec.relZ);
  const dw = scale * f.w * (LOGICAL_WIDTH / 2) * (roadHalfWidth / DEFAULT_CAMERA_HEIGHT); // provisional world→px sprite scale, retuned at gate
  const dh = dw * (f.h / f.w);
  const cx = rec.x + rec.w * offset;                       // lateral: offset in road-half-widths
  const dx = cx - dw * (f.anchorX / f.w);
  const dy = rec.y - dh * (f.anchorY / f.h);
  backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, rec.maxy);
}

private drawPlayerCar(backend: RenderBackend): void {
  const f = this.atlas.frame('player');
  const dw = f.w * 3, dh = f.h * 3;                         // fixed foreground scale (provisional)
  const dx = (LOGICAL_WIDTH - dw) / 2;
  const dy = LOGICAL_HEIGHT - dh - 6;
  backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, LOGICAL_HEIGHT);
}
```

Import `SpriteFrame`, `scaleFor`, `DEFAULT_CAMERA_HEIGHT` as needed. Change `render`'s signature to accept `traffic?: Traffic` (positional, stable ref — no per-frame alloc). Note the sprite-scale expression is provisional and explicitly retuned at the visual gate (Task 10); tests assert only relationships.

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run && npm run build`
Expected: PASS; build clean. Update the existing Renderer construction in any test that used `new Renderer(config)` to `new Renderer(config, atlas)`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/Renderer.ts src/engine/Renderer.test.ts
git commit -m "feat(engine): far→near sprite/traffic pass with crest bottom-clip, zero per-frame alloc"
```

---

## Task 8: Collision detection + response (pure)

**Files:**
- Create: `src/engine/Collision.ts`
- Test: `src/engine/Collision.test.ts`

**Interfaces:**
- Consumes: `PlayerState` (Task 1), `TrafficCar` (Task 5), `TrackConfig`.
- Produces:
  - `isOffRoad(playerX: number, roadWidth: number): boolean` — `|playerX| > roadWidth`.
  - `hitCar(player: PlayerState, cars: readonly TrafficCar[], cfg: { roadWidth: number; segmentLength: number; carHalfWidthPx: number }): TrafficCar | null` — first car overlapping in z and lateral world-x.
  - `responseDelta(event: { offRoad: boolean; hit: boolean }): { speedFactor: number; xPush: number }` — pure multiplier + lateral nudge to apply to the harness kinematics.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/Collision.test.ts
import { describe, it, expect } from 'vitest';
import { isOffRoad, hitCar, responseDelta } from './Collision.js';
import type { TrafficCar } from './Traffic.js';
import type { PlayerState } from '../types/engine.js';

const cfg = { roadWidth: 2000, segmentLength: 200, carHalfWidthPx: 900 };
const player: PlayerState = { z: 1000, x: 0, speed: 100, gear: 1 };

describe('Collision', () => {
  it('flags off-road past the road half-width', () => {
    expect(isOffRoad(2100, 2000)).toBe(true);
    expect(isOffRoad(-100, 2000)).toBe(false);
  });
  it('detects a car overlapping in z and lateral offset', () => {
    const cars: TrafficCar[] = [{ z: 1010, offset: 0, speed: 50, sprite: 'car0' }];
    expect(hitCar(player, cars, cfg)).toBe(cars[0]);
  });
  it('misses a car in a different lane', () => {
    const cars: TrafficCar[] = [{ z: 1010, offset: 0.9, speed: 50, sprite: 'car0' }];
    expect(hitCar(player, cars, cfg)).toBeNull();
  });
  it('misses a car far away in z', () => {
    const cars: TrafficCar[] = [{ z: 5000, offset: 0, speed: 50, sprite: 'car0' }];
    expect(hitCar(player, cars, cfg)).toBeNull();
  });
  it('response slows and does not push when only off-road', () => {
    const d = responseDelta({ offRoad: true, hit: false });
    expect(d.speedFactor).toBeLessThan(1);
    expect(d.xPush).toBe(0);
  });
  it('response slows harder and pushes on a car hit', () => {
    const d = responseDelta({ offRoad: false, hit: true });
    expect(d.speedFactor).toBeLessThan(0.9);
    expect(Math.abs(d.xPush)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/Collision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/engine/Collision.ts`**

```ts
import type { PlayerState } from '../types/engine.js';
import type { TrafficCar } from './Traffic.js';

/** Player is off the road surface when beyond the road half-width either side. */
export function isOffRoad(playerX: number, roadWidth: number): boolean {
  return Math.abs(playerX) > roadWidth;
}

/** First car overlapping the player in depth (±1 segment) and lateral world-x. */
export function hitCar(
  player: PlayerState,
  cars: readonly TrafficCar[],
  cfg: { roadWidth: number; segmentLength: number; carHalfWidthPx: number },
): TrafficCar | null {
  for (const c of cars) {
    if (Math.abs(c.z - player.z) > cfg.segmentLength) continue;
    const carWorldX = c.offset * cfg.roadWidth;
    if (Math.abs(carWorldX - player.x) < cfg.carHalfWidthPx) return c;
  }
  return null;
}

/** Pure kinematic response to apply to the throwaway harness (Phase 5: to Vehicle). */
export function responseDelta(event: { offRoad: boolean; hit: boolean }): { speedFactor: number; xPush: number } {
  if (event.hit) return { speedFactor: 0.6, xPush: 400 };   // hard slow + shove
  if (event.offRoad) return { speedFactor: 0.9, xPush: 0 }; // drag, no shove
  return { speedFactor: 1, xPush: 0 };
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run src/engine/Collision.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/Collision.ts src/engine/Collision.test.ts
git commit -m "feat(engine): pure off-road + traffic collision detection and response deltas"
```

---

## Task 9: HUD (speedo, gear, timer, mini-map) from `PlayerState`

**Files:**
- Create: `src/ui/HUD.ts`
- Test: `src/ui/HUD.test.ts`

**Interfaces:**
- Consumes: `PlayerState` (Task 1), `SpriteAtlas` (Task 3), `TrackManager` + `Camera` (mini-map), `RenderBackend`.
- Produces: pure helpers `speedToKmh(speed: number): number`, `formatTime(ms: number): string` (`"m:ss.t"`); `class HUD { constructor(atlas: SpriteAtlas); render(player: PlayerState, elapsedMs: number, track: TrackManager, camera: Camera, backend: RenderBackend): void }`. Digits drawn via `digit_*` frames; colon via `glyph_colon`; mini-map via `drawQuad`.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/HUD.test.ts
import { describe, it, expect } from 'vitest';
import { HUD, speedToKmh, formatTime } from './HUD.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/RecordingBackend.js';
import { TrackManager } from '../engine/TrackManager.js';
import { DEFAULT_TRACK_CONFIG, DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y } from '../constants.js';
import type { Camera, PlayerState } from '../types/engine.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const camera: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
const player: PlayerState = { z: 0, x: 0, speed: 6000, gear: 2 };

describe('HUD helpers', () => {
  it('formatTime renders minutes:seconds.tenths', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(83400)).toBe('1:23.4');
  });
  it('speedToKmh scales world speed to a positive display number', () => {
    expect(speedToKmh(6000)).toBeGreaterThan(0);
  });
});

describe('HUD render', () => {
  it('draws one sprite per speed digit plus the gear digit', () => {
    const b = new RecordingBackend();
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    new HUD(atlas).render(player, 83400, track, camera, b);
    // speed "200" (3) + timer "1:23.4" (5 digits + 1 colon) + gear "2" (1) = 10 sprite calls min
    expect(b.sprites.length).toBeGreaterThanOrEqual(9);
  });
  it('draws a mini-map strip via quads', () => {
    const b = new RecordingBackend();
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    new HUD(atlas).render(player, 0, track, camera, b);
    expect(b.quads.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/HUD.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/HUD.ts`**

```ts
import { LOGICAL_WIDTH } from '../constants.js';
import type { Camera, PlayerState } from '../types/engine.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { TrackManager } from '../engine/TrackManager.js';

const KMH_PER_WORLD = 0.05; // world units/s → km/h display (provisional; retuned at gate)

export function speedToKmh(speed: number): number { return Math.round(speed * KMH_PER_WORLD); }

export function formatTime(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const tenth = Math.floor((t % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${tenth}`;
}

/** Renders the HUD from PlayerState only — no simulation state of its own. Draws
 * digits/colon from the bitmap-font atlas frames and a curvature mini-map strip. */
export class HUD {
  private static readonly SCALE = 2;
  constructor(private readonly atlas: SpriteAtlas) {}

  render(player: PlayerState, elapsedMs: number, track: TrackManager, camera: Camera, backend: RenderBackend): void {
    this.drawString(backend, `${speedToKmh(player.speed)}`, 6, 6);          // speedo
    this.drawString(backend, `${player.gear}`, 6, 18);                       // gear
    this.drawString(backend, formatTime(elapsedMs), LOGICAL_WIDTH - 70, 6);  // timer
    this.drawMiniMap(track, camera, backend);
  }

  private drawString(backend: RenderBackend, text: string, x: number, y: number): void {
    const S = HUD.SCALE;
    let cx = x;
    for (const ch of text) {
      const name = ch === ':' ? 'glyph_colon' : ch === '.' ? 'glyph_colon' : `digit_${ch}`;
      const f = this.atlas.frame(name);
      backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, cx, y, f.w * S, f.h * S, 9999);
      cx += (f.w + 1) * S;
    }
  }

  private drawMiniMap(track: TrackManager, camera: Camera, backend: RenderBackend): void {
    const base = Math.floor(camera.z / 200);
    const x0 = LOGICAL_WIDTH - 40, y0 = 30;
    for (let i = 0; i < 20; i++) {
      const seg = track.segment(base + i * 4);
      const cx = x0 + seg.curve * 2;
      backend.drawQuad(cx, y0 + i * 2, 2, cx, y0 + i * 2 + 1, 2, '#e8e8f0');
    }
  }
}
```

Note: `.` uses `glyph_colon` as a provisional 1px mark (a dedicated `glyph_dot` can be added to the manifest at the gate if desired). Digits missing from a string (none, since only 0–9/:/. appear) would throw via `atlas.frame`, surfacing font gaps early.

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/HUD.ts src/ui/HUD.test.ts
git commit -m "feat(ui): HUD speedo/gear/timer/mini-map rendered from PlayerState"
```

---

## Task 10: Wire the harness — PlayerState, traffic, collision (update), HUD (render) + visual gate

**Files:**
- Modify: `src/main.ts`
- Manual: visual gate via `npm run dev` + `claude-in-chrome`

**Interfaces:**
- Consumes: everything above. No test file — `main.ts` is the throwaway wiring harness; its logic (collision, traffic, HUD) is already unit-tested in isolation. Verification is the visual gate.

- [ ] **Step 1: Rewrite the harness to own a mutable `PlayerState` and wire the systems**

```ts
import { generateAtlas } from './assets/generateSprites.js';
import { SpriteAtlas } from './engine/SpriteAtlas.js';
import { Traffic, type TrafficCar } from './engine/Traffic.js';
import { HUD } from './ui/HUD.js';
import { isOffRoad, hitCar, responseDelta } from './engine/Collision.js';
import type { PlayerState } from './types/engine.js';
// ...existing imports (Canvas2DBackend, createLoop, ensureAnonSession, Renderer, TrackManager, Background, constants)...

const { image, frames } = generateAtlas();
const atlas = new SpriteAtlas(image, frames);

const track = new TrackManager(DEFAULT_TRACK_CONFIG);
const background = new Background();
const renderer = new Renderer(DEFAULT_TRACK_CONFIG, atlas);
const hud = new HUD(atlas);

const trackLength = track.length * DEFAULT_TRACK_CONFIG.segmentLength;
const cars: TrafficCar[] = [
  { z: 4000, offset: -0.4, speed: 4000, sprite: 'car0' },
  { z: 9000, offset: 0.4, speed: 3500, sprite: 'car1' },
  { z: 15000, offset: 0, speed: 5000, sprite: 'car2' },
  { z: 22000, offset: -0.5, speed: 4500, sprite: 'car3' },
];
const traffic = new Traffic(cars, trackLength);

// Mutable backing for the PlayerState seam. Phase 5: replaced by Vehicle.
const player = { z: 0, x: 0, speed: 12000, gear: 2 };
const playerView: PlayerState = player; // readonly view handed to consumers
const camera: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };

let steer = 0, throttle = 1, elapsedMs = 0;
// keydown/keyup: A/D steer, W/S throttle 0..1 (reuse existing listeners, drive `throttle`)

const cfg = { roadWidth: DEFAULT_TRACK_CONFIG.roadWidth, segmentLength: DEFAULT_TRACK_CONFIG.segmentLength, carHalfWidthPx: 900 };

const loop = createLoop({
  update: (dt: number): void => {
    elapsedMs += dt * 1000;
    player.speed = 12000 * throttle;
    player.z += player.speed * dt;
    player.x += steer * 2000 * dt;
    traffic.update(dt);
    const ev = { offRoad: isOffRoad(player.x, cfg.roadWidth), hit: hitCar(playerView, cars, cfg) != null };
    const d = responseDelta(ev);
    player.speed *= d.speedFactor;
    player.x += (player.x >= 0 ? -1 : 1) * d.xPush * dt * (ev.hit ? 1 : 0);
    camera.z = player.z; camera.x = player.x;
  },
  render: (): void => {
    const base = Math.floor(camera.z / DEFAULT_TRACK_CONFIG.segmentLength);
    renderer.render(camera, track, backend, background, traffic, track.segment(base).curve);
    hud.render(playerView, elapsedMs, track, camera, backend);
    backend.present(); // NOTE: move present() out of Renderer.render so HUD draws before blit — see Step 2
  },
});
```

- [ ] **Step 2: Move `present()` from `Renderer.render` to the caller**

So the HUD draws onto the same logical frame before blit. In `Renderer.render`, delete the trailing `backend.present();`. Update `Renderer.test.ts` assertions that counted `presents` to call `backend.present()` themselves or drop that assertion. Re-run `npx vitest run` — all green.

- [ ] **Step 3: Build + run the dev server**

Run: `npm run build && npm run dev`
Expected: build clean; Vite serves `http://localhost:5173` (HTTP 200).

- [ ] **Step 4: Visual gate via `claude-in-chrome` (closes the Phase 2+3 look gate too)**

Invoke the `claude-in-chrome` skill; open `http://localhost:5173`; capture screenshots. Confirm on screen:
- Sprites scale with distance; near trees/cars larger than far.
- **No hill bleed-through** — sprites behind a crest are clipped at the crest line.
- Traffic cars move down-track and depth-sort correctly with scenery.
- HUD legible: speedo, gear, timer, mini-map strip.
- Nearest-neighbour crisp (chunky pixels, no blur); road bends through the S-curve; far road disappears over the crest; parallax bands pan.
- Smooth ~60fps (no stutter over ~30s).
- Retune provisional constants if needed: `COLORS`, the sprite-scale expression in `Renderer.blit`, `KMH_PER_WORLD`, `autoSpeed`/throttle. Re-run `npm test` after any retune (relationship tests must stay green).

Record 2–3 screenshots as the gate evidence.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/engine/Renderer.ts src/engine/Renderer.test.ts
git commit -m "feat: wire sprites/traffic/collision/HUD via PlayerState seam; pass visual gate (closes P2/3 look gate)"
```

---

## Task 11: Operational carryover (now unblocked) + active-plan roll

**Files:**
- Modify: `active-plan.md`
- Manual: Netlify + Supabase confirmation

- [ ] **Step 1: Confirm Netlify build is green** from the pushed branch (or `main` after merge). If a `main` merge is intended, follow `superpowers:finishing-a-development-branch` at end of phase.
- [ ] **Step 2: Confirm the Supabase §8 schema + RLS migration is applied** and `.env` holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Use the Supabase MCP tools; see the `supabase-backend-setup` memory.
- [ ] **Step 3: Roll `active-plan.md`** to Phase 4 done state: check off the M-milestones, record the visual-gate screenshots reference, note any provisional-constant retunes and deviations from this plan (Phase 2/3 convention).
- [ ] **Step 4: Final verification** — `npm test` (all green, count > 37) and `npm run build` clean.
- [ ] **Step 5: Commit**

```bash
git add active-plan.md
git commit -m "chore: roll active-plan to Phase 4 done; operational carryover confirmed"
```

---

## Self-Review

**Spec coverage** (against `2026-08-05-phase-4-sprites-traffic-hud-design.md`):
- §2 `PlayerState` seam → Task 1 (interface), Task 10 (harness implements it). ✓
- §2 determinism reconciliation → collision + traffic pure/tested (Tasks 5, 8); harness kinematics untested by design (Task 10). ✓
- §3 code-generated pixel atlas (scenery, 3–4 cars, player, bitmap font) → Tasks 2 (manifest incl. 4 cars + player + digits), 3 (generator). Swap path documented in spec §3 (frame table is the seam). ✓
- §4 components: `generateSprites`/`SpriteAtlas` (Task 3), `drawSprite` on backends (Task 4), `Traffic` (Task 5), `Collision` (Task 8), `HUD` (Task 9), Renderer sprite pass with `Y_clip` bottom-clip (Task 7), `PlayerState`/`Sprite`/`Segment` types (Task 1). ✓
- §5 data flow: collision in update, HUD in render before present (Task 10 Steps 1–2). ✓
- §6 headless tests: scaling/order/clip (Task 7), traffic (5), collision (8), frame-table integrity (2), sprite recording (4). ✓
- §7 visual gate via claude-in-chrome, retroactively closes P2/3 (Task 10 Step 4). ✓
- §8 done-when + operational appendix → Task 11. ✓

**Placeholder scan:** the two `Renderer.test.ts` / `Canvas2DBackend.test.ts` sprite-assertion bodies (Task 4 Step 1, Task 7 Step 1) are described with the exact assertion to make and the existing in-file pattern to mirror, not left as bare "TODO"; every code file has full implementation. No "add error handling"/"etc." language. ✓

**Type consistency:** `drawSprite` signature settled to the 10-arg source+dest+clip form in Task 4 and used identically in Renderer (Task 7) and HUD (Task 9); `RecordingBackend.SpriteCall` matches. `Renderer` constructor arity change (`config, atlas`) is propagated to all test construction sites (Task 7 Step 4). `PlayerState` fields (`z,x,speed,gear`) identical across Tasks 1, 8, 9, 10. `TrafficCar` (`z,offset,speed,sprite`) identical across Tasks 5, 7, 8, 10. ✓
