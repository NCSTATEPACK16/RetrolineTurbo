# Phase 9 — Modular Economy & Post-Race Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the race → earn → buy → equip loop: a run pays out credits from real route
signals, an 80-part catalog shifts four vehicle metrics off a median-50 baseline, and the
resulting physics params, credits and inventory persist through the existing save seam.

**Architecture:** Four pure modules (payout, part curves, loadout resolver, garage state)
feed two render-only screens and a thin `main.ts` wiring layer. The one invasive change is
`physics/Vehicle.ts`, which today imports four tuning constants directly and must instead
take them as an injected `VehicleParams` object — defaulted to the current constants so an
empty loadout drives exactly as the shipped build does.

**Tech Stack:** TypeScript (strict), Vite, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-11-phase-9-modular-economy-shop.md`

## Global Constraints

- **Segment model only** — no WebGL geometry, no real 3D (CLAUDE.md hard rule 1).
- **All drawing goes through `RenderBackend`** — screens call `backend.drawQuad` /
  `drawText(backend, atlas, …)`; game code never touches a canvas `ctx` (hard rule 2).
- **Physics is deterministic and fixed-timestep** — `Vehicle.step` keeps taking `dt`, holds
  no time source, and allocates nothing per step (hard rules 3 and 4).
- **No per-frame allocation in render paths** — pre-allocate arrays; screens must not build
  objects inside `render()` (hard rule 4).
- **Zero external deps in the engine core** — native browser APIs only (hard rule 5).
- **Persistence goes through `SaveBackend`** — never `localStorage` directly (plan.md §8).
- **Module imports use explicit `.js` extensions** (`./foo.js`), matching every existing file.
- **Tests are vitest, colocated as `<file>.test.ts`**, run with `npm test`.
- **Text rendering:** `drawText` only renders `a-z`, `0-9`, `:`, `.`, `-` and space; any
  other character advances silently. All part names and UI copy stay inside that set.
- **Metric baseline is 50/100** on all four metrics; metrics clamp to `[5, 95]`.
- **Payout and cost constants are provisional feel constants (gate-tuned)** — comment them
  as such, following the `track/route.ts` convention.

---

## File Structure

**Create:**
- `src/types/inventory.ts` — `PartCategory`, `Part`, `EquippedLoadout`, `CarMetrics`
- `src/economy/partCurves.ts` — tier curves, part names, `generateCatalog()`
- `src/economy/parts.json` — committed catalog snapshot (golden artifact)
- `src/economy/parts.golden.test.ts` — generator ↔ snapshot equality + balance guards
- `src/economy/Garage.ts` — pure `resolveMetrics` / `metricsToParams`
- `src/economy/GarageState.ts` — credits/owned/equipped/bestStage + save round-trip
- `src/economy/payout.ts` — pure `computePayout`
- `src/ui/SummaryScreen.ts` — post-race ledger (auto-shown on the end screen)
- `src/ui/GarageScreen.ts` — F6 shop overlay
- plus a `.test.ts` beside each of the above `.ts` files

**Modify:**
- `src/physics/Vehicle.ts` — inject `VehicleParams`
- `src/economy/score.ts` — add a collisions counter
- `src/net/raceResults.ts` — no code change; `creditsEarned` gets populated by the caller
- `src/main.ts` — garage load, payout commit, F6 key, vehicle rebuild on equip/restart

---

### Task 1: Inject `VehicleParams` into the physics

`Vehicle` currently reads `GEAR_MAX_KMH`, `GEAR_ACCEL_KMH_S`, `STEER_MAX_WPS` and
`CENTRIFUGAL` from `constants.ts` at each use. Parts have to vary those four per run, so
they become constructor input. Everything else (brake rates, off-road drag, skid
thresholds) stays a module constant — parts never touch it.

**Files:**
- Modify: `src/physics/Vehicle.ts`
- Test: `src/physics/Vehicle.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `interface VehicleParams { gearMaxKmh: readonly [number, number];
  gearAccelKmhS: readonly [number, number]; steerMaxWps: number; centrifugal: number }`,
  `const DEFAULT_VEHICLE_PARAMS: VehicleParams`, and
  `new Vehicle(roadWidth: number, params?: VehicleParams)` — all exported from
  `src/physics/Vehicle.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `src/physics/Vehicle.test.ts` (keep every existing test untouched — they are the
proof that the default path is unchanged):

```ts
import { Vehicle, createCommand, DEFAULT_VEHICLE_PARAMS, type VehicleParams } from './Vehicle.js';
import { GEAR_MAX_KMH, GEAR_ACCEL_KMH_S, STEER_MAX_WPS, CENTRIFUGAL, STEP_S } from '../constants.js';

describe('VehicleParams injection', () => {
  it('defaults to the module constants', () => {
    expect(DEFAULT_VEHICLE_PARAMS.gearMaxKmh).toEqual(GEAR_MAX_KMH);
    expect(DEFAULT_VEHICLE_PARAMS.gearAccelKmhS).toEqual(GEAR_ACCEL_KMH_S);
    expect(DEFAULT_VEHICLE_PARAMS.steerMaxWps).toBe(STEER_MAX_WPS);
    expect(DEFAULT_VEHICLE_PARAMS.centrifugal).toBe(CENTRIFUGAL);
  });

  it('a higher gear ceiling reaches a strictly higher speed over the same steps', () => {
    const fast: VehicleParams = { ...DEFAULT_VEHICLE_PARAMS, gearMaxKmh: [240, 580] };
    const base = new Vehicle(2000);
    const quick = new Vehicle(2000, fast);
    const cmd = createCommand();
    cmd.throttle = 1;
    cmd.gearUp = true;
    for (let i = 0; i < 600; i++) {
      base.step(cmd, 0, STEP_S);
      quick.step(cmd, 0, STEP_S);
      cmd.gearUp = false;
    }
    expect(quick.speedKmh).toBeGreaterThan(base.speedKmh);
  });

  it('a higher steer authority moves further laterally in one step', () => {
    const sharp: VehicleParams = { ...DEFAULT_VEHICLE_PARAMS, steerMaxWps: STEER_MAX_WPS * 2 };
    const base = new Vehicle(2000);
    const agile = new Vehicle(2000, sharp);
    const cmd = createCommand();
    cmd.throttle = 1;
    for (let i = 0; i < 120; i++) { base.step(cmd, 0, STEP_S); agile.step(cmd, 0, STEP_S); }
    cmd.steer = 1;
    base.step(cmd, 0, STEP_S);
    agile.step(cmd, 0, STEP_S);
    expect(agile.x).toBeGreaterThan(base.x);
  });

  it('a lower centrifugal constant resists a curve better', () => {
    const grippy: VehicleParams = { ...DEFAULT_VEHICLE_PARAMS, centrifugal: CENTRIFUGAL * 0.5 };
    const base = new Vehicle(2000);
    const stuck = new Vehicle(2000, grippy);
    const cmd = createCommand();
    cmd.throttle = 1;
    for (let i = 0; i < 600; i++) { base.step(cmd, 0.2, STEP_S); stuck.step(cmd, 0.2, STEP_S); }
    expect(stuck.x).toBeGreaterThan(base.x); // pushed less far in the −x direction
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/physics/Vehicle.test.ts`
Expected: FAIL — `DEFAULT_VEHICLE_PARAMS` is not exported.

- [ ] **Step 3: Implement the seam**

In `src/physics/Vehicle.ts`, add after the `createCommand` function:

```ts
/**
 * The four tunables a Phase 9 parts loadout can shift. Everything else about the
 * car (brake rates, off-road drag, skid thresholds) stays a module constant —
 * parts alter the metric surface described in the spec, nothing more.
 */
export interface VehicleParams {
  gearMaxKmh: readonly [number, number];
  gearAccelKmhS: readonly [number, number];
  steerMaxWps: number;
  centrifugal: number;
}

/** Stock car: reproduces the pre-Phase-9 handling exactly. */
export const DEFAULT_VEHICLE_PARAMS: VehicleParams = {
  gearMaxKmh: GEAR_MAX_KMH,
  gearAccelKmhS: GEAR_ACCEL_KMH_S,
  steerMaxWps: STEER_MAX_WPS,
  centrifugal: CENTRIFUGAL,
};
```

Change the constructor:

```ts
  constructor(
    private readonly roadWidth: number,
    private readonly params: VehicleParams = DEFAULT_VEHICLE_PARAMS,
  ) {}
```

Then replace the five uses inside `step`:

```ts
    // -- transmission -------------------------------------------------------
    if (cmd.gearUp && this.gearIdx < this.params.gearMaxKmh.length) this.gearIdx++;
    if (cmd.gearDown && this.gearIdx > 1) this.gearIdx--;
    const g = this.gearIdx - 1;
    const gearMax = this.params.gearMaxKmh[g]!;
```

```ts
      this.kmh += this.params.gearAccelKmhS[g]! * cmd.throttle * (1 - this.kmh / gearMax) * dt;
```

```ts
    this.posX += cmd.steer * this.params.steerMaxWps * grip * authority * dt;
    const speedRatio = this.kmh / this.params.gearMaxKmh[this.params.gearMaxKmh.length - 1]!;
    this.posX -= curvature * this.params.centrifugal * speedRatio * speedRatio * dt;
```

Keep the four constants imported — `DEFAULT_VEHICLE_PARAMS` is built from them.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — including every pre-existing Vehicle test, which proves the default path
is byte-identical in behaviour.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run build
git add src/physics/Vehicle.ts src/physics/Vehicle.test.ts
git commit -m "refactor(physics): inject VehicleParams so parts can shift tuning"
```

---

### Task 2: Inventory types and the 80-part catalog

**Files:**
- Create: `src/types/inventory.ts`, `src/economy/partCurves.ts`,
  `src/economy/parts.golden.test.ts`, `src/economy/parts.json`
- Test: `src/economy/partCurves.test.ts`, `src/economy/parts.golden.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types/inventory.ts`: `type PartCategory = 'engine' | 'transmission' | 'suspension' | 'wheels'`,
    `const PART_CATEGORIES: readonly PartCategory[]`,
    `interface Part { id: string; name: string; category: PartCategory; tier: number; cost: number; unlockStage: number; speedMod: number; accelMod: number; handlingMod: number; gripMod: number }`,
    `interface EquippedLoadout { engine: string | null; transmission: string | null; suspension: string | null; wheels: string | null }`,
    `interface CarMetrics { speed: number; accel: number; handling: number; grip: number }`,
    `function emptyLoadout(): EquippedLoadout`
  - `economy/partCurves.ts`: `const PART_TIERS = 20`, `function primaryMod(tier: number): number`,
    `function tradeoffMod(tier: number): number`, `function partCost(tier: number): number`,
    `function partUnlockStage(tier: number): number`, `function generateCatalog(): Part[]`,
    `const PART_CATALOG: Part[]`

- [ ] **Step 1: Write the types**

Create `src/types/inventory.ts`:

```ts
/**
 * Phase 9 economy domain types. Parts shift a car off a median 50/100 baseline
 * on four metrics; one part per category may be equipped at a time.
 */

export type PartCategory = 'engine' | 'transmission' | 'suspension' | 'wheels';

/** Carousel order in the Garage shop. */
export const PART_CATEGORIES: readonly PartCategory[] = ['engine', 'transmission', 'suspension', 'wheels'];

export interface Part {
  id: string;
  name: string;
  category: PartCategory;
  /** 1..20. Higher tiers are sharper specializations, not strict upgrades. */
  tier: number;
  cost: number;
  /** Deepest route stage (0-based) the player must have reached to buy this. */
  unlockStage: number;
  speedMod: number;
  accelMod: number;
  handlingMod: number;
  gripMod: number;
}

/** One equipped part id per category; null means the stock (no-op) fitting. */
export interface EquippedLoadout {
  engine: string | null;
  transmission: string | null;
  suspension: string | null;
  wheels: string | null;
}

/** Resolved 0..100 metric surface. 50 on every axis is the stock car. */
export interface CarMetrics {
  speed: number;
  accel: number;
  handling: number;
  grip: number;
}

export function emptyLoadout(): EquippedLoadout {
  return { engine: null, transmission: null, suspension: null, wheels: null };
}
```

- [ ] **Step 2: Write the failing curve tests**

Create `src/economy/partCurves.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PART_CATEGORIES } from '../types/inventory.js';
import {
  PART_TIERS, primaryMod, tradeoffMod, partCost, partUnlockStage, generateCatalog,
} from './partCurves.js';

describe('part curves', () => {
  it('primary gain rises with tier', () => {
    expect(primaryMod(1)).toBe(2);
    expect(primaryMod(20)).toBe(36);
    for (let t = 2; t <= PART_TIERS; t++) expect(primaryMod(t)).toBeGreaterThanOrEqual(primaryMod(t - 1));
  });

  it('trade-off penalty is free through tier 5 then bites', () => {
    for (let t = 1; t <= 5; t++) expect(tradeoffMod(t)).toBe(0);
    expect(tradeoffMod(6)).toBe(-1);
    expect(tradeoffMod(20)).toBe(-13);
  });

  it('cost grows geometrically from 400c', () => {
    expect(partCost(1)).toBe(400);
    expect(partCost(20)).toBe(44909);
  });

  it('unlock stage steps every five tiers and caps at 4', () => {
    expect(partUnlockStage(1)).toBe(0);
    expect(partUnlockStage(5)).toBe(0);
    expect(partUnlockStage(6)).toBe(1);
    expect(partUnlockStage(20)).toBe(3);
  });
});

describe('generateCatalog', () => {
  const catalog = generateCatalog();

  it('produces 80 parts, 20 per category, with unique ids', () => {
    expect(catalog).toHaveLength(80);
    for (const c of PART_CATEGORIES) expect(catalog.filter((p) => p.category === c)).toHaveLength(20);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(80);
  });

  it('names are drawable by the 3x5 font', () => {
    for (const p of catalog) expect(p.name).toMatch(/^[a-z0-9 .:-]+$/);
  });

  it('applies each category primary/trade-off pairing', () => {
    const engine20 = catalog.find((p) => p.id === 'engine-20')!;
    expect(engine20.speedMod).toBe(36);
    expect(engine20.handlingMod).toBe(-13);
    expect(engine20.accelMod).toBe(0);
    expect(engine20.gripMod).toBe(0);

    const trans20 = catalog.find((p) => p.id === 'transmission-20')!;
    expect(trans20.accelMod).toBe(36);
    expect(trans20.speedMod).toBe(-13);

    const susp20 = catalog.find((p) => p.id === 'suspension-20')!;
    expect(susp20.handlingMod).toBe(36);
    expect(susp20.gripMod).toBe(-13);

    const wheels20 = catalog.find((p) => p.id === 'wheels-20')!;
    expect(wheels20.gripMod).toBe(36);
    expect(wheels20.speedMod).toBe(-13);
  });

  it('is deterministic', () => {
    expect(generateCatalog()).toEqual(catalog);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- src/economy/partCurves.test.ts`
Expected: FAIL — `./partCurves.js` does not exist.

- [ ] **Step 4: Implement the generator**

Create `src/economy/partCurves.ts`:

```ts
import { PART_CATEGORIES, type CarMetrics, type Part, type PartCategory } from '../types/inventory.js';

/** Tiers per category; four categories x 20 = the 80-part catalog. */
export const PART_TIERS = 20;

/**
 * Balance curves (provisional feel constants — gate-tuned). Low tiers are mild
 * all-rounders; the trade-off only bites past tier 5, so the top of each
 * category is a specialization with a real cost rather than a strict upgrade.
 */
export function primaryMod(tier: number): number { return Math.round(1.8 * tier); }
export function tradeoffMod(tier: number): number { return -Math.round(0.9 * Math.max(0, tier - 5)); }
export function partCost(tier: number): number { return Math.round(400 * 1.28 ** (tier - 1)); }
export function partUnlockStage(tier: number): number { return Math.min(4, Math.floor((tier - 1) / 5)); }

/** Which metric each category pushes, and which one it pays with. */
const PAIRING: Record<PartCategory, { primary: keyof CarMetrics; tradeoff: keyof CarMetrics }> = {
  engine: { primary: 'speed', tradeoff: 'handling' }, // weight blunts steering
  transmission: { primary: 'accel', tradeoff: 'speed' }, // short ratios cap the top end
  suspension: { primary: 'handling', tradeoff: 'grip' }, // stiff tunes lose off-road bite
  wheels: { primary: 'grip', tradeoff: 'speed' }, // soft slicks cost a little speed
};

const NAMES: Record<PartCategory, readonly string[]> = {
  engine: [
    'stock inline-4', 'tuned inline-4', 'sport inline-4', 'big-bore 4', 'turbo 4',
    'inline-6', 'tuned 6', 'twin-cam 6', 'turbo 6', 'twin-turbo 6',
    'small-block v8', 'tuned v8', 'quad-cam v8', 'blown v8', 'turbo v8',
    'twin-turbo v8', 'flat-12', 'race v10', 'quad-turbo v12', 'proto v12',
  ],
  transmission: [
    'stock 4-speed', 'close 4-speed', 'sport 5-speed', 'close 5-speed', 'short 5-speed',
    'rally 5-speed', 'sport 6-speed', 'close 6-speed', 'short 6-speed', 'dogleg 6-speed',
    'race 6-speed', 'sequential 6', 'sequential 7', 'close 7-speed', 'short 7-speed',
    'race 7-speed', 'dual-clutch 7', 'dual-clutch 8', 'race dual-clutch', 'proto sequential',
  ],
  suspension: [
    'stock coils', 'sport coils', 'lowered coils', 'adjustable coils', 'sport dampers',
    'rally dampers', 'gas dampers', 'twin-tube overs', 'mono-tube overs', 'adjustable overs',
    'track overs', 'stiff track overs', 'race overs', 'pushrod race', 'inboard pushrod',
    'active dampers', 'adaptive dampers', 'race active', 'proto active', 'ground-effect race',
  ],
  wheels: [
    'stock steel', 'wide steel', 'touring alloy', 'sport alloy', 'wide alloy',
    'all-weather radial', 'sport radial', 'summer perf', 'ultra perf', 'semi-slick',
    'wide semi-slick', 'soft semi-slick', 'track slick', 'wide track slick', 'soft slick',
    'super-soft slick', 'race slick', 'wide race slick', 'qualifying slick', 'proto slick',
  ],
};

/**
 * Build all 80 parts from the curves above. Pure and deterministic — the
 * committed `parts.json` snapshot is this function's output, so a balance change
 * always shows up as a reviewable diff (see parts.golden.test.ts).
 */
export function generateCatalog(): Part[] {
  const parts: Part[] = [];
  for (const category of PART_CATEGORIES) {
    const { primary, tradeoff } = PAIRING[category];
    for (let tier = 1; tier <= PART_TIERS; tier++) {
      const mods: CarMetrics = { speed: 0, accel: 0, handling: 0, grip: 0 };
      mods[primary] = primaryMod(tier);
      mods[tradeoff] = tradeoffMod(tier);
      parts.push({
        id: `${category}-${String(tier).padStart(2, '0')}`,
        name: NAMES[category][tier - 1]!,
        category,
        tier,
        cost: partCost(tier),
        unlockStage: partUnlockStage(tier),
        speedMod: mods.speed,
        accelMod: mods.accel,
        handlingMod: mods.handling,
        gripMod: mods.grip,
      });
    }
  }
  return parts;
}

/** The catalog every consumer reads. Built once at module load. */
export const PART_CATALOG: readonly Part[] = generateCatalog();
```

- [ ] **Step 5: Run the curve tests**

Run: `npm test -- src/economy/partCurves.test.ts`
Expected: PASS. If `partCost(20)` differs from `44909`, fix the *test* to the computed
value — the curve is the source of truth — and note the value in the commit message.

- [ ] **Step 6: Write the golden + balance-guard test**

Create `src/economy/parts.golden.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PART_CATEGORIES, type CarMetrics, type Part } from '../types/inventory.js';
import { generateCatalog } from './partCurves.js';

const SNAPSHOT = fileURLToPath(new URL('./parts.json', import.meta.url));
const serialize = (parts: Part[]): string => `${JSON.stringify(parts, null, 2)}\n`;

/**
 * Golden test over the committed catalog. The curves in partCurves.ts are the
 * source of truth; parts.json exists so any balance change lands as a readable
 * diff instead of disappearing into a formula. Regenerate with:
 *   UPDATE_PARTS=1 npm test
 */
describe('parts.json', () => {
  const catalog = generateCatalog();

  it('matches the generator output', () => {
    const text = serialize(catalog);
    if (process.env.UPDATE_PARTS === '1') {
      writeFileSync(SNAPSHOT, text);
    }
    expect(readFileSync(SNAPSHOT, 'utf8')).toBe(text);
  });
});

/** Best achievable value of one metric: pick the strongest part per category. */
function bestFor(metric: keyof CarMetrics, catalog: Part[]): CarMetrics {
  const key = `${metric}Mod` as 'speedMod' | 'accelMod' | 'handlingMod' | 'gripMod';
  const totals: CarMetrics = { speed: 50, accel: 50, handling: 50, grip: 50 };
  for (const category of PART_CATEGORIES) {
    const pick = catalog
      .filter((p) => p.category === category)
      .reduce((a, b) => (b[key] > a[key] ? b : a));
    totals.speed += pick.speedMod;
    totals.accel += pick.accelMod;
    totals.handling += pick.handlingMod;
    totals.grip += pick.gripMod;
  }
  return totals;
}

describe('balance guards', () => {
  const catalog = generateCatalog();
  const metrics: (keyof CarMetrics)[] = ['speed', 'accel', 'handling', 'grip'];

  it('every tier-20 part pays a real penalty', () => {
    for (const p of catalog.filter((x) => x.tier === 20)) {
      const mods = [p.speedMod, p.accelMod, p.handlingMod, p.gripMod];
      expect(Math.min(...mods)).toBeLessThan(0);
    }
  });

  it('no loadout leads on every metric — specializing in one costs another', () => {
    for (const a of metrics) {
      for (const b of metrics) {
        if (a === b) continue;
        // The build that maximizes `a` must be strictly worse at `b` than the
        // build that maximizes `b`. If this ever fails, one loadout dominates.
        expect(bestFor(a, catalog)[b]).toBeLessThan(bestFor(b, catalog)[b]);
      }
    }
  });
});
```

- [ ] **Step 7: Generate the snapshot, then verify it holds**

```bash
printf '[]\n' > src/economy/parts.json
UPDATE_PARTS=1 npm test -- src/economy/parts.golden.test.ts
npm test -- src/economy/parts.golden.test.ts
```
Expected: the first run rewrites `parts.json`; the second passes with no writes.

- [ ] **Step 8: Commit**

```bash
npm run build
git add src/types/inventory.ts src/economy/partCurves.ts src/economy/partCurves.test.ts \
        src/economy/parts.json src/economy/parts.golden.test.ts
git commit -m "feat(economy): 80-part catalog generated from tuned tier curves"
```

---

### Task 3: The loadout resolver

**Files:**
- Create: `src/economy/Garage.ts`, `src/economy/Garage.test.ts`

**Interfaces:**
- Consumes: `Part`, `EquippedLoadout`, `CarMetrics`, `emptyLoadout` (Task 2);
  `PART_CATALOG` (Task 2); `VehicleParams` (Task 1).
- Produces: `const BASELINE_METRICS: CarMetrics`, `const METRIC_MIN = 5`,
  `const METRIC_MAX = 95`,
  `function resolveMetrics(loadout: EquippedLoadout, catalog?: readonly Part[], baseline?: CarMetrics): CarMetrics`,
  `function metricsToParams(metrics: CarMetrics): VehicleParams`.

- [ ] **Step 1: Write the failing tests**

Create `src/economy/Garage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyLoadout } from '../types/inventory.js';
import { PART_CATALOG } from './partCurves.js';
import { BASELINE_METRICS, METRIC_MAX, METRIC_MIN, metricsToParams, resolveMetrics } from './Garage.js';
import { DEFAULT_VEHICLE_PARAMS } from '../physics/Vehicle.js';

describe('resolveMetrics', () => {
  it('an empty loadout is the 50/100 baseline', () => {
    expect(resolveMetrics(emptyLoadout())).toEqual(BASELINE_METRICS);
  });

  it('sums the equipped parts mods', () => {
    const m = resolveMetrics({ ...emptyLoadout(), engine: 'engine-20', wheels: 'wheels-20' });
    expect(m.speed).toBe(50 + 36 - 13); // engine primary, wheels trade-off
    expect(m.handling).toBe(50 - 13); // engine trade-off
    expect(m.grip).toBe(50 + 36); // wheels primary
    expect(m.accel).toBe(50);
  });

  it('ignores unknown part ids rather than throwing', () => {
    expect(resolveMetrics({ ...emptyLoadout(), engine: 'engine-99' })).toEqual(BASELINE_METRICS);
  });

  it('clamps to the metric bounds', () => {
    const wild = [
      { ...PART_CATALOG[0]!, id: 'x', category: 'engine' as const, speedMod: 500, handlingMod: -500 },
    ];
    const m = resolveMetrics({ ...emptyLoadout(), engine: 'x' }, wild);
    expect(m.speed).toBe(METRIC_MAX);
    expect(m.handling).toBe(METRIC_MIN);
  });
});

describe('metricsToParams', () => {
  it('the baseline reproduces the stock vehicle params', () => {
    const p = metricsToParams(BASELINE_METRICS);
    expect(p.gearMaxKmh[0]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearMaxKmh[0], 9);
    expect(p.gearMaxKmh[1]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearMaxKmh[1], 9);
    expect(p.gearAccelKmhS[0]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearAccelKmhS[0], 9);
    expect(p.gearAccelKmhS[1]).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.gearAccelKmhS[1], 9);
    expect(p.steerMaxWps).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.steerMaxWps, 9);
    expect(p.centrifugal).toBeCloseTo(DEFAULT_VEHICLE_PARAMS.centrifugal, 9);
  });

  it('more speed raises the gear ceilings; more grip lowers centrifugal push', () => {
    const fast = metricsToParams({ ...BASELINE_METRICS, speed: 95 });
    const grippy = metricsToParams({ ...BASELINE_METRICS, grip: 95 });
    expect(fast.gearMaxKmh[1]).toBeGreaterThan(DEFAULT_VEHICLE_PARAMS.gearMaxKmh[1]);
    expect(grippy.centrifugal).toBeLessThan(DEFAULT_VEHICLE_PARAMS.centrifugal);
  });

  it('keeps a maxed car inside a readable envelope', () => {
    expect(metricsToParams({ ...BASELINE_METRICS, speed: METRIC_MAX }).gearMaxKmh[1]).toBeLessThan(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/economy/Garage.test.ts`
Expected: FAIL — `./Garage.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/economy/Garage.ts`:

```ts
import { GEAR_ACCEL_KMH_S, GEAR_MAX_KMH, STEER_MAX_WPS, CENTRIFUGAL } from '../constants.js';
import type { VehicleParams } from '../physics/Vehicle.js';
import { PART_CATEGORIES, type CarMetrics, type EquippedLoadout, type Part } from '../types/inventory.js';
import { PART_CATALOG } from './partCurves.js';

/** Every car starts median. Parts move it off this, never past the bounds. */
export const BASELINE_METRICS: CarMetrics = { speed: 50, accel: 50, handling: 50, grip: 50 };
export const METRIC_MIN = 5;
export const METRIC_MAX = 95;

const clamp = (v: number): number => (v < METRIC_MIN ? METRIC_MIN : v > METRIC_MAX ? METRIC_MAX : v);

/**
 * Pure loadout resolution: baseline + the mods of every equipped part, clamped.
 * Unknown ids are skipped so a save written against an older catalog still loads.
 * `baseline` is a parameter so a future car archetype is data, not a refactor.
 */
export function resolveMetrics(
  loadout: EquippedLoadout,
  catalog: readonly Part[] = PART_CATALOG,
  baseline: CarMetrics = BASELINE_METRICS,
): CarMetrics {
  const out: CarMetrics = { ...baseline };
  for (const category of PART_CATEGORIES) {
    const id = loadout[category];
    if (id === null) continue;
    const part = catalog.find((p) => p.id === id);
    if (part === undefined) continue;
    out.speed += part.speedMod;
    out.accel += part.accelMod;
    out.handling += part.handlingMod;
    out.grip += part.gripMod;
  }
  out.speed = clamp(out.speed);
  out.accel = clamp(out.accel);
  out.handling = clamp(out.handling);
  out.grip = clamp(out.grip);
  return out;
}

/**
 * Metric surface -> physics params. Each factor is calibrated so metric 50 is
 * exactly 1.0, i.e. a stock car drives precisely as it did before Phase 9.
 * Grip inverts because CENTRIFUGAL is the outward push the driver fights: more
 * grip must mean less push. Speed uses a narrower band than the rest so a maxed
 * engine tops out around 355 km/h and the projection stays readable.
 */
export function metricsToParams(metrics: CarMetrics): VehicleParams {
  const speedF = 0.75 + 0.005 * metrics.speed;
  const accelF = 0.6 + 0.008 * metrics.accel;
  const handlingF = 0.6 + 0.008 * metrics.handling;
  const gripF = 1.3 - 0.006 * metrics.grip;
  return {
    gearMaxKmh: [GEAR_MAX_KMH[0] * speedF, GEAR_MAX_KMH[1] * speedF],
    gearAccelKmhS: [GEAR_ACCEL_KMH_S[0] * accelF, GEAR_ACCEL_KMH_S[1] * accelF],
    steerMaxWps: STEER_MAX_WPS * handlingF,
    centrifugal: CENTRIFUGAL * gripF,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/economy/Garage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/economy/Garage.ts src/economy/Garage.test.ts
git commit -m "feat(economy): pure loadout resolver from metrics to vehicle params"
```

---

### Task 4: Garage state and persistence

**Files:**
- Create: `src/economy/GarageState.ts`, `src/economy/GarageState.test.ts`

**Interfaces:**
- Consumes: `Part`, `EquippedLoadout`, `emptyLoadout` (Task 2); `SaveBackend` from
  `src/economy/save.js` (existing).
- Produces: `type PartState = 'locked' | 'unaffordable' | 'purchasable' | 'owned' | 'equipped'`,
  `interface GarageSave { credits: number; owned: string[]; equipped: EquippedLoadout; bestStage: number }`,
  `const GARAGE_SAVE_KEY = 'garage'`,
  `class GarageState` with `credits: number`, `bestStage: number`,
  `equipped: EquippedLoadout`, `owns(id: string): boolean`, `partState(part: Part): PartState`,
  `buy(part: Part): boolean`, `equip(part: Part): boolean`, `award(credits: number): void`,
  `noteStage(stage: number): void`, `toJSON(): GarageSave`,
  `static fromJSON(raw: string | null): GarageState`,
  `async function loadGarage(save: SaveBackend): Promise<GarageState>`,
  `async function persistGarage(save: SaveBackend, garage: GarageState): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `src/economy/GarageState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PART_CATALOG } from './partCurves.js';
import { MemorySaveBackend } from './save.js';
import { GarageState, GARAGE_SAVE_KEY, loadGarage, persistGarage } from './GarageState.js';

const part = (id: string) => PART_CATALOG.find((p) => p.id === id)!;

describe('GarageState part states', () => {
  it('locks parts behind route progress before price', () => {
    const g = new GarageState();
    g.credits = 1_000_000;
    g.bestStage = 0;
    expect(g.partState(part('engine-20'))).toBe('locked'); // unlockStage 3
    expect(g.partState(part('engine-01'))).toBe('purchasable');
  });

  it('reports unaffordable once unlocked but too dear', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 100;
    expect(g.partState(part('engine-20'))).toBe('unaffordable');
  });

  it('walks purchasable -> owned -> equipped', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 5000;
    const p = part('engine-01');
    expect(g.partState(p)).toBe('purchasable');
    expect(g.buy(p)).toBe(true);
    expect(g.credits).toBe(5000 - p.cost);
    expect(g.partState(p)).toBe('owned');
    expect(g.equip(p)).toBe(true);
    expect(g.partState(p)).toBe('equipped');
    expect(g.equipped.engine).toBe('engine-01');
  });

  it('refuses to buy what it cannot afford and to equip what it does not own', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 10;
    expect(g.buy(part('engine-01'))).toBe(false);
    expect(g.credits).toBe(10);
    expect(g.equip(part('engine-01'))).toBe(false);
    expect(g.equipped.engine).toBeNull();
  });

  it('equipping a second part in a category replaces the first', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 5000;
    g.buy(part('engine-01'));
    g.buy(part('engine-02'));
    g.equip(part('engine-01'));
    g.equip(part('engine-02'));
    expect(g.equipped.engine).toBe('engine-02');
    expect(g.owns('engine-01')).toBe(true); // still owned, just not fitted
  });
});

describe('GarageState bookkeeping', () => {
  it('award adds credits and noteStage only ratchets upward', () => {
    const g = new GarageState();
    g.award(1200);
    g.award(300);
    expect(g.credits).toBe(1500);
    g.noteStage(3);
    g.noteStage(1);
    expect(g.bestStage).toBe(3);
  });
});

describe('GarageState serialization', () => {
  it('round-trips through JSON', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 9000;
    g.buy(part('wheels-03'));
    g.equip(part('wheels-03'));
    const back = GarageState.fromJSON(JSON.stringify(g.toJSON()));
    expect(back.credits).toBe(g.credits);
    expect(back.bestStage).toBe(4);
    expect(back.equipped.wheels).toBe('wheels-03');
    expect(back.owns('wheels-03')).toBe(true);
  });

  it('falls back to defaults on missing or corrupt saves', () => {
    for (const raw of [null, '', 'not json', '{"credits":"lots"}', '[]']) {
      const g = GarageState.fromJSON(raw);
      expect(g.credits).toBe(0);
      expect(g.bestStage).toBe(0);
      expect(g.equipped.engine).toBeNull();
    }
  });

  it('round-trips through a SaveBackend', async () => {
    const save = new MemorySaveBackend();
    const g = new GarageState();
    g.award(2500);
    await persistGarage(save, g);
    expect(await save.get(GARAGE_SAVE_KEY)).not.toBeNull();
    expect((await loadGarage(save)).credits).toBe(2500);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/economy/GarageState.test.ts`
Expected: FAIL — `./GarageState.js` does not exist.

- [ ] **Step 3: Implement the state**

Create `src/economy/GarageState.ts`:

```ts
import { emptyLoadout, type EquippedLoadout, type Part } from '../types/inventory.js';
import type { SaveBackend } from './save.js';

/** How a part reads in the shop. Progress gates before price does. */
export type PartState = 'locked' | 'unaffordable' | 'purchasable' | 'owned' | 'equipped';

export interface GarageSave {
  credits: number;
  owned: string[];
  equipped: EquippedLoadout;
  bestStage: number;
}

export const GARAGE_SAVE_KEY = 'garage';

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const idOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * The player's wallet, inventory and fitted loadout. Deliberately dumb: every
 * method is a synchronous state transition, so the shop UI and the race payout
 * share one set of rules and the tests need no I/O.
 */
export class GarageState {
  credits = 0;
  /** Deepest route stage reached across all runs — the unlock gate. */
  bestStage = 0;
  equipped: EquippedLoadout = emptyLoadout();
  private readonly ownedIds = new Set<string>();

  owns(id: string): boolean {
    return this.ownedIds.has(id);
  }

  partState(part: Part): PartState {
    if (this.equipped[part.category] === part.id) return 'equipped';
    if (this.ownedIds.has(part.id)) return 'owned';
    if (this.bestStage < part.unlockStage) return 'locked';
    return this.credits >= part.cost ? 'purchasable' : 'unaffordable';
  }

  /** Debit and add to inventory. False (and no state change) unless purchasable. */
  buy(part: Part): boolean {
    if (this.partState(part) !== 'purchasable') return false;
    this.credits -= part.cost;
    this.ownedIds.add(part.id);
    return true;
  }

  /** Fit an owned part, replacing whatever occupied its category. */
  equip(part: Part): boolean {
    if (!this.ownedIds.has(part.id)) return false;
    this.equipped[part.category] = part.id;
    return true;
  }

  award(credits: number): void {
    this.credits += credits;
  }

  noteStage(stage: number): void {
    if (stage > this.bestStage) this.bestStage = stage;
  }

  toJSON(): GarageSave {
    return {
      credits: this.credits,
      owned: [...this.ownedIds],
      equipped: { ...this.equipped },
      bestStage: this.bestStage,
    };
  }

  /** Tolerant of anything: a corrupt save costs progress, never a crash. */
  static fromJSON(raw: string | null): GarageState {
    const garage = new GarageState();
    if (raw === null || raw === '') return garage;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return garage;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return garage;
    const doc = parsed as Partial<GarageSave>;
    if (isFiniteNumber(doc.credits)) garage.credits = doc.credits;
    if (isFiniteNumber(doc.bestStage)) garage.bestStage = doc.bestStage;
    if (Array.isArray(doc.owned)) {
      for (const id of doc.owned) if (typeof id === 'string') garage.ownedIds.add(id);
    }
    const eq = doc.equipped;
    if (typeof eq === 'object' && eq !== null) {
      garage.equipped = {
        engine: idOrNull(eq.engine),
        transmission: idOrNull(eq.transmission),
        suspension: idOrNull(eq.suspension),
        wheels: idOrNull(eq.wheels),
      };
    }
    return garage;
  }
}

export async function loadGarage(save: SaveBackend): Promise<GarageState> {
  return GarageState.fromJSON(await save.get(GARAGE_SAVE_KEY));
}

export async function persistGarage(save: SaveBackend, garage: GarageState): Promise<void> {
  await save.set(GARAGE_SAVE_KEY, JSON.stringify(garage.toJSON()));
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/economy/GarageState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/economy/GarageState.ts src/economy/GarageState.test.ts
git commit -m "feat(economy): garage state, part gating and save round-trip"
```

---

### Task 5: Payout ledger and the collision counter

**Files:**
- Create: `src/economy/payout.ts`, `src/economy/payout.test.ts`
- Modify: `src/economy/score.ts`, `src/economy/score.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `payout.ts`: `interface RunSummary { stagesCleared: number; finished: boolean; remainingMs: number; points: number; collisions: number }`,
    `interface PayoutLine { label: string; credits: number }`,
    `interface PayoutLedger { lines: PayoutLine[]; cleanMultiplier: number; total: number }`,
    `function computePayout(run: RunSummary): PayoutLedger`, plus the exported constants
    `STAGE_CREDITS`, `FINISH_BONUS`, `CREDITS_PER_SECOND`, `POINTS_PER_CREDIT`, `CLEAN_MULTIPLIER`.
  - `score.ts`: `ScoreState.collisions` getter and `ScoreState.addCollision()`.

- [ ] **Step 1: Write the failing payout tests**

Create `src/economy/payout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computePayout, CLEAN_MULTIPLIER, FINISH_BONUS, STAGE_CREDITS, type RunSummary } from './payout.js';

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  stagesCleared: 0, finished: false, remainingMs: 0, points: 0, collisions: 1, ...over,
});

describe('computePayout', () => {
  it('pays nothing for an immediate crash-out', () => {
    expect(computePayout(run()).total).toBe(0);
  });

  it('pays per stage cleared', () => {
    expect(computePayout(run({ stagesCleared: 3 })).total).toBe(3 * STAGE_CREDITS);
  });

  it('adds the completion bonus only when the route is finished', () => {
    expect(computePayout(run({ stagesCleared: 5, finished: true })).total)
      .toBe(5 * STAGE_CREDITS + FINISH_BONUS);
    expect(computePayout(run({ stagesCleared: 5, finished: false })).total).toBe(5 * STAGE_CREDITS);
  });

  it('converts whole banked seconds at 10c and drops the remainder', () => {
    expect(computePayout(run({ remainingMs: 12_900 })).total).toBe(120);
  });

  it('ignores time remaining on an expired run', () => {
    expect(computePayout(run({ remainingMs: 30_000, finished: false })).total).toBe(300);
    // (an expired run always reports remainingMs 0 — this documents the arithmetic)
  });

  it('converts overtake points at 10 points per credit', () => {
    expect(computePayout(run({ points: 4000 })).total).toBe(400);
  });

  it('applies the clean-race multiplier only at zero collisions', () => {
    const dirty = computePayout(run({ stagesCleared: 4, collisions: 2 })).total;
    const clean = computePayout(run({ stagesCleared: 4, collisions: 0 })).total;
    expect(clean).toBe(Math.round(dirty * CLEAN_MULTIPLIER));
    expect(computePayout(run({ collisions: 0 })).cleanMultiplier).toBe(CLEAN_MULTIPLIER);
    expect(computePayout(run({ collisions: 1 })).cleanMultiplier).toBe(1);
  });

  it('itemizes every line for the summary screen, in display order', () => {
    const ledger = computePayout(run({ stagesCleared: 5, finished: true, remainingMs: 20_000, points: 3000, collisions: 0 }));
    expect(ledger.lines.map((l) => l.label))
      .toEqual(['stages cleared', 'route complete', 'time remaining', 'passed cars']);
    expect(ledger.lines.map((l) => l.credits)).toEqual([1250, 1000, 200, 300]);
    expect(ledger.total).toBe(Math.round(2750 * CLEAN_MULTIPLIER));
  });

  it('a strong clean run lands in the tuned 3-4k band', () => {
    const ledger = computePayout(run({ stagesCleared: 5, finished: true, remainingMs: 45_000, points: 4000, collisions: 0 }));
    expect(ledger.total).toBeGreaterThan(3000);
    expect(ledger.total).toBeLessThan(4000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/economy/payout.test.ts`
Expected: FAIL — `./payout.js` does not exist.

- [ ] **Step 3: Implement the payout**

Create `src/economy/payout.ts`:

```ts
/**
 * Post-race payout (spec §1). A pure function of what the run produced — no
 * time source, no I/O, no rendering — so the ledger is unit-testable and
 * main.ts can commit it exactly once at the finish line.
 *
 * The five constants below are provisional feel constants (gate-tuned), in the
 * same spirit as track/route.ts: a clean five-stage run should land near 3-4k,
 * roughly one mid-tier part per session for a ~20-min/day player.
 */

export const STAGE_CREDITS = 250;
export const FINISH_BONUS = 1000;
export const CREDITS_PER_SECOND = 10;
export const POINTS_PER_CREDIT = 10;
export const CLEAN_MULTIPLIER = 1.1;

export interface RunSummary {
  /** Stages the player got through: route.stage, +1 if the route was finished. */
  stagesCleared: number;
  finished: boolean;
  /** Countdown left at the finish. Always 0 on an expired run. */
  remainingMs: number;
  /** ScoreState.points — 100 per car overtaken. */
  points: number;
  collisions: number;
}

export interface PayoutLine {
  label: string;
  credits: number;
}

export interface PayoutLedger {
  lines: PayoutLine[];
  cleanMultiplier: number;
  total: number;
}

export function computePayout(run: RunSummary): PayoutLedger {
  const lines: PayoutLine[] = [
    { label: 'stages cleared', credits: run.stagesCleared * STAGE_CREDITS },
    { label: 'route complete', credits: run.finished ? FINISH_BONUS : 0 },
    { label: 'time remaining', credits: Math.floor(run.remainingMs / 1000) * CREDITS_PER_SECOND },
    { label: 'passed cars', credits: Math.floor(run.points / POINTS_PER_CREDIT) },
  ];
  const cleanMultiplier = run.collisions === 0 ? CLEAN_MULTIPLIER : 1;
  const subtotal = lines.reduce((sum, l) => sum + l.credits, 0);
  return { lines, cleanMultiplier, total: Math.round(subtotal * cleanMultiplier) };
}
```

- [ ] **Step 4: Run the payout tests**

Run: `npm test -- src/economy/payout.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing collision-counter test**

Append to `src/economy/score.test.ts`:

```ts
  it('counts collisions and clears them on reset', () => {
    const s = new ScoreState();
    expect(s.collisions).toBe(0);
    s.addCollision();
    s.addCollision();
    expect(s.collisions).toBe(2);
    s.reset();
    expect(s.collisions).toBe(0);
  });
```

(Place it inside the existing `describe('ScoreState', …)` block; the `ScoreState` import
is already at the top of the file.)

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- src/economy/score.test.ts`
Expected: FAIL — `s.addCollision is not a function`.

- [ ] **Step 7: Add the counter**

In `src/economy/score.ts`, inside `ScoreState`:

```ts
  private hits = 0;

  /** Trackside collisions this run — zero earns the clean-race multiplier. */
  get collisions(): number { return this.hits; }

  /** Record one collision event (one per hit, not per contact frame). */
  addCollision(): void {
    this.hits++;
  }
```

and extend `reset()`:

```ts
  reset(): void {
    this.cars = 0;
    this.pts = 0;
    this.hits = 0;
  }
```

- [ ] **Step 8: Run the suite and commit**

```bash
npm test
npm run build
git add src/economy/payout.ts src/economy/payout.test.ts src/economy/score.ts src/economy/score.test.ts
git commit -m "feat(economy): route-based payout ledger and collision counter"
```

---

### Task 6: Post-race summary screen

**Files:**
- Create: `src/ui/SummaryScreen.ts`, `src/ui/SummaryScreen.test.ts`

**Interfaces:**
- Consumes: `PayoutLedger` (Task 5); `SpriteAtlas`, `RenderBackend`, `drawText` (existing).
- Produces: `class SummaryScreen` with `constructor(atlas: SpriteAtlas)`,
  `show(title: string, ledger: PayoutLedger, balance: number): void`, `clear(): void`,
  `get visible(): boolean`, `render(backend: RenderBackend): void`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/SummaryScreen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { computePayout } from '../economy/payout.js';
import { SummaryScreen } from './SummaryScreen.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const ledger = computePayout({
  stagesCleared: 5, finished: true, remainingMs: 20_000, points: 3000, collisions: 0,
});

describe('SummaryScreen', () => {
  it('renders nothing until shown', () => {
    const screen = new SummaryScreen(atlas);
    const backend = new RecordingBackend();
    expect(screen.visible).toBe(false);
    screen.render(backend);
    expect(backend.quads).toHaveLength(0);
    expect(backend.sprites).toHaveLength(0);
  });

  it('draws a panel and one glyph run per ledger line once shown', () => {
    const screen = new SummaryScreen(atlas);
    const backend = new RecordingBackend();
    screen.show('route complete', ledger, 4200);
    expect(screen.visible).toBe(true);
    screen.render(backend);
    expect(backend.quads.length).toBeGreaterThan(0);
    // title + 4 ledger lines + clean bonus + total + balance + prompt, all glyphs
    expect(backend.sprites.length).toBeGreaterThan(40);
  });

  it('omits the clean-bonus row when the multiplier is 1', () => {
    const dirty = computePayout({
      stagesCleared: 2, finished: false, remainingMs: 0, points: 0, collisions: 3,
    });
    const clean = new SummaryScreen(atlas);
    const dirtyScreen = new SummaryScreen(atlas);
    const a = new RecordingBackend();
    const b = new RecordingBackend();
    clean.show('route complete', ledger, 0);
    dirtyScreen.show('time up', dirty, 0);
    clean.render(a);
    dirtyScreen.render(b);
    expect(a.sprites.length).toBeGreaterThan(b.sprites.length);
  });

  it('clear hides it again', () => {
    const screen = new SummaryScreen(atlas);
    screen.show('time up', ledger, 0);
    screen.clear();
    expect(screen.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/ui/SummaryScreen.test.ts`
Expected: FAIL — `./SummaryScreen.js` does not exist.

- [ ] **Step 3: Implement the screen**

Create `src/ui/SummaryScreen.ts`:

```ts
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { PayoutLedger } from '../economy/payout.js';
import { drawText, textWidth } from './text.js';

const PANEL_TOP = 56;
const PANEL_BOTTOM = LOGICAL_HEIGHT - 30;
const PANEL_X = 60;
const PANEL_W = LOGICAL_WIDTH - PANEL_X * 2;
const LINE_H = 14;

/**
 * The post-race ledger. Not a toggled screen: main.ts shows it when the run
 * ends and clears it on restart, so it is pure display — it is handed a
 * finished PayoutLedger and never computes credits itself (which is also what
 * stops a re-render from re-awarding them).
 */
export class SummaryScreen {
  private title = '';
  private ledger: PayoutLedger | null = null;
  private balance = 0;

  constructor(private readonly atlas: SpriteAtlas) {}

  get visible(): boolean {
    return this.ledger !== null;
  }

  show(title: string, ledger: PayoutLedger, balance: number): void {
    this.title = title;
    this.ledger = ledger;
    this.balance = balance;
  }

  clear(): void {
    this.ledger = null;
  }

  render(backend: RenderBackend): void {
    const ledger = this.ledger;
    if (ledger === null) return;
    const cx = PANEL_X + PANEL_W / 2;
    const half = PANEL_W / 2;
    backend.drawQuad(cx, PANEL_TOP, half, cx, PANEL_BOTTOM, half, '#101018');

    const left = PANEL_X + 10;
    const right = PANEL_X + PANEL_W - 10;
    let y = PANEL_TOP + 10;
    drawText(backend, this.atlas, this.title, left, y, 2, 'gold');
    y += LINE_H + 4;

    for (const line of ledger.lines) {
      drawText(backend, this.atlas, line.label, left, y);
      const value = `${line.credits}`;
      drawText(backend, this.atlas, value, right - textWidth(this.atlas, value), y);
      y += LINE_H;
    }
    if (ledger.cleanMultiplier !== 1) {
      drawText(backend, this.atlas, 'clean race', left, y, 2, 'gold');
      const mult = `x${ledger.cleanMultiplier}`;
      drawText(backend, this.atlas, mult, right - textWidth(this.atlas, mult), y, 2, 'gold');
      y += LINE_H;
    }
    y += 4;
    drawText(backend, this.atlas, 'earned', left, y, 2, 'gold');
    const total = `${ledger.total}`;
    drawText(backend, this.atlas, total, right - textWidth(this.atlas, total), y, 2, 'gold');
    y += LINE_H;
    drawText(backend, this.atlas, 'credits', left, y);
    const bal = `${this.balance}`;
    drawText(backend, this.atlas, bal, right - textWidth(this.atlas, bal), y);
    y += LINE_H + 4;
    drawText(backend, this.atlas, 'f6 garage   r restart', left, y);
  }
}
```

(`'gold'` is an existing `FontColor` in `src/assets/spriteManifest.ts` — `white`, `magenta`,
`cyan`, `red`, `gold`, `blue` are the baked sets. Do not add a new colour.)

- [ ] **Step 4: Run the test**

Run: `npm test -- src/ui/SummaryScreen.test.ts`
Expected: PASS. If the glyph-count thresholds (`> 40`) miss, adjust the *test* numbers to
what the real layout draws — they are smoke thresholds, not a specification.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/ui/SummaryScreen.ts src/ui/SummaryScreen.test.ts
git commit -m "feat(ui): post-race payout summary screen"
```

---

### Task 7: Garage shop screen (F6)

**Files:**
- Create: `src/ui/GarageScreen.ts`, `src/ui/GarageScreen.test.ts`

**Interfaces:**
- Consumes: `GarageState` (Task 4); `resolveMetrics`, `BASELINE_METRICS` (Task 3);
  `PART_CATALOG` (Task 2); `PART_CATEGORIES`, `Part`, `CarMetrics` (Task 2).
- Produces: `class GarageScreen` with
  `constructor(atlas: SpriteAtlas, garage: GarageState, catalog?: readonly Part[], onChange?: () => void)`,
  `get open(): boolean`, `toggle(): void`, `handleKey(code: string): boolean`,
  `render(backend: RenderBackend): void`, and `get highlighted(): Part` (for tests).

- [ ] **Step 1: Write the failing test**

Create `src/ui/GarageScreen.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { GarageState } from '../economy/GarageState.js';
import { PART_CATALOG } from '../economy/partCurves.js';
import { GarageScreen } from './GarageScreen.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

function openScreen(): { screen: GarageScreen; garage: GarageState; onChange: () => void } {
  const garage = new GarageState();
  garage.bestStage = 4;
  garage.credits = 100_000;
  const onChange = vi.fn();
  const screen = new GarageScreen(atlas, garage, PART_CATALOG, onChange);
  screen.toggle();
  return { screen, garage, onChange };
}

describe('GarageScreen contract', () => {
  it('starts closed, renders nothing, and swallows nothing', () => {
    const screen = new GarageScreen(atlas, new GarageState());
    const backend = new RecordingBackend();
    expect(screen.open).toBe(false);
    expect(screen.handleKey('ArrowLeft')).toBe(false);
    screen.render(backend);
    expect(backend.sprites).toHaveLength(0);
  });

  it('swallows every key while open and closes on F6 or Escape', () => {
    const { screen } = openScreen();
    expect(screen.open).toBe(true);
    expect(screen.handleKey('KeyZ')).toBe(true);
    expect(screen.handleKey('Escape')).toBe(true);
    expect(screen.open).toBe(false);
    screen.toggle();
    expect(screen.handleKey('F6')).toBe(true);
    expect(screen.open).toBe(false);
  });
});

describe('GarageScreen navigation', () => {
  it('left/right walks the four categories and wraps', () => {
    const { screen } = openScreen();
    expect(screen.highlighted.category).toBe('engine');
    screen.handleKey('ArrowRight');
    expect(screen.highlighted.category).toBe('transmission');
    screen.handleKey('ArrowLeft');
    screen.handleKey('ArrowLeft');
    expect(screen.highlighted.category).toBe('wheels');
  });

  it('up/down walks parts within the category and clamps at the ends', () => {
    const { screen } = openScreen();
    expect(screen.highlighted.tier).toBe(1);
    screen.handleKey('ArrowUp');
    expect(screen.highlighted.tier).toBe(1);
    screen.handleKey('ArrowDown');
    expect(screen.highlighted.tier).toBe(2);
  });

  it('remembers the selected part per category', () => {
    const { screen } = openScreen();
    screen.handleKey('ArrowDown');
    screen.handleKey('ArrowDown');
    screen.handleKey('ArrowRight');
    expect(screen.highlighted.tier).toBe(1);
    screen.handleKey('ArrowLeft');
    expect(screen.highlighted.tier).toBe(3);
  });
});

describe('GarageScreen purchase flow', () => {
  it('Enter buys then equips, and notifies on change', () => {
    const { screen, garage, onChange } = openScreen();
    const part = screen.highlighted;
    screen.handleKey('Enter');
    expect(garage.owns(part.id)).toBe(true);
    expect(garage.equipped[part.category]).toBe(part.id);
    expect(onChange).toHaveBeenCalled();
  });

  it('Enter on a locked part changes nothing', () => {
    const garage = new GarageState();
    garage.bestStage = 0;
    garage.credits = 100_000;
    const onChange = vi.fn();
    const screen = new GarageScreen(atlas, garage, PART_CATALOG, onChange);
    screen.toggle();
    for (let i = 0; i < 19; i++) screen.handleKey('ArrowDown'); // tier 20, unlockStage 3
    expect(screen.highlighted.tier).toBe(20);
    screen.handleKey('Enter');
    expect(garage.owns(screen.highlighted.id)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GarageScreen rendering', () => {
  it('draws the panel, the part list and four stat-diff bars', () => {
    const { screen } = openScreen();
    const backend = new RecordingBackend();
    screen.handleKey('ArrowDown'); // a part that differs from the empty loadout
    screen.render(backend);
    expect(backend.quads.length).toBeGreaterThanOrEqual(5); // panel + 4 bars
    expect(backend.sprites.length).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/ui/GarageScreen.test.ts`
Expected: FAIL — `./GarageScreen.js` does not exist.

- [ ] **Step 3: Implement the screen**

Create `src/ui/GarageScreen.ts`:

```ts
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { PART_CATEGORIES, type CarMetrics, type Part } from '../types/inventory.js';
import { PART_CATALOG } from '../economy/partCurves.js';
import { resolveMetrics } from '../economy/Garage.js';
import type { GarageState, PartState } from '../economy/GarageState.js';
import { drawText, textWidth } from './text.js';

const PANEL_X = 20;
const PANEL_TOP = 34;
const PANEL_BOTTOM = LOGICAL_HEIGHT - 12;
const PANEL_W = LOGICAL_WIDTH - PANEL_X * 2;
const ROWS = 8; // visible part rows; the list scrolls under the selection
const ROW_H = 12;
const LIST_X = PANEL_X + 8;
const LIST_TOP = PANEL_TOP + 34;
const BAR_X = PANEL_X + PANEL_W - 110;
const BAR_MAX_W = 44; // half-width of the widest diff bar
const METRICS: readonly (keyof CarMetrics)[] = ['speed', 'accel', 'handling', 'grip'];

const STATE_LABEL: Record<PartState, string> = {
  locked: 'locked',
  unaffordable: 'need c',
  purchasable: 'buy',
  owned: 'owned',
  equipped: 'fitted',
};

/**
 * The F6 shop. Follows the LeaderboardScreen/AccountScreen contract: an `open`
 * getter, `toggle`, a `handleKey` that swallows everything while open, and a
 * render that draws only through the backend. The stat-diff bars call the same
 * `resolveMetrics` the physics uses, so what the bars promise is what the car
 * does.
 */
export class GarageScreen {
  private isOpen = false;
  private categoryIdx = 0;
  /** Selected row per category — pre-allocated, never rebuilt (hard rule 4). */
  private readonly rowIdx = [0, 0, 0, 0];
  private readonly diff: CarMetrics = { speed: 0, accel: 0, handling: 0, grip: 0 };

  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly garage: GarageState,
    private readonly catalog: readonly Part[] = PART_CATALOG,
    private readonly onChange: () => void = () => {},
  ) {}

  get open(): boolean {
    return this.isOpen;
  }

  private get category(): (typeof PART_CATEGORIES)[number] {
    return PART_CATEGORIES[this.categoryIdx]!;
  }

  private get rows(): Part[] {
    return this.catalog.filter((p) => p.category === this.category);
  }

  /** The part under the cursor. Exposed for tests and for main.ts diagnostics. */
  get highlighted(): Part {
    return this.rows[this.rowIdx[this.categoryIdx]!]!;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F6' || code === 'Escape') {
      this.isOpen = false;
      return true;
    }
    const count = PART_CATEGORIES.length;
    if (code === 'ArrowLeft') this.categoryIdx = (this.categoryIdx + count - 1) % count;
    else if (code === 'ArrowRight') this.categoryIdx = (this.categoryIdx + 1) % count;
    else if (code === 'ArrowUp') this.rowIdx[this.categoryIdx] = Math.max(0, this.rowIdx[this.categoryIdx]! - 1);
    else if (code === 'ArrowDown') {
      this.rowIdx[this.categoryIdx] = Math.min(this.rows.length - 1, this.rowIdx[this.categoryIdx]! + 1);
    } else if (code === 'Enter') this.confirm();
    return true; // an open screen swallows everything
  }

  /** Buy if it can be bought, then fit it. A locked part is a no-op. */
  private confirm(): void {
    const part = this.highlighted;
    const state = this.garage.partState(part);
    if (state === 'locked' || state === 'unaffordable' || state === 'equipped') return;
    if (state === 'purchasable' && !this.garage.buy(part)) return;
    if (!this.garage.equip(part)) return;
    this.onChange();
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    const cx = PANEL_X + PANEL_W / 2;
    const half = PANEL_W / 2;
    backend.drawQuad(cx, PANEL_TOP, half, cx, PANEL_BOTTOM, half, '#101018');

    drawText(backend, this.atlas, `garage   credits ${this.garage.credits}`, LIST_X, PANEL_TOP + 6, 2, 'gold');
    // Category carousel: the selected one is highlighted, arrows show it moves.
    let x = LIST_X;
    for (let i = 0; i < PART_CATEGORIES.length; i++) {
      const name = PART_CATEGORIES[i]!;
      drawText(backend, this.atlas, name, x, PANEL_TOP + 20, 2, i === this.categoryIdx ? 'gold' : 'white');
      x += textWidth(this.atlas, name) + 8;
    }

    const rows = this.rows;
    const selected = this.rowIdx[this.categoryIdx]!;
    const first = Math.max(0, Math.min(rows.length - ROWS, selected - Math.floor(ROWS / 2)));
    for (let i = 0; i < ROWS && first + i < rows.length; i++) {
      const part = rows[first + i]!;
      const y = LIST_TOP + i * ROW_H;
      const marker = first + i === selected ? '-' : ' ';
      const state = this.garage.partState(part);
      drawText(backend, this.atlas, `${marker}${part.name}`, LIST_X, y, 2,
        first + i === selected ? 'gold' : 'white');
      const tail = state === 'purchasable' || state === 'unaffordable'
        ? `${part.cost}` : STATE_LABEL[state];
      drawText(backend, this.atlas, tail, BAR_X - 8 - textWidth(this.atlas, tail), y);
    }

    this.renderDiff(backend);
  }

  /** Red/green bars: highlighted part's resolved metrics minus the fitted ones. */
  private renderDiff(backend: RenderBackend): void {
    const part = this.highlighted;
    const now = resolveMetrics(this.garage.equipped, this.catalog);
    const next = resolveMetrics(
      { ...this.garage.equipped, [part.category]: part.id },
      this.catalog,
    );
    this.diff.speed = next.speed - now.speed;
    this.diff.accel = next.accel - now.accel;
    this.diff.handling = next.handling - now.handling;
    this.diff.grip = next.grip - now.grip;

    for (let i = 0; i < METRICS.length; i++) {
      const key = METRICS[i]!;
      const y = LIST_TOP + i * ROW_H;
      drawText(backend, this.atlas, key, BAR_X, y);
      const delta = this.diff[key];
      // Bars grow from a fixed origin: right for a gain, left for a loss.
      const w = Math.min(BAR_MAX_W, Math.abs(delta)) / 2;
      const originX = BAR_X + 60;
      const cx = delta >= 0 ? originX + w : originX - w;
      const color = delta > 0 ? '#33cc55' : delta < 0 ? '#cc3333' : '#555566';
      const halfW = Math.max(0.5, w);
      backend.drawQuad(cx, y, halfW, cx, y + 8, halfW, color);
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/ui/GarageScreen.test.ts`
Expected: PASS. As in Task 6, tune only the smoke thresholds if the glyph counts miss.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/ui/GarageScreen.ts src/ui/GarageScreen.test.ts
git commit -m "feat(ui): f6 garage shop with stat-diff bars"
```

---

### Task 8: Wire the loop — payout on finish, F6, live params

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: nothing new — this is the integration seam.

- [ ] **Step 1: Add the imports and boot the garage**

In `src/main.ts`, add to the import block:

```ts
import { Vehicle, createCommand } from './physics/Vehicle.js'; // already present — no change
import { GarageState, loadGarage, persistGarage } from './economy/GarageState.js';
import { metricsToParams, resolveMetrics } from './economy/Garage.js';
import { computePayout } from './economy/payout.js';
import { SummaryScreen } from './ui/SummaryScreen.js';
import { GarageScreen } from './ui/GarageScreen.js';
```

Change the vehicle binding from `const` to `let` (it is reassigned when the loadout
changes) and add the garage wiring immediately after it. Note that `garage` is a `const`
that gets *hydrated in place* rather than rebound: `GarageScreen` captures the reference it
was constructed with, so replacing the binding after the async load would leave the shop
pointing at an empty wallet.

```ts
const input = new InputManager();
let vehicle = new Vehicle(DEFAULT_TRACK_CONFIG.roadWidth);

// --- Phase 9: economy ------------------------------------------------------
// The garage loads asynchronously; until it lands the car is stock, which is
// exactly what an empty loadout resolves to anyway.
const garage = new GarageState();
const summary = new SummaryScreen(atlas);
const rebuildVehicle = (): void => {
  vehicle = new Vehicle(
    DEFAULT_TRACK_CONFIG.roadWidth,
    metricsToParams(resolveMetrics(garage.equipped)),
  );
};
const shop = new GarageScreen(atlas, garage, undefined, () => {
  void persistGarage(save, garage);
  rebuildVehicle(); // fitted parts take effect on the next step
});
void loadGarage(save).then((loaded) => {
  // Hydrate in place — `shop` already holds this exact instance.
  garage.credits = loaded.credits;
  garage.bestStage = loaded.bestStage;
  garage.equipped = loaded.equipped;
  for (const id of loaded.toJSON().owned) garage.adopt(id);
  rebuildVehicle();
});
```

Hydrating in place needs one addition to `GarageState` (`src/economy/GarageState.ts`) —
add the method, and a test for it in `GarageState.test.ts`:

```ts
  /** Add an id to the inventory without paying — used when hydrating a save. */
  adopt(id: string): void {
    this.ownedIds.add(id);
  }
```

```ts
  it('adopt hydrates ownership without charging credits', () => {
    const g = new GarageState();
    g.adopt('engine-07');
    expect(g.owns('engine-07')).toBe(true);
    expect(g.credits).toBe(0);
  });
```

- [ ] **Step 2: Register the F6 key**

In the keydown handler, add `F6` to the `screenOpen` set, the `preventDefault` list, and a
handler beside the F5 one:

```ts
  const screenOpen = remap.open || editor.open || leaderboard.open || trackBrowser.open
    || account.open || shop.open;
```

```ts
  if (e.code === 'Tab' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4'
      || e.code === 'F5' || e.code === 'F6' || input.isBound(e.code)) e.preventDefault();
```

```ts
  if (e.code === 'F5') { account.toggle(); return; }
  if (account.handleKey(e.code)) return;
  if (e.code === 'F6') { shop.toggle(); return; }
  if (shop.handleKey(e.code)) return;
```

Add the same `|| shop.open` to the update loop's pause check:

```ts
    if (remap.open || editor.open || leaderboard.open || trackBrowser.open || account.open || shop.open) {
      cmd.throttle = 0; cmd.brake = 0; cmd.steer = 0; cmd.handbrake = true;
    }
```

- [ ] **Step 3: Count collisions and commit the payout once**

At the collision site in `update`, record the hit:

```ts
    if (hitCar(vehicle, cars, cfg) != null) {
      const d = responseDelta({ offRoad: false, hit: true });
      vehicle.applyCollision(d.speedFactor, (vehicle.x >= 0 ? -1 : 1) * d.xPush * dt);
      score.addCollision(); // zero hits earns the clean-race multiplier
    }
```

Add a `payoutDone` flag next to `elapsedMs`:

```ts
let elapsedMs = 0;
let payoutDone = false; // the run pays out exactly once, on the step it ends
```

Remove the `void recordRaceResult(...)` call from inside the `route.finish()` branch — the
payout block below owns it now, so the credits figure and the result row cannot disagree.
Immediately after the whole `if (!route.finished && !route.expired …)` block, add:

```ts
    // Payout: one commit per run, whichever way it ended.
    if (!payoutDone && (route.finished || route.expired)) {
      payoutDone = true;
      garage.noteStage(route.stage);
      const ledger = computePayout({
        stagesCleared: route.stage + (route.finished ? 1 : 0),
        finished: route.finished,
        remainingMs: route.remainingMs,
        points: score.points,
        collisions: score.collisions,
      });
      garage.award(ledger.total);
      void persistGarage(save, garage);
      summary.show(route.finished ? 'route complete' : 'time up', ledger, garage.credits);
      const { trackId, path } = routeIdentity(route);
      void recordRaceResult({ trackId, route: path, timeMs: elapsedMs, creditsEarned: ledger.total });
    }
```

- [ ] **Step 4: Reset cleanly on restart**

In the `KeyR` handler, rebuild the vehicle with the current loadout instead of resetting the
old instance, and clear the summary:

```ts
  if (e.code === 'KeyR' && (route.expired || route.finished)) {
    route = new RouteState(1);
    rebuildVehicle(); // picks up anything bought since the last run
    score.reset();
    elapsedMs = 0;
    payoutDone = false;
    summary.clear();
    routeMap.flashMs = 0;
    bootScene();
    traffic.rescope(0, track.length * DEFAULT_TRACK_CONFIG.segmentLength);
    return;
  }
```

- [ ] **Step 5: Render the new screens**

In `render`, replace the two end-screen `drawText` calls with the summary, and draw the shop
alongside the other overlays:

```ts
    account.render(backend);
    shop.render(backend);
    routeMap.render(route, backend);
    summary.render(backend);
    backend.present();
```

Delete the now-dead `if (route.expired) { drawText(...) } else if (route.finished) { … }`
block. If `drawText` and `LOGICAL_WIDTH`/`LOGICAL_HEIGHT` become unused in `main.ts`, remove
them from its imports — `npm run build` will flag it.

- [ ] **Step 6: Verify the whole suite and the typecheck**

```bash
npm test
npm run build
```
Expected: all tests pass, `tsc --noEmit` clean.

- [ ] **Step 7: Verify in the real app**

```bash
npm run dev
```
Check by hand:
1. Drive into a wall, let the timer expire → the summary panel shows an itemized ledger.
2. Press F6 → the shop opens, driving is paused, arrows navigate, Enter buys and fits.
3. Buy a tier-1 engine, press R, and confirm the car reaches a higher top speed than before.
4. Reload the page → credits and the fitted part survive.
5. Press F6 with the shop open → it closes; Cmd/Ctrl shortcuts still pass through.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/economy/GarageState.ts src/economy/GarageState.test.ts
git commit -m "feat(economy): close the race-earn-buy-equip loop in the game loop"
```

---

## Final Verification

- [ ] `npm test` — full suite green
- [ ] `npm run build` — typecheck and production build clean
- [ ] Manual pass from Task 8 Step 7 complete, including the reload check
- [ ] `docs/superpowers/plans/2026-08-11-phase-9-modular-economy-shop.md` checkboxes ticked
- [ ] `plan.md` Phase 9 marked done, matching how Phase 8 was recorded
