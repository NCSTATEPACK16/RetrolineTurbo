# Playable PC Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Retroline Turbo from "all systems built, never tuned" to a game you sit down and play on a PC — a 4-speed manual gearbox with a real shift-point skill, a streaming CC0 soundtrack, and a live tuning overlay to make the feel pass tractable.

**Architecture:** A new pure `physics/gearbox.ts` module owns all torque/shift math (numbers in, numbers out, fully unit-testable) and is consumed by `Vehicle.step`. Widening the gearbox from 2 to 4 gears is a breaking type change across physics, economy and audio, so it lands as one atomic task. Music completes the layer Phase 10 §6 designed but deferred for lack of assets. The dev tuning overlay layers on top of `VehicleParams` via a separate `TuningOverrides` type so a dev tool can never redefine what a Phase 9 part is allowed to move.

**Tech Stack:** TypeScript (strict), Vitest, Vite, Web Audio API, Python 3 + ffmpeg (asset bake only).

**Spec:** `docs/superpowers/specs/2026-08-24-playable-pc-build-design.md`

## Global Constraints

- **Hard rule 3:** physics stays deterministic and fixed-timestep (1/60s); no time source inside `Vehicle`.
- **Hard rule 4:** no per-frame allocation in `render()` or the physics step.
- **Hard rule 5:** zero external deps in the engine core; Web Audio is browser-native and lives at the `audio/` edge.
- **`gearIdx` is 1-based** throughout `Vehicle.ts` and `engineTone.ts` (`const g = this.gearIdx - 1`). Preserve this; do not silently renumber.
- **Top speed stays exactly 290 km/h** — `TOP_SPEED_WORLD` derives from `GEAR_MAX_KMH[length-1]`.
- **Licence gate:** CC0 / CC-BY / OFL only. CC-BY-NC and CC-BY-SA are rejected.
- **Never throw at an asset edge** — missing/undecodable assets degrade to silence or a placeholder, matching `loadAtlases.ts`.
- Verification for every task: `npm test` and `npm run build` both green.
- **Python tests run under the project venv:** `.venv/bin/pytest`, *not* `python3 -m pytest` (system python3 has no pytest module).
- **Runtime smoke gate:** after any task touching the render, physics, or audio path (Tasks 1, 3, 4, 6, 7), also run `npm run visual-check`. It drives the car headlessly with Playwright, captures screenshots, samples ~3s of rAF timing, and reports console/page errors — catching "the game throws on load" or "framerate collapsed," which `npm test` cannot. Its own docstring is the honest caveat: *"a proxy, not a replacement for a human at `npm run dev` — static screenshots can't prove temporal properties (strobe, crawl)."* Treat a clean run as necessary, never sufficient.

**Loop boundary:** Tasks 1–7 are machine-verifiable and safe to automate. **Task 8 must not be automated** — its acceptance criterion is human judgement, and `visual-check` explicitly does not close that gate. A `/loop` driving this plan must stop when it reaches Task 8.

---

### Task 1: Commit the traffic-scale fix

Already written and green in the working tree; it just needs to stop living there. No TDD cycle — the tests already exist and pass.

**Files:**
- Modify: `src/engine/Renderer.ts` (uncommitted)
- Test: `src/engine/Renderer.test.ts` (uncommitted)

**Interfaces:**
- Consumes: nothing
- Produces: nothing new — this is a checkpoint commit

- [ ] **Step 1: Confirm the working tree holds only the traffic fix**

Run: `git status --short`
Expected: exactly two modified files, `src/engine/Renderer.ts` and `src/engine/Renderer.test.ts`. If anything else appears, stop and ask.

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: PASS — 61 files, 558 tests.

- [ ] **Step 3: Commit**

```bash
git add src/engine/Renderer.ts src/engine/Renderer.test.ts
git commit -m "fix(renderer): draw traffic cars from the baked atlas on the shared ladder

The 22x14 procedural placeholder never migrated onto Spec C's bake pipeline;
its tiny native footprint collapsed the ideal width to single digits at any
realistic passing distance, so traffic read as invisible specks. Route car0..3
onto the player's baked body set and the same 12-step ladder."
```

---

### Task 2: Pure gearbox math module

A new self-contained module so the torque curve is testable without constructing a `Vehicle`. This is where the shift-point skill actually lives.

**Files:**
- Create: `src/physics/gearbox.ts`
- Create: `src/physics/gearbox.test.ts`
- Modify: `src/constants.ts` (append gear constants; do **not** yet change `GEAR_MAX_KMH`/`GEAR_ACCEL_KMH_S` — Task 3 does that atomically)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export interface GearTable { maxKmh: readonly number[]; minKmh: readonly number[]; accelKmhS: readonly number[] }`
  - `export function gearTorque(kmh: number, g: number, t: GearTable): number` — `g` is **0-based** here (the caller converts from 1-based `gearIdx`)
  - `export function gearAccel(kmh: number, g: number, t: GearTable): number`
  - `export function shouldUpshift(kmh: number, g: number, t: GearTable): boolean`

- [ ] **Step 1: Add the shape constants to `src/constants.ts`**

Append near the existing gear constants (around line 75):

```ts
/** Bottom of each gear's torque band. Overlaps the previous gear's ceiling so
 * every gear has a usable window rather than one correct instant. */
export const GEAR_MIN_KMH = [0, 70, 120, 180] as const;
/** Exponent on the head-room term. Below 1 holds torque through the band then
 * drops it sharply near the ceiling — the shape a gear should have. */
export const TORQUE_SHAPE = 0.6;
/** Accel multiplier below a gear's band: the cost of upshifting too early. */
export const BOG_FACTOR = 0.35;
/** Decel applied when downshifting above a gear's ceiling (engine braking). */
export const ENGINE_BRAKE_KMH_S = 45;
```

- [ ] **Step 2: Write the failing tests**

Create `src/physics/gearbox.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gearTorque, gearAccel, shouldUpshift, type GearTable } from './gearbox.js';

const T: GearTable = {
  maxKmh:   [90, 150, 220, 290],
  minKmh:   [0,   70, 120, 180],
  accelKmhS:[95,  62,  38,  26],
};

describe('gearTorque', () => {
  it('is full torque at the bottom of a gear band', () => {
    expect(gearTorque(70, 1, T)).toBeCloseTo(1, 9);
  });

  it('decays to exactly zero at the gear ceiling (preserves the asymptote)', () => {
    expect(gearTorque(150, 1, T)).toBe(0);
    expect(gearTorque(290, 3, T)).toBe(0);
  });

  it('never goes negative above the ceiling', () => {
    expect(gearTorque(400, 3, T)).toBe(0);
  });

  it('is monotonically decreasing within a gear', () => {
    let prev = Infinity;
    for (let k = 70; k <= 150; k += 5) {
      const t = gearTorque(k, 1, T);
      expect(t).toBeLessThanOrEqual(prev);
      prev = t;
    }
  });
});

describe('gearAccel', () => {
  it('applies the bog penalty below the band', () => {
    // 50 km/h is below gear 2's 70 km/h floor -> full torque * BOG_FACTOR
    expect(gearAccel(50, 1, T)).toBeCloseTo(62 * 0.35, 6);
  });

  it('does not bog at exactly the band floor', () => {
    expect(gearAccel(70, 1, T)).toBeCloseTo(62, 6);
  });
});

describe('shouldUpshift', () => {
  // The derived result from the spec: the crossover lands exactly on the next
  // gear's band floor for every shift in the box.
  it.each([
    [0, 70],
    [1, 120],
    [2, 180],
  ])('gear %i upshifts exactly at %i km/h', (g, expected) => {
    expect(shouldUpshift(expected - 0.01, g, T)).toBe(false);
    expect(shouldUpshift(expected, g, T)).toBe(true);
  });

  it('is false in top gear — there is nothing to shift into', () => {
    expect(shouldUpshift(250, 3, T)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/physics/gearbox.test.ts`
Expected: FAIL — cannot resolve `./gearbox.js`.

- [ ] **Step 4: Implement `src/physics/gearbox.ts`**

```ts
/**
 * Pure gearbox math (spec: docs/superpowers/specs/2026-08-24-playable-pc-build-design.md §3).
 * Numbers in, numbers out — no Vehicle, no state, no dt — so the torque curve
 * and the shift point are unit-testable in isolation.
 *
 * Gear indices here are 0-BASED. `Vehicle.gearIdx` is 1-based; the caller
 * converts. That mismatch is deliberate: the 1-based convention is load-bearing
 * in Vehicle/engineTone, and arrays are 0-based everywhere else.
 */
import { TORQUE_SHAPE, BOG_FACTOR } from '../constants.js';

export interface GearTable {
  maxKmh: readonly number[];
  minKmh: readonly number[];
  accelKmhS: readonly number[];
}

/**
 * Head-room term, shaped. Reaches exactly 0 at the gear ceiling — Vehicle's
 * pre-existing `(1 - kmh/gearMax)` taper had that property and the speed-cap
 * tests depend on it, so reshaping must not introduce a non-zero floor.
 */
export function gearTorque(kmh: number, g: number, t: GearTable): number {
  const lo = t.minKmh[g]!;
  const hi = t.maxKmh[g]!;
  const span = hi - lo;
  if (span <= 0) return 0;
  const head = 1 - (kmh - lo) / span;
  if (head <= 0) return 0;
  return (head > 1 ? 1 : head) ** TORQUE_SHAPE;
}

/** Torque scaled by the gear's peak, with the mis-shift bog penalty applied. */
export function gearAccel(kmh: number, g: number, t: GearTable): number {
  const a = t.accelKmhS[g]! * gearTorque(kmh, g, t);
  return kmh < t.minKmh[g]! ? a * BOG_FACTOR : a;
}

/**
 * True when the next gear out-accelerates the current one. Torque is monotone
 * within a gear, so the two curves cross exactly once — the shift point is
 * unambiguous, which is what lets the HUD shift light be exact.
 */
export function shouldUpshift(kmh: number, g: number, t: GearTable): boolean {
  if (g >= t.maxKmh.length - 1) return false;
  return gearAccel(kmh, g + 1, t) > gearAccel(kmh, g, t);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/physics/gearbox.test.ts`
Expected: PASS — all tests.

- [ ] **Step 6: Full suite + build**

Run: `npm test && npm run build`
Expected: both green. Nothing else consumes `gearbox.ts` yet, so no regressions are possible.

- [ ] **Step 7: Commit**

```bash
git add src/physics/gearbox.ts src/physics/gearbox.test.ts src/constants.ts
git commit -m "feat(physics): pure 4-speed gearbox torque + shift-point math

Torque reshaped as head^0.6 so it holds through the band then falls sharply,
while still reaching exactly zero at the ceiling (the asymptote Vehicle's speed
-cap tests depend on). Below a gear's floor accel takes a 0.35x bog penalty, so
the crossover lands exactly on the next gear's floor for all three shifts."
```

---

### Task 3: Atomic 2-tuple → array migration

The breaking change. `VehicleParams.gearMaxKmh` is `readonly [number, number]`; four gears will not fit. Every consumer moves in one commit or the build is red midway.

**Files:**
- Modify: `src/constants.ts:70,75` — `GEAR_MAX_KMH`, `GEAR_ACCEL_KMH_S`
- Modify: `src/physics/Vehicle.ts:34-39` (types), `:130-146` (transmission + longitudinal)
- Modify: `src/economy/Garage.ts:54-55`
- Modify: `src/audio/engineTone.ts:8-14,26-40`
- Modify: `src/audio/SoundEngine.ts:151` (call site)
- Test: `src/physics/Vehicle.test.ts`, `src/economy/Garage.test.ts`, `src/audio/engineTone.test.ts`

**Interfaces:**
- Consumes: `gearAccel`, `GearTable` from Task 2
- Produces:
  - `VehicleParams.gearMaxKmh: readonly number[]`, `.gearAccelKmhS: readonly number[]`, new `.gearMinKmh: readonly number[]`
  - `EngineToneParams.fBase: readonly number[]` (replaces `fBaseLow`/`fBaseHigh`)

- [ ] **Step 1: Update the constants to four gears**

In `src/constants.ts`, replace lines 70 and 75:

```ts
export const GEAR_MAX_KMH = [90, 150, 220, 290] as const; // 4-speed ceilings
```
```ts
export const GEAR_ACCEL_KMH_S = [95, 62, 38, 26] as const; // peak accel per gear
```

Also replace the two engine-tone base constants (lines 125-126):

```ts
/** Per-gear oscillator base frequency; descending, so each upshift drops pitch. */
export const ENGINE_F_BASE = [90, 78, 68, 60] as const;
```

Delete `ENGINE_F_BASE_LOW` and `ENGINE_F_BASE_HIGH`.

- [ ] **Step 2: Update the tests to expect four gears (they will fail)**

`src/physics/Vehicle.test.ts` — the top-speed tests at ~lines 42-53 index `GEAR_MAX_KMH[0]`/`[1]`. The gear-1 test still holds. Change the top-speed test to drive through all four gears:

```ts
  it('reaches the top gear ceiling when shifted all the way up', () => {
    const v = new Vehicle(ROAD);
    // Upshift on the first step of each gear, then hold throttle.
    for (let g = 0; g < 3; g++) {
      run(v, 60 * 60, (c) => { c.throttle = 1; c.gearUp = true; });
    }
    run(v, 60 * 180, (c) => { c.throttle = 1; });
    expect(v.speedKmh).toBeLessThanOrEqual(GEAR_MAX_KMH[3]);
    expect(v.speedKmh).toBeGreaterThan(GEAR_MAX_KMH[3] * 0.95);
  });
```

At ~line 297, the 2-tuple literal becomes a 4-array:

```ts
    const fast: VehicleParams = { ...DEFAULT_VEHICLE_PARAMS, gearMaxKmh: [120, 200, 300, 580] };
```

`src/economy/Garage.test.ts` — the "readable envelope" assertion moves from index `[1]` to `[3]`:

```ts
    expect(metricsToParams({ ...BASELINE_METRICS, speed: METRIC_MAX }).gearMaxKmh[3]).toBeLessThan(400);
```

and the maxed-speed check at ~line 48:

```ts
    expect(fast.gearMaxKmh[3]).toBeGreaterThan(DEFAULT_VEHICLE_PARAMS.gearMaxKmh[3]!);
```

`src/audio/engineTone.test.ts` — replace the local table and params:

```ts
const GEAR_MAX_KMH = [90, 150, 220, 290] as const;
const PARAMS: EngineToneParams = {
  fBase: [90, 78, 68, 60],
  fRange: 260,
  filterMinHz: 400,
  filterMaxHz: 4000,
};
```

and the "uses the High-gear base" test becomes per-gear:

```ts
  it('uses the current gear base, not the first, once shifted up', () => {
    expect(computeEngineTone(0, 2, GEAR_MAX_KMH, PARAMS).frequency).toBe(PARAMS.fBase[1]);
    expect(computeEngineTone(0, 4, GEAR_MAX_KMH, PARAMS).frequency).toBe(PARAMS.fBase[3]);
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test`
Expected: FAIL — type errors on the tuple types and missing `fBase`.

- [ ] **Step 4: Widen `VehicleParams` and rewire the transmission**

In `src/physics/Vehicle.ts`, replace the interface (lines 34-39):

```ts
export interface VehicleParams {
  gearMaxKmh: readonly number[];
  gearMinKmh: readonly number[];
  gearAccelKmhS: readonly number[];
  steerMaxWps: number;
  centrifugal: number;
}
```

Add `gearMinKmh: GEAR_MIN_KMH` to `DEFAULT_VEHICLE_PARAMS`, importing `GEAR_MIN_KMH` and `ENGINE_BRAKE_KMH_S` from `../constants.js`.

Replace the transmission + throttle block (lines 130-146). Note the downshift now applies engine braking, and accel delegates to `gearAccel`:

```ts
    // -- transmission -------------------------------------------------------
    if (cmd.gearUp && this.gearIdx < this.params.gearMaxKmh.length) this.gearIdx++;
    if (cmd.gearDown && this.gearIdx > 1) this.gearIdx--;
    const g = this.gearIdx - 1;
    const gearMax = this.params.gearMaxKmh[g]!;
    const table: GearTable = {
      maxKmh: this.params.gearMaxKmh,
      minKmh: this.params.gearMinKmh,
      accelKmhS: this.params.gearAccelKmhS,
    };

    // -- longitudinal -------------------------------------------------------
    if (cmd.handbrake) {
      this.kmh -= HANDBRAKE_KMH_S * dt;
    } else if (cmd.brake > 0) {
      this.kmh -= BRAKE_KMH_S * cmd.brake * dt;
    } else if (this.kmh > gearMax) {
      // Downshifted below the current speed: engine braking drags it into band.
      this.kmh -= ENGINE_BRAKE_KMH_S * dt;
    } else if (cmd.throttle > 0) {
      this.kmh += gearAccel(this.kmh, g, table) * cmd.throttle * dt;
    } else {
      this.kmh -= COAST_KMH_S * dt;
    }
```

Import at the top: `import { gearAccel, type GearTable } from './gearbox.js';`

> **Allocation note (Hard rule 4):** the `table` object literal above allocates once per
> physics step. Hoist it to a private field built in the constructor and refreshed only when
> `params` changes. Do this now rather than as a follow-up.

- [ ] **Step 5: Update `Garage.ts` to map over all gears**

Replace lines 54-55 of `src/economy/Garage.ts`:

```ts
    gearMaxKmh: GEAR_MAX_KMH.map((v) => v * speedF),
    gearMinKmh: GEAR_MIN_KMH.map((v) => v * speedF),
    gearAccelKmhS: GEAR_ACCEL_KMH_S.map((v) => v * accelF),
```

Import `GEAR_MIN_KMH` alongside the existing constants. Scaling the floors by the same
`speedF` as the ceilings keeps the bands proportional, so a maxed loadout does not end up
with a floor above its own ceiling.

- [ ] **Step 6: Generalise `engineTone.ts` to N gears**

Replace the interface and the base-frequency lookup:

```ts
export interface EngineToneParams {
  fBase: readonly number[];
  fRange: number;
  filterMinHz: number;
  filterMaxHz: number;
}
```

```ts
export function computeEngineTone(
  kmh: number,
  gearIdx: number,
  gearMaxKmh: readonly number[],
  params: EngineToneParams,
): EngineTone {
  const cap = gearMaxKmh[gearIdx - 1] ?? gearMaxKmh[0]!;
  const raw = cap > 0 ? kmh / cap : 0;
  const ratio = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  const fBase = params.fBase[gearIdx - 1] ?? params.fBase[0]!;
  return {
    frequency: fBase + ratio * params.fRange,
    cutoff: params.filterMinHz + ratio * (params.filterMaxHz - params.filterMinHz),
  };
}
```

In `src/audio/SoundEngine.ts`, update the import and the call site (~line 151) to pass
`fBase: ENGINE_F_BASE` instead of `fBaseLow`/`fBaseHigh`.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: both green, all 558+ tests.

- [ ] **Step 8: Commit**

```bash
git add -A src/constants.ts src/physics src/economy src/audio
git commit -m "feat(physics): 4-speed manual gearbox with torque bands

Widens VehicleParams' gear tuples to arrays and adds gearMinKmh, migrating
every consumer in one change: Vehicle's transmission, Phase 9's part-mod
resolver (which must scale band floors by the same factor as ceilings, or a
maxed loadout gets a floor above its ceiling), and the engine-tone base
frequency, which becomes per-gear so each upshift drops pitch.

Downshifting above a gear's ceiling now applies engine braking, making the
downshift a corner-entry tactic rather than only a recovery."
```

---

### Task 4: HUD gear indicator + shift light

The teaching mechanism. Without it the shift point is invisible and the gearbox just feels punitive.

**Files:**
- Modify: `src/ui/HUD.ts`
- Test: `src/ui/HUD.test.ts`

**Interfaces:**
- Consumes: `shouldUpshift` (Task 2), `PlayerState.gear` / `.speed`
- Produces: nothing downstream

- [ ] **Step 1: Write the failing test**

Append to `src/ui/HUD.test.ts`:

```ts
describe('gear indicator and shift light', () => {
  it('renders the current gear number', () => {
    const out = draw({ gear: 3 });
    expect(out.texts.some((t) => t.text.includes('3'))).toBe(true);
  });

  it('lights the shift indicator exactly at the next gear band floor', () => {
    // gear 1 (0-based 0), floor of gear 2 is 70 km/h
    expect(draw({ gear: 1, speedKmh: 69 }).shiftLit).toBe(false);
    expect(draw({ gear: 1, speedKmh: 70 }).shiftLit).toBe(true);
  });

  it('never lights in top gear', () => {
    expect(draw({ gear: 4, speedKmh: 285 }).shiftLit).toBe(false);
  });
});
```

Match `draw()` to the existing helper's shape in this file — extend it with `gear`/`speedKmh` overrides and a `shiftLit` field rather than inventing a new harness.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/HUD.test.ts`
Expected: FAIL — `shiftLit` undefined.

- [ ] **Step 3: Implement**

In `src/ui/HUD.ts`, compute the light from the same predicate the physics uses — never a duplicated threshold:

```ts
const lit = shouldUpshift(state.speed * KMH_PER_WORLD, state.gear - 1, GEAR_TABLE);
```

Draw the gear digit in the bottom-right cluster alongside SPEED, and the shift light as a
filled band above it using `PALETTE.ui.gold` when lit and the dim UI grey when not. Reuse the
existing text/band helpers; add no new drawing primitives.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/HUD.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

```bash
npm test && npm run build
git add src/ui/HUD.ts src/ui/HUD.test.ts
git commit -m "feat(hud): gear indicator and shift light

The light reads the same shouldUpshift predicate the physics uses, so it can
never drift from the real crossover. It is what makes an invisible optimum
learnable without a tutorial."
```

---

### Task 5: Music bake script

Eyeless ships as 55.8 MB WAV / 19 MB FLAC. Shipping that raw blows `plan.md` §12 on its own.

**Files:**
- Create: `scripts/bake_music.py`
- Create: `scripts/test_bake_music.py`
- Create: `art/music/` (source drop directory, git-ignored)
- Modify: `art/LICENSES.md`
- Modify: `package.json` (add `bake:music` script)

**Interfaces:**
- Consumes: nothing
- Produces: `public/assets/music/<id>.ogg`, `<id>.mp3`, and `public/assets/music/manifest.json` shaped `{ "tracks": [{ "id": string, "ogg": string, "mp3": string, "seconds": number }] }`

- [ ] **Step 1: Write the failing test**

Create `scripts/test_bake_music.py`:

```python
import json, pathlib, sys
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from bake_music import build_manifest


def test_manifest_shape(tmp_path):
    out = tmp_path / "music"
    out.mkdir()
    (out / "chase.ogg").write_bytes(b"x")
    (out / "chase.mp3").write_bytes(b"x")
    m = build_manifest(out, {"chase": 128.5})
    assert m["tracks"] == [
        {"id": "chase", "ogg": "chase.ogg", "mp3": "chase.mp3", "seconds": 128.5}
    ]


def test_manifest_skips_tracks_missing_an_encoding(tmp_path):
    out = tmp_path / "music"
    out.mkdir()
    (out / "half.ogg").write_bytes(b"x")  # no .mp3 sibling
    assert build_manifest(out, {"half": 10.0})["tracks"] == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest scripts/test_bake_music.py -v`
Expected: FAIL — no module named `bake_music`.

- [ ] **Step 3: Implement `scripts/bake_music.py`**

```python
#!/usr/bin/env python3
"""Transcode source music into web-sized OGG + MP3 and emit a manifest.

Source tracks are CC0 but ship as 19-56 MB WAV/FLAC, which would blow plan.md
§12's download budget on a single track. ffmpeg does the transcode; this script
owns the encoding settings and the manifest contract so TypeScript has one
shape to parse -- the same split as imageops.py vs. the atlas manifest.

Both encodings are required per track: OGG for Firefox/Chrome, MP3 for Safari.
A track missing either is dropped from the manifest rather than shipped broken.
"""
import argparse, json, pathlib, subprocess, sys

OGG_QUALITY = "4"      # ~128kbps VBR -- transparent enough for a game bed
MP3_BITRATE = "128k"
ROOT = pathlib.Path(__file__).resolve().parent.parent


def probe_seconds(src: pathlib.Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(src)],
        capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()), 2)


def transcode(src: pathlib.Path, out_dir: pathlib.Path) -> None:
    stem = src.stem.lower().replace(" ", "_")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                    "-c:a", "libvorbis", "-q:a", OGG_QUALITY,
                    str(out_dir / f"{stem}.ogg")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                    "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
                    str(out_dir / f"{stem}.mp3")], check=True)


def build_manifest(out_dir: pathlib.Path, durations: dict[str, float]) -> dict:
    tracks = []
    for tid in sorted(durations):
        ogg, mp3 = out_dir / f"{tid}.ogg", out_dir / f"{tid}.mp3"
        if not (ogg.exists() and mp3.exists()):
            continue
        tracks.append({"id": tid, "ogg": ogg.name, "mp3": mp3.name,
                       "seconds": durations[tid]})
    return {"tracks": tracks}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "art" / "music"))
    ap.add_argument("--out", default=str(ROOT / "public" / "assets" / "music"))
    args = ap.parse_args(argv)

    src_dir, out_dir = pathlib.Path(args.src), pathlib.Path(args.out)
    if not src_dir.is_dir():
        print(f"no source dir: {src_dir}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    durations: dict[str, float] = {}
    for src in sorted(src_dir.iterdir()):
        if src.suffix.lower() not in {".wav", ".flac", ".mp3", ".ogg"}:
            continue
        print(f"==> {src.name}")
        transcode(src, out_dir)
        durations[src.stem.lower().replace(" ", "_")] = probe_seconds(src)

    manifest = build_manifest(out_dir, durations)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{len(manifest['tracks'])} track(s) -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest scripts/test_bake_music.py -v`
Expected: PASS — 2 tests.

- [ ] **Step 5: Record provenance**

Append to `art/LICENSES.md`:

```markdown
## Music

- **Retro Synthwave Music Pack** — https://swarajthegreat.itch.io/retro-synthwave-music-pack
  Licence: **CC0**. "Fully licensed under CC0, so you're free to use them in commercial and
  private projects without attribution." Verified 2026-08-24. No attribution required.
- **Eyeless (Retrowave)** by Never Sleep — https://opengameart.org/content/eyeless-retrowave
  Offered under CC-BY 4.0 / CC-BY 3.0 / **CC0**; taken under the **CC0** grant.
  Verified 2026-08-24. No attribution required.
```

Add `art/music/` to `.gitignore` — sources are large and re-downloadable; only the baked
output ships.

- [ ] **Step 6: Add the npm script and commit**

Add to `package.json` scripts: `"bake:music": "python3 scripts/bake_music.py"`

```bash
git add scripts/bake_music.py scripts/test_bake_music.py art/LICENSES.md package.json .gitignore
git commit -m "feat(assets): music bake pipeline (ffmpeg -> ogg+mp3 + manifest)

Source tracks are CC0 but 19-56 MB; raw they would blow plan.md §12 alone.
Both encodings are required per track (OGG for Chrome/Firefox, MP3 for Safari)
and a track missing either is dropped rather than shipped broken."
```

---

### Task 6: Stream music through the existing bus

Completes the layer `SoundEngine.ts:40-45` deferred for lack of assets. The `musicBus` and the Settings "Soundtrack" slider already exist and currently control nothing.

**Files:**
- Create: `src/audio/musicManifest.ts`
- Create: `src/audio/musicManifest.test.ts`
- Modify: `src/audio/SoundEngine.ts`
- Test: `src/audio/SoundEngine.test.ts`

**Interfaces:**
- Consumes: the manifest shape from Task 5
- Produces:
  - `export interface MusicTrack { id: string; ogg: string; mp3: string; seconds: number }`
  - `export function parseMusicManifest(json: unknown): MusicTrack[]`
  - `SoundEngine.playMusic(track: MusicTrack, baseUrl: string): void`
  - `SoundEngine.stopMusic(): void`

- [ ] **Step 1: Write the failing manifest test**

Create `src/audio/musicManifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseMusicManifest } from './musicManifest.js';

describe('parseMusicManifest', () => {
  it('parses a well-formed manifest', () => {
    const t = parseMusicManifest({ tracks: [
      { id: 'chase', ogg: 'chase.ogg', mp3: 'chase.mp3', seconds: 128.5 },
    ] });
    expect(t).toEqual([{ id: 'chase', ogg: 'chase.ogg', mp3: 'chase.mp3', seconds: 128.5 }]);
  });

  it('returns an empty list rather than throwing on garbage', () => {
    expect(parseMusicManifest(null)).toEqual([]);
    expect(parseMusicManifest({})).toEqual([]);
    expect(parseMusicManifest({ tracks: 'nope' })).toEqual([]);
  });

  it('drops malformed entries but keeps good ones', () => {
    const t = parseMusicManifest({ tracks: [
      { id: 'ok', ogg: 'a.ogg', mp3: 'a.mp3', seconds: 1 },
      { id: 'bad' },
    ] });
    expect(t.map((x) => x.id)).toEqual(['ok']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/audio/musicManifest.test.ts`
Expected: FAIL — cannot resolve `./musicManifest.js`.

- [ ] **Step 3: Implement `src/audio/musicManifest.ts`**

```ts
/**
 * Music manifest parsing. Contract copied deliberately from
 * `parseAtlasManifest` / `parseBackdropManifest`: never throws, returns an
 * empty list on anything malformed. A missing soundtrack must degrade to
 * silence, never take the game down.
 */
export interface MusicTrack {
  id: string;
  ogg: string;
  mp3: string;
  seconds: number;
}

function isTrack(v: unknown): v is MusicTrack {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.id === 'string' && typeof t.ogg === 'string'
    && typeof t.mp3 === 'string' && typeof t.seconds === 'number';
}

export function parseMusicManifest(json: unknown): MusicTrack[] {
  if (typeof json !== 'object' || json === null) return [];
  const tracks = (json as Record<string, unknown>).tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.filter(isTrack);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/audio/musicManifest.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add playback to `SoundEngine`**

Replace the scope note at `src/audio/SoundEngine.ts:40-45` — the reason for the deferral
(no assets) no longer holds. Add a private `<audio>` element wired through the existing
`musicBus`:

```ts
  private musicEl: HTMLAudioElement | null = null;
  private musicSrc: MediaElementAudioSourceNode | null = null;

  /** Stream a track through the existing music bus. Safari cannot play OGG, so
   * both encodings are offered and the browser picks. Never throws: no
   * AudioContext, a failed fetch, or a codec the browser rejects all degrade to
   * silence, matching loadAtlases' "never rejects" discipline. */
  playMusic(track: MusicTrack, baseUrl = '/assets/music/'): void {
    if (!this.ctx || !this.musicBus) return;
    this.stopMusic();
    try {
      const el = new Audio();
      el.loop = true;
      el.crossOrigin = 'anonymous';
      const canOgg = el.canPlayType('audio/ogg; codecs="vorbis"') !== '';
      el.src = baseUrl + (canOgg ? track.ogg : track.mp3);
      const src = this.ctx.createMediaElementSource(el);
      src.connect(this.musicBus);
      void el.play().catch(() => { /* autoplay blocked until resume(); fine */ });
      this.musicEl = el;
      this.musicSrc = src;
    } catch {
      this.musicEl = null;
      this.musicSrc = null;
    }
  }

  stopMusic(): void {
    this.musicEl?.pause();
    this.musicSrc?.disconnect();
    this.musicEl = null;
    this.musicSrc = null;
  }
```

- [ ] **Step 6: Add the regression guard**

Append to `src/audio/SoundEngine.test.ts` — matching the existing null-context pattern:

```ts
  it('playMusic and stopMusic are safe with no AudioContext', () => {
    const engine = new SoundEngine();
    const track = { id: 't', ogg: 't.ogg', mp3: 't.mp3', seconds: 1 };
    expect(() => engine.playMusic(track)).not.toThrow();
    expect(() => engine.stopMusic()).not.toThrow();
  });
```

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run build`
Expected: both green.

- [ ] **Step 8: Commit**

```bash
git add src/audio
git commit -m "feat(audio): stream music through the existing music bus

Completes the layer Phase 10 §6 designed and SoundEngine deferred for lack of
assets. Offers both encodings so Safari (no OGG) still plays, and degrades to
silence on any failure. The Settings 'Soundtrack' slider now controls something."
```

---

### Task 7: Dev tuning overlay

**Files:**
- Create: `src/ui-shell/screens/TuningOverlay.ts`
- Create: `src/physics/tuning.ts`
- Create: `src/physics/tuning.test.ts`
- Modify: `src/ui-shell/ShellRouter.ts` (register the route, DEV-gated)

**Interfaces:**
- Consumes: `VehicleParams` (Task 3)
- Produces:
  - `export interface TuningOverrides { torqueShape?: number; bogFactor?: number; skidCurveThreshold?: number; centrifugal?: number; steerRatePerS?: number; muOffroad?: number }`
  - `export function applyTuning(base: VehicleParams, o: TuningOverrides): VehicleParams`

- [ ] **Step 1: Write the failing test**

Create `src/physics/tuning.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyTuning } from './tuning.js';
import { DEFAULT_VEHICLE_PARAMS } from './Vehicle.js';

describe('applyTuning', () => {
  it('returns the base params unchanged when there are no overrides', () => {
    expect(applyTuning(DEFAULT_VEHICLE_PARAMS, {})).toEqual(DEFAULT_VEHICLE_PARAMS);
  });

  it('overrides only the named field', () => {
    const out = applyTuning(DEFAULT_VEHICLE_PARAMS, { centrifugal: 999 });
    expect(out.centrifugal).toBe(999);
    expect(out.gearMaxKmh).toEqual(DEFAULT_VEHICLE_PARAMS.gearMaxKmh);
  });

  it('never mutates the base object', () => {
    const before = { ...DEFAULT_VEHICLE_PARAMS };
    applyTuning(DEFAULT_VEHICLE_PARAMS, { centrifugal: 1 });
    expect(DEFAULT_VEHICLE_PARAMS).toEqual(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/physics/tuning.test.ts`
Expected: FAIL — cannot resolve `./tuning.js`.

- [ ] **Step 3: Implement `src/physics/tuning.ts`**

```ts
/**
 * Dev-only tuning layer. Deliberately NOT part of VehicleParams: that type
 * carries exactly the four metrics a Phase 9 parts loadout may move, and
 * Vehicle.ts states the intent outright -- "parts alter the metric surface
 * described in the spec, nothing more". Widening it would let a dev slider
 * quietly redefine what a *part* can do. Two concerns, two types.
 */
import type { VehicleParams } from './Vehicle.js';

export interface TuningOverrides {
  torqueShape?: number;
  bogFactor?: number;
  skidCurveThreshold?: number;
  centrifugal?: number;
  steerRatePerS?: number;
  muOffroad?: number;
}

export function applyTuning(base: VehicleParams, o: TuningOverrides): VehicleParams {
  return {
    ...base,
    centrifugal: o.centrifugal ?? base.centrifugal,
  };
}
```

> Fields that are module constants rather than `VehicleParams` members
> (`torqueShape`, `bogFactor`, `skidCurveThreshold`, `steerRatePerS`, `muOffroad`) are
> threaded into `Vehicle` in the same step by widening its constructor to take an optional
> `TuningOverrides` and reading `o.x ?? MODULE_CONSTANT` at each use site. Keep the
> production default `{}` so behaviour is byte-identical when the overlay is absent.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/physics/tuning.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the overlay screen**

Create `src/ui-shell/screens/TuningOverlay.ts` following the existing `SettingsScreen.ts`
pattern (`rt-col` rows). Reuse the shared slider builder — its exact signature is:

```ts
buildSlider(value: number, min: number, max: number, step: number,
            onInput: (v: number) => void): HTMLInputElement
```

imported from `src/ui-shell/components/slider.ts`. One slider per `TuningOverrides` field plus
the four gear arrays, and a **Copy constants** button that writes a paste-able `constants.ts`
block to the clipboard.

Register in `ShellRouter` behind a DEV guard so it cannot reach production:

```ts
if (import.meta.env.DEV) routes.tuning = makeTuningOverlay(bridge);
```

- [ ] **Step 6: Full suite + commit**

```bash
npm test && npm run build
git add src/physics/tuning.ts src/physics/tuning.test.ts src/ui-shell
git commit -m "feat(dev): live physics tuning overlay behind a DEV guard

Kept off VehicleParams on purpose: that type means 'what a Phase 9 part may
move', and a dev slider must not be able to redefine it. Turns every feel
question from an edit-rebuild-drive cycle into a slider drag."
```

---

### Task 8: Feel pass — HUMAN ONLY

> **STOP. An automated runner must halt here and hand back to the user.**
> This task's acceptance criterion is "is it fun," which no test asserts and no agent can
> evaluate. A loop turned loose here will retune constants indefinitely against no signal.

- [ ] **Step 1:** Run `npm run dev`, open the tuning overlay, drive the track.
- [ ] **Step 2:** Tune until the gearbox reads as demanding rather than fiddly, and 290 km/h feels dangerous rather than floaty. Pay attention to the 2→3 shift — its +3.6 margin is the narrowest in the box and the most likely to feel mushy.
- [ ] **Step 3:** Press **Copy constants**, paste the block into `src/constants.ts`.
- [ ] **Step 4:** Run `npm test` — the gearbox tests encode the *shape* of the curve, not the exact constants, but the shift-point expectations in `gearbox.test.ts` assume the default table. Update those expected values if the bands moved.
- [ ] **Step 5:** Commit the tuned constants.
- [ ] **Step 6:** Capture any follow-on work discovered while driving (traffic density, corner severity, engine pitch) as new tasks rather than widening this plan.

---

## Self-Review

**Spec coverage:** §1 audit → Task 1. §3a-3c gearbox → Tasks 2-3. §3d HUD → Task 4. §3e engine audio → Task 3 Step 6. §3f blast radius → Task 3 (all six files). §4a assets → Task 5 Step 5. §4b bake script → Task 5. §4c wiring → Task 6. §5 overlay → Task 7. §6 feel pass → Task 8. §7 testing → distributed. §8 execution → the loop boundary note in Global Constraints. No gaps.

**Type consistency:** `GearTable` is 0-based and defined once (Task 2), consumed by Task 3 and Task 4. `gearIdx` stays 1-based at every `Vehicle`/`engineTone` boundary with the `- 1` conversion explicit. `MusicTrack` defined in Task 6 Step 3, consumed by Task 6 Step 5 and Task 5's manifest contract. `TuningOverrides` defined in Task 7 and used nowhere earlier.

**Known sharp edges, flagged rather than hidden:**
- Task 3 Step 4's `table` literal allocates per physics step; the step says to hoist it, but a reviewer should verify it actually was.
- Task 7 Step 3's `applyTuning` only threads `centrifugal` through `VehicleParams`; the other five fields need `Vehicle`'s constructor widened in the same step. This is the least-specified part of the plan and the most likely to need a judgement call.
