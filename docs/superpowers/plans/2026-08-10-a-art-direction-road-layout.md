# Spec A — Art Direction, Road Surface & Layout Lock: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the game's palette, road surface treatment, and screen layout so every asset baked in later specs has one target to hit.

**Architecture:** A shared `palette.json` becomes the single source of truth for both TypeScript and the Python bake scripts. The road gains a shoulder band and a horizon merge rule that stops kerb strobing. The screen layout moves to the researched TX-1 composition. A vitest lint mechanises the 2×2 authoring grid.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest (`environment: 'node'`, no DOM), Vite, Python 3 + Pillow for the sampling script.

**Spec:** `docs/superpowers/specs/2026-08-10-a-art-direction-road-layout.md`

## Global Constraints

- **Segment model only.** No WebGL, no Three.js, no real 3D. (`CLAUDE.md` hard rule 1)
- **Renderer stays behind `RenderBackend`.** Game code never touches a `ctx`. Only `Canvas2DBackend.ts` and `generateSprites.ts` may. (hard rule 2)
- **No per-frame allocation in `render()`.** Pre-allocate; backend methods take primitive args. (hard rule 4)
- **Zero external deps in the engine core.** Native browser APIs only. (hard rule 5)
- **Never rename a sprite in `SPRITE_MANIFEST`.** `src/track/schema.ts:27` builds `VALID_SPRITES` from it and every track JSON validates against that set. Changing dimensions is safe; changing names breaks track loading.
- **Do not change `FONT_COLORS` values.** Six hexes at `src/assets/spriteManifest.ts:17-24` are baked into 228 existing glyph frames.
- Tests run with `npm test` (`vitest run`). Build gate is `npm run build` (`tsc --noEmit && vite build`).
- Commit after every task. Branch off `main` before starting.

---

### Task 1: Palette as shared data

**Files:**
- Create: `src/assets/palette.json`
- Create: `src/assets/palette.ts`
- Test: `src/assets/palette.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PALETTE` (typed object), `type Palette`, and `paletteEntryCount(): number`. Task 2 consumes `PALETTE`. Spec C's Python scripts read `src/assets/palette.json` directly.

- [ ] **Step 1: Write the failing test**

```ts
// src/assets/palette.test.ts
import { describe, it, expect } from 'vitest';
import { PALETTE, paletteEntryCount } from './palette.js';
import { FONT_COLORS } from './spriteManifest.js';

const HEX = /^#[0-9a-f]{6}$/;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff);
}

describe('palette', () => {
  it('uses lowercase 6-digit hex everywhere', () => {
    const walk = (v: unknown): void => {
      if (typeof v === 'string') expect(v).toMatch(HEX);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(PALETTE);
  });

  it('holds a disciplined master palette of 40-48 colours', () => {
    const n = paletteEntryCount();
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(48);
  });

  it('gives every car body a 5-step ramp ordered dark to light', () => {
    for (const [hue, ramp] of Object.entries(PALETTE.body)) {
      expect(ramp, hue).toHaveLength(5);
      for (let i = 1; i < ramp.length; i++) {
        expect(luminance(ramp[i]!), `${hue} step ${i}`).toBeGreaterThan(luminance(ramp[i - 1]!));
      }
    }
  });

  it('records the shipped FONT_COLORS verbatim', () => {
    // Regression guard: 228 glyph frames are already baked against these.
    expect(PALETTE.ui.white).toBe(FONT_COLORS.white);
    expect(PALETTE.ui.magenta).toBe(FONT_COLORS.magenta);
    expect(PALETTE.ui.cyan).toBe(FONT_COLORS.cyan);
    expect(PALETTE.ui.red).toBe(FONT_COLORS.red);
    expect(PALETTE.ui.gold).toBe(FONT_COLORS.gold);
    expect(PALETTE.ui.blue).toBe(FONT_COLORS.blue);
  });

  it('keeps the chrome ramp at 5 steps', () => {
    expect(PALETTE.chrome).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/assets/palette.test.ts`
Expected: FAIL — cannot resolve `./palette.js`.

- [ ] **Step 3: Create the palette data**

`tsconfig.json` already has `resolveJsonModule: true` — verified, no config change needed.

```json
// src/assets/palette.json
{
  "road":    { "surfaceA": "#4a4a55", "surfaceB": "#42424c", "shoulder": "#5a5a66" },
  "kerb":    { "red": "#d02020", "white": "#f0f0f0" },
  "lane":    "#e8e8d0",
  "outline": "#101018",
  "trunk":   "#6a4a2a",
  "foliage": ["#2a7a3a", "#3d9a4d", "#58b85a"],
  "chrome":  ["#2a2a32", "#5a5a6a", "#9a9ab0", "#d8d8e8", "#ffffff"],
  "body": {
    "red":  ["#4a0a10", "#8a1a20", "#c02a30", "#e85a55", "#ffb0a0"],
    "blue": ["#0a1a4a", "#1a3a8a", "#2a5ac0", "#5a8ae8", "#b0d0ff"]
  },
  "sky": {
    "night":   ["#00012f", "#10154c", "#1e1a5b", "#441d7f"],
    "sunset":  ["#1b0131", "#b00187", "#f01985", "#f4477e", "#fea263", "#fee971"],
    "canyon":  ["#271059", "#6228a2", "#9132a7", "#c4432f", "#fea74c"]
  },
  "ui": {
    "header":  "#000088",
    "white":   "#e8e8f0",
    "magenta": "#e040c0",
    "cyan":    "#40e0e0",
    "red":     "#f03030",
    "gold":    "#ffcc00",
    "blue":    "#5070ff"
  }
}
```

The `sky.*` ramps are **sampled from the three shipped plates**, not taken from the research doc — see spec §2. The `ui.*` values are copied verbatim from `FONT_COLORS`.

Count: 3 + 2 + 1 + 1 + 1 + 3 + 5 + 10 + 15 + 7 = **48**. At the ceiling — if you add a colour, remove one.

- [ ] **Step 4: Create the typed accessor**

```ts
// src/assets/palette.ts
/**
 * Master palette — the single source of truth for every gameplay-element colour.
 *
 * Shared with the Python bake scripts, which read `palette.json` directly, so the
 * engine and the offline renderers clamp to identical values.
 *
 * Scope boundary: this governs road, vehicles, props and UI — NOT the backdrop
 * plates. Each plate carries its own adaptive 48-colour palette from
 * `prep_backgrounds.py`; collapsing all three into one master would visibly
 * degrade art that already looks right. `sky.*` below is sampled *from* the
 * plates so gameplay elements sit correctly against them.
 */
import data from './palette.json' with { type: 'json' };

export type Palette = typeof data;
export const PALETTE: Palette = data;

/** Total distinct colour slots. Kept in 40-48 for coherence (research §1a). */
export function paletteEntryCount(): number {
  let n = 0;
  const walk = (v: unknown): void => {
    if (typeof v === 'string') n++;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(PALETTE);
  return n;
}
```

⚠️ If `import ... with { type: 'json' }` trips the TS/Vite version in use, fall back to a plain `import data from './palette.json';`. Verify with `npm run build`, not by assumption.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/assets/palette.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/assets/palette.json src/assets/palette.ts src/assets/palette.test.ts
git commit -m "feat(palette): add shared master palette as single source of truth"
```

---

### Task 2: Derive COLORS from the palette and swap the road hexes

**Files:**
- Modify: `src/constants.ts:71-80`
- Test: `src/constants.test.ts` (create if absent)

**Interfaces:**
- Consumes: `PALETTE` from Task 1.
- Produces: `COLORS` with its existing key names **plus** `shoulder`. Task 3 and Task 4 consume `COLORS.shoulder`, `COLORS.rumbleDark`, `COLORS.rumbleLight`.

- [ ] **Step 1: Write the failing test**

```ts
// src/constants.test.ts
import { describe, it, expect } from 'vitest';
import { COLORS } from './constants.js';
import { PALETTE } from './assets/palette.js';

describe('COLORS', () => {
  it('draws the kerb in high-contrast arcade red and white', () => {
    expect(COLORS.rumbleDark).toBe(PALETTE.kerb.red);
    expect(COLORS.rumbleLight).toBe(PALETTE.kerb.white);
  });

  it('keeps the two road greys close enough to read as texture, not stripes', () => {
    const lum = (h: string): number => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff);
    };
    expect(Math.abs(lum(COLORS.road) - lum(COLORS.roadDark))).toBeLessThan(12);
  });

  it('exposes a shoulder colour distinct from both kerb and road', () => {
    expect(COLORS.shoulder).toBe(PALETTE.road.shoulder);
    expect(COLORS.shoulder).not.toBe(COLORS.road);
    expect(COLORS.shoulder).not.toBe(COLORS.rumbleDark);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/constants.test.ts`
Expected: FAIL — `COLORS.shoulder` is undefined and `rumbleDark` is still `#c04040`.

- [ ] **Step 3: Rewrite the COLORS block**

Replace `src/constants.ts:70-80` entirely. Add `import { PALETTE } from './assets/palette.js';` to the imports at the top.

```ts
/**
 * Retro palette, derived from the shared master palette (`assets/palette.json`)
 * so the engine and the offline bake scripts clamp to identical values.
 * Key names are unchanged from the provisional set so no call site moves.
 */
export const COLORS = {
  sky: PALETTE.sky.night[0]!,
  groundLight: PALETTE.foliage[1]!,
  groundDark: PALETTE.foliage[0]!,
  road: PALETTE.road.surfaceA,
  roadDark: PALETTE.road.surfaceB,
  shoulder: PALETTE.road.shoulder,
  rumbleLight: PALETTE.kerb.white,
  rumbleDark: PALETTE.kerb.red,
  lane: PALETTE.lane,
} as const;
```

The old comment `/** Provisional retro palette. Retuned when the look locks in Phase 4. */` is deleted — this task *is* that retune.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: `constants.test.ts` PASS. Other suites may fail on hardcoded colour assertions — that is expected; fix them to reference `COLORS` rather than literal hexes.

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts src/constants.test.ts
git commit -m "feat(palette): derive COLORS from the master palette; lock kerb to #d02020/#f0f0f0"
```

---

### Task 3: Anti-strobe band merging

**Files:**
- Create: `src/engine/roadBanding.ts`
- Test: `src/engine/roadBanding.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MIN_BAND_ROWS: number` and `bandMerges(segmentScreenHeight: number, rumbleSegments: number): boolean`. Task 4 calls `bandMerges` inside the Renderer segment loop.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/roadBanding.test.ts
import { describe, it, expect } from 'vitest';
import { bandMerges, MIN_BAND_ROWS } from './roadBanding.js';

describe('bandMerges', () => {
  it('merges when a whole rumble group is shorter than the minimum rows', () => {
    // 5 segments x 0.2 rows = 1.0 row total, under MIN_BAND_ROWS (2).
    expect(bandMerges(0.2, 5)).toBe(true);
  });

  it('alternates when the group is comfortably tall', () => {
    expect(bandMerges(4, 5)).toBe(false); // 20 rows
  });

  it('is exact at the boundary: merging starts strictly below the threshold', () => {
    const atThreshold = MIN_BAND_ROWS / 5;
    expect(bandMerges(atThreshold, 5)).toBe(false);
    expect(bandMerges(atThreshold - 1e-9, 5)).toBe(true);
  });

  it('is monotonic in segment height', () => {
    let sawMerge = false;
    for (let h = 0.01; h < 5; h += 0.01) {
      const merged = bandMerges(h, 5);
      if (!merged) sawMerge = true;
      // once it stops merging it must never merge again as height grows
      if (sawMerge) expect(bandMerges(h, 5)).toBe(false);
    }
  });

  it('never throws or divides by zero on degenerate input', () => {
    expect(bandMerges(0, 0)).toBe(true);
    expect(bandMerges(-5, 5)).toBe(true);
    expect(bandMerges(NaN, 5)).toBe(true);
    expect(bandMerges(Infinity, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/roadBanding.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engine/roadBanding.ts
/**
 * Horizon band merging — the anti-strobe rule (research §1d).
 *
 * Band *phase* is already tied to world Z in the Renderer loop
 * (`Math.floor((base + i) / rumbleSegments) % 2`), which is what stops
 * screen-space strobing. What that alone does not handle is the horizon: as
 * segments compress toward the vanishing point a whole rumble group eventually
 * projects to under one framebuffer row, and alternating it flickers.
 *
 * Merging below a floor gives the solid blur at the horizon that OutRun has.
 * Pure and primitive-only so it costs nothing in the render loop.
 */

/** A rumble group shorter than this many framebuffer rows must not alternate. */
export const MIN_BAND_ROWS = 2;

/**
 * True when a rumble group is too short on screen to alternate without strobing.
 * `segmentScreenHeight` is one segment's projected height in framebuffer rows.
 * Total over all input: degenerate values merge (the safe, non-flickering side).
 */
export function bandMerges(segmentScreenHeight: number, rumbleSegments: number): boolean {
  const groupRows = segmentScreenHeight * rumbleSegments;
  // NaN and negatives fall through to `true` — merging never flickers.
  return !(groupRows >= MIN_BAND_ROWS);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/engine/roadBanding.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/roadBanding.ts src/engine/roadBanding.test.ts
git commit -m "feat(road): add anti-strobe band merge rule for the horizon"
```

---

### Task 4: Shoulder band + wire merging into the Renderer

**Files:**
- Modify: `src/engine/Renderer.ts:145` and `:159-185`
- Test: `src/engine/Renderer.test.ts`

**Interfaces:**
- Consumes: `bandMerges`, `MIN_BAND_ROWS` (Task 3); `COLORS.shoulder` (Task 2).
- Produces: a 4-quad-per-road draw order — shoulder (1.22×), rumble (1.15×), road (1.0×), lane (0.04×).

- [ ] **Step 1: Write the failing test**

Add to `src/engine/Renderer.test.ts`. Reuse the existing `stubTrack` and `camAt` helpers already in that file.

```ts
describe('road surface', () => {
  it('draws shoulder, rumble, road widest-first so each overlays the last', () => {
    const backend = new RecordingBackend();
    const track = stubTrack(() => []);
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), track, backend);

    const shoulders = backend.quads.filter((q) => q.color === COLORS.shoulder);
    expect(shoulders.length).toBeGreaterThan(0);

    // For one span, the shoulder quad is wider than the rumble beneath it.
    const i = backend.quads.findIndex((q) => q.color === COLORS.shoulder);
    const shoulder = backend.quads[i]!;
    const rumble = backend.quads[i + 1]!;
    expect(shoulder.w2).toBeGreaterThan(rumble.w2);
  });

  it('draws the shoulder on both band phases, unlike the kerb', () => {
    const backend = new RecordingBackend();
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), stubTrack(() => []), backend);

    const kerbRed = backend.quads.filter((q) => q.color === COLORS.rumbleDark).length;
    const kerbWhite = backend.quads.filter((q) => q.color === COLORS.rumbleLight).length;
    const shoulder = backend.quads.filter((q) => q.color === COLORS.shoulder).length;

    expect(kerbRed).toBeGreaterThan(0);
    expect(kerbWhite).toBeGreaterThan(0);
    // One shoulder per road span; kerb splits that count across two phases.
    expect(shoulder).toBe(kerbRed + kerbWhite);
  });

  it('merges bands near the horizon instead of alternating them', () => {
    const backend = new RecordingBackend();
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), stubTrack(() => []), backend);

    // The far end of the draw distance is emitted last within each span group;
    // collect kerb quads whose projected height is under the merge floor.
    const kerbs = backend.quads.filter(
      (q) => q.color === COLORS.rumbleDark || q.color === COLORS.rumbleLight,
    );
    const tiny = kerbs.filter((q) => Math.abs(q.y2 - q.y1) * DEFAULT_TRACK_CONFIG.rumbleSegments < MIN_BAND_ROWS);
    expect(tiny.length).toBeGreaterThan(0);
    // Every merged band uses the light phase — no alternation at the horizon.
    for (const q of tiny) expect(q.color).toBe(COLORS.rumbleLight);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/Renderer.test.ts`
Expected: FAIL — no shoulder quads exist.

- [ ] **Step 3: Implement**

Add to the imports in `src/engine/Renderer.ts`:

```ts
import { bandMerges } from './roadBanding.js';
```

Replace line 145:

```ts
          const merged = bandMerges(this.near.y - this.far.y, this.config.rumbleSegments);
          const dark = !merged && Math.floor((base + i) / this.config.rumbleSegments) % 2 === 1;
```

Replace the road-drawing block at lines 165-184 with:

```ts
            // Shoulder: a thin band between kerb and grass, on BOTH phases, so
            // the kerb red never vibrates against the foliage green (§1d).
            backend.drawQuad(
              fx, this.far.y, this.far.w * 1.22,
              nx, this.near.y, this.near.w * 1.22,
              COLORS.shoulder,
            );
            // Kerb (wider, drawn before the road so the road overlays it).
            backend.drawQuad(
              fx, this.far.y, this.far.w * 1.15,
              nx, this.near.y, this.near.w * 1.15,
              dark ? COLORS.rumbleDark : COLORS.rumbleLight,
            );
            // Road surface.
            backend.drawQuad(
              fx, this.far.y, this.far.w,
              nx, this.near.y, this.near.w,
              dark ? COLORS.roadDark : COLORS.road,
            );
            // Centre lane dash on light bands only — and never on a merged band,
            // where it would be sub-row noise.
            if (!dark && !merged) {
              backend.drawQuad(
                fx, this.far.y, this.far.w * 0.04,
                nx, this.near.y, this.near.w * 0.04,
                COLORS.lane,
              );
            }
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: new road tests PASS. Existing tests asserting quad *counts* per segment will fail (3 → 4 quads); update those counts.

- [ ] **Step 5: Commit**

```bash
git add src/engine/Renderer.ts src/engine/Renderer.test.ts
git commit -m "feat(road): add shoulder band and merge kerb bands at the horizon"
```

---

### Task 5: Layout constants and the horizon move

**Files:**
- Modify: `src/constants.ts:32`
- Modify: `src/engine/Renderer.ts:248-254`
- Test: `src/constants.test.ts`, `src/engine/Renderer.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `HORIZON_Y = 118`, `HEADER_H = 40`, `HUD_MARGIN = 6`, `HUD_ROW_Y = 248`, `PLAYER_CAR_BASE_Y = 232`, `PLAYER_CAR_WIDTH = 120`. Task 6 consumes all the HUD ones; Spec C consumes the player-car ones.

⚠️ **This is the highest-risk task in the plan.** Moving the horizon shifts the vanishing point for every projected segment and sprite. Expect several `Renderer` tests that assert absolute y-positions to move. Run the full suite before and after and diff the failures — a test that fails in a way you cannot explain from the horizon change is a real bug.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/constants.test.ts
import {
  HORIZON_Y, HEADER_H, HUD_MARGIN, HUD_ROW_Y,
  PLAYER_CAR_BASE_Y, PLAYER_CAR_WIDTH, LOGICAL_WIDTH, LOGICAL_HEIGHT,
} from './constants.js';

describe('screen layout (research §5a)', () => {
  it('puts the horizon just above vertical centre', () => {
    expect(HORIZON_Y).toBe(118);
    expect(HORIZON_Y).toBeLessThan(LOGICAL_HEIGHT / 2);
  });

  it('keeps the TX-1 header shallow so it does not eat the sky', () => {
    expect(HEADER_H).toBe(40);
    expect(HEADER_H / LOGICAL_HEIGHT).toBeLessThan(0.16);
  });

  it('leaves room for the plates between header and horizon', () => {
    expect(HORIZON_Y - HEADER_H).toBeGreaterThanOrEqual(78);
  });

  it('keeps corner readouts inside the safe margin', () => {
    expect(HUD_MARGIN).toBeGreaterThanOrEqual(6);
    expect(HUD_ROW_Y).toBeLessThanOrEqual(LOGICAL_HEIGHT - HUD_MARGIN - 5);
  });

  it('sits the player car in the lower third with road visible below it', () => {
    expect(PLAYER_CAR_BASE_Y).toBe(232);
    expect(LOGICAL_HEIGHT - PLAYER_CAR_BASE_Y).toBeGreaterThanOrEqual(30);
    expect(PLAYER_CAR_WIDTH).toBe(120);
    expect(PLAYER_CAR_WIDTH / LOGICAL_WIDTH).toBeCloseTo(0.25, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/constants.test.ts`
Expected: FAIL — constants not exported, `HORIZON_Y` is 135.

- [ ] **Step 3: Add the constants**

Replace `src/constants.ts:32`:

```ts
/**
 * Screen layout (research §5a). The horizon sits just above vertical centre so
 * the road gets the bottom ~56% — correct proportions for a racer. Moving this
 * moves the vanishing point for every projected segment; retune
 * DEFAULT_FOCAL_LENGTH alongside it if the road reads wrong.
 */
export const HORIZON_Y = 118; // Y_horizon; vanishing row for a level camera
export const HEADER_H = 40; // TX-1 blue header depth
export const HUD_MARGIN = 6; // safe inset from every edge (iOS notch)
export const HUD_ROW_Y = 248; // baseline row for the SCORE / SPEED corner readouts
export const PLAYER_CAR_BASE_Y = 232; // player car bottom edge
export const PLAYER_CAR_WIDTH = 120; // player car drawn width (~1/4 screen)
```

- [ ] **Step 4: Rewrite drawPlayerCar to use them**

Replace `src/engine/Renderer.ts:248-254`:

```ts
  private drawPlayerCar(backend: RenderBackend): void {
    const f = this.atlas.frame('player');
    // Layout-locked size and position (research §5a). Spec C swaps the artwork
    // behind this without re-deriving where the car sits.
    const dw = PLAYER_CAR_WIDTH;
    const dh = dw * (f.h / f.w);
    const dx = (LOGICAL_WIDTH - dw) / 2;
    const dy = PLAYER_CAR_BASE_Y - dh;
    backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, LOGICAL_HEIGHT);
  }
```

Update the `constants.js` import line in `Renderer.ts` to include `PLAYER_CAR_WIDTH` and `PLAYER_CAR_BASE_Y`.

- [ ] **Step 5: Add the Renderer placement test**

```ts
// add to src/engine/Renderer.test.ts
it('centres the player car and bases it at the locked row', () => {
  const backend = new RecordingBackend();
  new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), stubTrack(() => []), backend);
  const car = backend.sprites.at(-1)!; // player car is drawn last
  expect(car.dw).toBe(PLAYER_CAR_WIDTH);
  expect(car.dx + car.dw / 2).toBeCloseTo(LOGICAL_WIDTH / 2, 5);
  expect(car.dy + car.dh).toBeCloseTo(PLAYER_CAR_BASE_Y, 5);
});
```

- [ ] **Step 6: Run the full suite and triage**

Run: `npm test`
Expected: layout tests PASS. Renderer tests asserting absolute y-positions will shift. For each failure, confirm the new value is consistent with a horizon at 118 before updating it. **Do not blanket-update expected values** — that is how a real regression gets absorbed.

- [ ] **Step 7: Commit**

```bash
git add src/constants.ts src/constants.test.ts src/engine/Renderer.ts src/engine/Renderer.test.ts
git commit -m "feat(layout): lock horizon to 118 and player car to the researched composition"
```

---

### Task 6: TX-1 header at 40px with corner readouts

**Files:**
- Modify: `src/ui/HUD.ts`
- Test: `src/ui/HUD.test.ts`

**Interfaces:**
- Consumes: `HEADER_H`, `HUD_MARGIN`, `HUD_ROW_Y` (Task 5); `PALETTE.ui.header` (Task 1).
- Produces: no new exports; `HUD.render` keeps its current signature.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/ui/HUD.test.ts
describe('TX-1 layout (research §5a)', () => {
  it('paints a 40px blue header band', () => {
    const backend = new RecordingBackend();
    renderHud(backend); // existing helper in this file
    const header = backend.bands.find((b) => b.color === PALETTE.ui.header);
    expect(header).toBeDefined();
    expect(header!.y).toBe(0);
    expect(header!.h).toBe(HEADER_H);
  });

  it('moves SCORE and SPEED out of the header into the bottom corners', () => {
    const backend = new RecordingBackend();
    renderHud(backend);
    const low = backend.sprites.filter((s) => s.dy >= HUD_ROW_Y - 2);
    expect(low.length).toBeGreaterThan(0);
    // Some on the left, some on the right — the two corner readouts.
    expect(low.some((s) => s.dx < LOGICAL_WIDTH / 2)).toBe(true);
    expect(low.some((s) => s.dx > LOGICAL_WIDTH / 2)).toBe(true);
  });

  it('keeps every HUD glyph inside the safe margin', () => {
    const backend = new RecordingBackend();
    renderHud(backend);
    for (const s of backend.sprites) {
      expect(s.dx).toBeGreaterThanOrEqual(HUD_MARGIN);
      expect(s.dx + s.dw).toBeLessThanOrEqual(LOGICAL_WIDTH - HUD_MARGIN);
      expect(s.dy).toBeGreaterThanOrEqual(HUD_MARGIN - 6); // header text may sit at y=6
      expect(s.dy + s.dh).toBeLessThanOrEqual(LOGICAL_HEIGHT - HUD_MARGIN);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/HUD.test.ts`
Expected: FAIL — header is 24px and readouts are in the header.

- [ ] **Step 3: Rework the HUD layout**

In `src/ui/HUD.ts`, replace the header constants at `HUD.ts:29-38` with values derived from `HEADER_H`, and restructure `render`:

- **Header band (y=0..40):** STAGE label + value on the left; the 5-stage route tree centred; TIME to its right; the gold-star PASSED CARS gauge right-aligned.
- **Bottom corners (y=`HUD_ROW_Y`):** `SCORE <points>` left-aligned at x=`HUD_MARGIN`; `SPEED <kmh> km/h` right-aligned ending at `LOGICAL_WIDTH - HUD_MARGIN`.

Right-alignment needs the rendered width. `drawText` advances `(f.w + 1) * scale` per character (`src/ui/text.ts:29`), so add a small helper next to it:

```ts
// src/ui/text.ts
/** Rendered width of `text` at `scale`, matching drawText's advance exactly. */
export function textWidth(atlas: SpriteAtlas, text: string, scale = 2): number {
  let w = 0;
  for (const ch of text) {
    const name = frameName(ch);
    w += name !== null ? (atlas.frame(glyphFrameName(name)).w + 1) * scale : 4 * scale;
  }
  return w;
}
```

Then `const x = LOGICAL_WIDTH - HUD_MARGIN - textWidth(this.atlas, speedText, HUD.VALUE);`

Keep the existing `label()` / `value()` colour-narrowing wrappers (`HUD.ts:81-87`) — they encode the TX-1 colour scheme and should not be flattened.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/ui/HUD.test.ts src/ui/text.test.ts`
Expected: PASS. The 9 pre-existing HUD tests asserting old column positions must be rewritten against the new layout — that is expected work, not a regression.

- [ ] **Step 5: Commit**

```bash
git add src/ui/HUD.ts src/ui/HUD.test.ts src/ui/text.ts src/ui/text.test.ts
git commit -m "feat(hud): 40px TX-1 header with SCORE/SPEED moved to the bottom corners"
```

---

### Task 7: Enforce the 2×2 authoring grid

**Files:**
- Modify: `src/assets/spriteManifest.ts:121-168`
- Test: `src/assets/spriteManifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no new exports. Sprite *dimensions* change; **names do not**.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/assets/spriteManifest.test.ts
/**
 * The 2x2 virtual grid (research §1b) is what makes 480x270 read as 16-bit:
 * effective art resolution ~240x135 while the framebuffer stays 480x270.
 * A discipline that is not mechanised decays, so it is a test.
 */
const GRID_EXEMPT = (name: string): boolean =>
  name.startsWith('glyph_') || name.startsWith('digit_') || name === 'star_on' || name === 'star_off';

describe('2x2 virtual grid', () => {
  it('exempts only the 3x5 font and the 7x7 stars', () => {
    const exempt = SPRITE_MANIFEST.filter((e) => GRID_EXEMPT(e.name)).map((e) => e.name);
    const unexpected = exempt.filter(
      (n) => !n.startsWith('glyph_') && !n.startsWith('digit_') && n !== 'star_on' && n !== 'star_off',
    );
    expect(unexpected).toEqual([]);
  });

  it('authors every scenery and vehicle sprite on the 2x2 grid', () => {
    for (const e of SPRITE_MANIFEST) {
      if (GRID_EXEMPT(e.name)) continue;
      expect(e.w % 2, `${e.name}.w`).toBe(0);
      expect(e.h % 2, `${e.name}.h`).toBe(0);
      for (const [i, op] of e.ops.entries()) {
        expect(op.rx % 2, `${e.name} op${i}.rx`).toBe(0);
        expect(op.ry % 2, `${e.name} op${i}.ry`).toBe(0);
        expect(op.rw % 2, `${e.name} op${i}.rw`).toBe(0);
        expect(op.rh % 2, `${e.name} op${i}.rh`).toBe(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/assets/spriteManifest.test.ts`
Expected: FAIL — `bush` 14×12, `rock` 12×10, `sign` 14×22, `car0-3` 22×14, `player` 34×20 all have odd dimensions or odd ops. (`tree` 16×40 and `billboard` 28×24 already comply.)

- [ ] **Step 3: Round every non-exempt entry to the grid**

Edit `SPRITE_MANIFEST` (`spriteManifest.ts:121-168`). Round each `w`/`h` and every op's `rx`/`ry`/`rw`/`rh` to the nearest even number, keeping the silhouette. Suggested targets: `bush` 14×12, `rock` 12×10, `sign` 14×22 → `bush` 14×12 is already even in both; recheck each individually and fix only what the test reports.

⚠️ **Do not rename anything.** `src/track/schema.ts:27` builds `VALID_SPRITES` from these names and every track JSON validates against it.

⚠️ `billboard()` sets `anchorX: Math.floor(w / 2)` (`spriteManifest.ts:8`). With even `w` the anchor stays exact — no change needed.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. `packAtlas.test.ts` overlap and look-lock assertions must still hold.

- [ ] **Step 5: Commit**

```bash
git add src/assets/spriteManifest.ts src/assets/spriteManifest.test.ts
git commit -m "feat(art): enforce the 2x2 virtual authoring grid with a lint test"
```

---

### Task 8: Palette sampling script and Python dependency manifest

**Files:**
- Create: `scripts/sample_palette.py`
- Create: `scripts/requirements.txt`

**Interfaces:**
- Consumes: `public/assets/backgrounds/*.png`.
- Produces: a printed report only. A human accepts values into `palette.json` — the script never writes it.

- [ ] **Step 1: Create the dependency manifest**

No `requirements.txt` exists today; Pillow 12.3.0 is installed but undeclared.

```
# scripts/requirements.txt
Pillow>=10.0
```

- [ ] **Step 2: Write the sampler**

```python
#!/usr/bin/env python3
"""Report the dominant colours of each shipped backdrop plate.

The master palette's sky ramps are derived from the plates rather than invented,
because the plates are already on screen and already look right (spec A §2).
Re-run this after changing a plate and hand-accept the values into
src/assets/palette.json — this script deliberately does not write that file.

Usage: python3 scripts/sample_palette.py [--top N]
"""
import argparse
import pathlib
from collections import Counter

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PLATES = ROOT / "public" / "assets" / "backgrounds"


def dominants(path: pathlib.Path, top: int) -> list[tuple[str, float]]:
    im = Image.open(path).convert("RGB")
    # Right half is a mirror of the left (prep_backgrounds.py) — sample once.
    im = im.crop((0, 0, im.width // 2, im.height))
    total = im.width * im.height
    counts = Counter(im.getdata())
    return [("#%02x%02x%02x" % rgb, 100 * n / total) for rgb, n in counts.most_common(top)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args()

    for path in sorted(PLATES.glob("*.png")):
        im = Image.open(path)
        print(f"\n== {path.name}  {im.width}x{im.height}")
        for hex_code, pct in dominants(path, args.top):
            print(f"   {hex_code}  {pct:5.2f}%")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run it and confirm the palette matches**

Run: `python3 scripts/sample_palette.py`
Expected: the `sky.*` ramps in `palette.json` appear among the reported dominants. If a plate has changed since Task 1, update `palette.json` and re-run `npm test -- src/assets/palette.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add scripts/sample_palette.py scripts/requirements.txt
git commit -m "chore(scripts): add plate palette sampler and declare Pillow"
```

---

### Task 9: Full gate

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all green. Note the new total for `active-plan.md`.

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: clean — `tsc --noEmit` then a Vite production build.

- [ ] **Step 3: Human visual gate**

Run: `npm run dev`, then work through the spec's §9:
1. Drive all three plate stages (city → coastal → desert).
2. **The strobe check that matters:** full throttle on a straight, then crawl at ~20 km/h. Research §1d flags low speed as where stepping artifacts show. Kerb must read solid near the horizon and cleanly alternating near the car, with no flicker at either speed.
3. Road greys must read as *texture*. If you can see two distinct greys, they are too far apart — close the gap in `palette.json`.
4. Kerb red must not vibrate against foliage green. If it does, widen the shoulder past `1.22×`.
5. Screenshot each stage; check HUD legibility against all three plates and that the 40px header does not crowd the horizon.

- [ ] **Step 4: Record the outcome**

Update `active-plan.md` with the new test count and tick the Spec A items. If the grass banding stretch item (spec §4.4) was cut, **say so in the commit message** rather than dropping it silently.

- [ ] **Step 5: Commit**

```bash
git add active-plan.md
git commit -m "chore(plan): record Spec A completion and visual gate outcome"
```

---

## Self-Review Notes

**Spec coverage:** §3 palette → Tasks 1, 2, 8. §4.1 colours → Task 2. §4.2 shoulder → Task 4. §4.3 anti-strobe → Tasks 3, 4. §4.4 grass banding → **deliberately deferred**; it is perf-gated in the spec and should be attempted only after Task 9 establishes a baseline frame time. §5 layout → Tasks 5, 6. §6 grid → Task 7. §8 testing → distributed. §9 visual gate → Task 9.

**Known follow-up:** the grass banding stretch item has no task. Add one after measuring, or record the cut.
