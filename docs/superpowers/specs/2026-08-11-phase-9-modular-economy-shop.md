# Phase 9 — Modular Economy & Post-Race Shop (design spec)

Implementation spec for `plan.md` Phase 9. Supersedes
`docs/superpowers/specs/2026-08-05-phase-9-modular-economy.md`, which was written before
Phases 6–8 landed and assumes a race model the shipped game does not have.

**What changed and why.** The earlier spec pays out on *placement* (1st/2nd/3rd) and
*fastest lap*. Retroline Turbo has neither: there is no rival AI and there are no laps.
The shipped race is an OutRun/TX-1 checkpoint run — a 5-stage route pyramid
(`track/route.ts`) with a countdown timer extended at each stage, traffic to overtake
(`engine/Traffic.ts` → `economy/score.ts`), and collisions (`engine/Collision.ts`). This
spec re-bases the payout on those four real signals. Everything else from the original —
the median-50 baseline, the four-category × 20-tier catalog, the trade-off model, the
stat-diff shop — is preserved.

**Out of scope (deliberate):** car archetypes, nitro, rival AI. The resolver takes a
per-archetype baseline from day one, so adding cars later is data plus a sprite bake, not
a refactor.

---

## 1. Payout

Credits are awarded once, on the step the run ends — either `route.finish()` (reached an
ending) or timer expiry. `main.ts` computes the ledger, commits it to `GarageState`, and
hands it to the summary screen; re-renders never re-award.

`economy/payout.ts` is a pure function with no time source and no I/O:

```ts
interface RunSummary {
  stagesCleared: number;   // route.stage at end (0..4), +1 if finished
  finished: boolean;       // reached an ending vs. timed out
  remainingMs: number;     // route.remainingMs at end (0 when expired)
  points: number;          // ScoreState.points (100/car overtaken)
  collisions: number;      // ScoreState.collisions
}
interface PayoutLine { label: string; credits: number }
interface PayoutLedger { lines: PayoutLine[]; cleanMultiplier: number; total: number }

function computePayout(run: RunSummary): PayoutLedger
```

| Line | Value |
| :--- | :--- |
| Stages cleared | `stagesCleared × 250` |
| Route complete | `1000` if `finished`, else `0` |
| Time remaining | `10 × floor(remainingMs / 1000)` (always `0` when expired) |
| Passed cars | `floor(points / 10)` — i.e. 10c per car |
| Clean race | `× 1.1` multiplier if `collisions === 0` |

`total = round(Σ lines × cleanMultiplier)`.

A clean full run lands ≈3–4k credits at ~4 minutes, so a ~20-min/day player buys roughly
one mid-tier part per session. **All five constants are provisional feel constants,
gate-tuned** — the same convention `route.ts` uses for `INITIAL_TIME_MS`.

`ScoreState` gains a `collisions` counter incremented by `main.ts` on each collision
event, so one `reset()` path covers every run statistic.

## 2. Vehicle metrics and the physics seam

Every car starts at a **median baseline of 50/100** on four metrics; parts shift them.

| Metric | Physics param | Today's constant |
| :--- | :--- | :--- |
| Top Speed | `gearMaxKmh` | `GEAR_MAX_KMH = [120, 290]` |
| Acceleration | `gearAccelKmhS` | `GEAR_ACCEL_KMH_S = [60, 25]` |
| Handling | `steerMaxWps` | `STEER_MAX_WPS = 2500` |
| Grip | `centrifugal` | `CENTRIFUGAL = 9000` |

`physics/Vehicle.ts` currently imports these four constants directly. Extract them into an
injected parameter object:

```ts
interface VehicleParams {
  gearMaxKmh: readonly [number, number];
  gearAccelKmhS: readonly [number, number];
  steerMaxWps: number;
  centrifugal: number;
}
const DEFAULT_VEHICLE_PARAMS: VehicleParams  // built from the existing constants
class Vehicle { constructor(roadWidth: number, params: VehicleParams = DEFAULT_VEHICLE_PARAMS) }
```

The other tunables (brake rates, off-road drag, skid thresholds) stay module constants —
parts do not touch them. Physics stays deterministic and fixed-step (hard rule 3); the
only change is where four numbers come from.

**Metric → param scaling.** Linear per metric, calibrated so `m = 50` reproduces today's
values exactly (an empty loadout drives identically to the current build):

| Metric | Factor at metric `m` | Range over m ∈ [5, 95] |
| :--- | :--- | :--- |
| Speed | `0.75 + 0.005·m` | ×0.775 … ×1.225 |
| Accel | `0.60 + 0.008·m` | ×0.64 … ×1.36 |
| Handling | `0.60 + 0.008·m` | ×0.64 … ×1.36 |
| Grip | `1.30 − 0.006·m` | ×1.27 … ×0.73 (lower `centrifugal` = more grip) |

Grip inverts because `CENTRIFUGAL` is the outward push resisting the driver: a higher grip
metric must *reduce* it. Speed uses a narrower band so a maxed engine tops out ≈355 km/h
rather than an unreadable 400+.

`TOP_SPEED_WORLD` stays a static constant: the renderer's speed streaks are a camera
effect ramped against a fixed reference, and letting the ramp shift per loadout would make
the same speed look different in two cars. A speed-maxed car simply saturates the effect.

## 3. Part catalog — 80 parts, curve-generated

```ts
type PartCategory = 'engine' | 'transmission' | 'suspension' | 'wheels';
interface Part {
  id: string; name: string; category: PartCategory;
  tier: number;        // 1..20
  cost: number;
  unlockStage: number; // 0..4 — deepest route stage required
  speedMod: number; accelMod: number; handlingMod: number; gripMod: number;
}
interface EquippedLoadout {
  engine: string | null; transmission: string | null;
  suspension: string | null; wheels: string | null;
}
```

Mods are generated from a per-category curve, not hand-tuned. For tier *t* ∈ [1, 20]:

- **primary** metric: `+round(1.8·t)` → +2 at tier 1, +36 at tier 20
- **trade-off** metric: `−round(0.9·max(0, t − 5))` → 0 through tier 5, −13 at tier 20
- **cost:** `round(400 · 1.28^(t−1))` → 400c … ≈45,000c
- **unlockStage:** `min(4, floor((t − 1) / 5))`

| Category | Primary | Trade-off | Flavour |
| :--- | :--- | :--- | :--- |
| Engine | Speed | Handling | weight penalises steering |
| Transmission | Accel | Speed | short ratios cap top end |
| Suspension | Handling | Grip | stiff track tunes lose off-road bite |
| Wheels/Tires | Grip | Speed | soft slicks cost a little top speed |

Low tiers are mild all-rounders; high tiers are sharp specializations, so the catalog is a
set of choices rather than a ladder.

`economy/partCurves.ts` owns the curves and `generateCatalog()`; the runtime uses its
deterministic output. A committed `src/economy/parts.json` snapshot makes every balance
change visible in a diff, guarded by a golden test in the same shape as
`engine/AtlasManifest.golden.test.ts`: the generator must reproduce the committed file byte
for byte, and `UPDATE_PARTS=1 npm test` rewrites it. (The repo has no TypeScript script
runner — only Python and plain `.mjs` — so the generator is a module exercised by vitest
rather than a standalone `scripts/` entry.)

## 4. `economy/Garage.ts` + `economy/GarageState.ts` — pure resolver, then state

The resolver (`Garage.ts`) has no I/O and no rendering; the mutable player state and its
persistence live next door in `GarageState.ts` so each file keeps one responsibility:

```ts
const BASELINE_METRICS: CarMetrics = { speed: 50, accel: 50, handling: 50, grip: 50 };

function resolveMetrics(loadout: EquippedLoadout, catalog: Part[],
                        baseline = BASELINE_METRICS): CarMetrics;   // Σ mods, clamped 5..95
function metricsToParams(metrics: CarMetrics): VehicleParams;

interface GarageSave { credits: number; owned: string[];
                       equipped: EquippedLoadout; bestStage: number }
class GarageState {
  credits; owned; equipped; bestStage;
  partState(part: Part): 'locked' | 'unaffordable' | 'purchasable' | 'owned' | 'equipped';
  buy(part: Part): boolean;    // debits credits, adds to owned; false if not purchasable
  equip(part: Part): boolean;  // false unless owned
  award(total: number): void;
  noteStage(stage: number): void;   // bestStage = max(bestStage, stage)
  toJSON(): GarageSave;
  static fromJSON(raw: string | null): GarageState;   // tolerant of null/corrupt → defaults
}
```

Gating is credits **and** stage progress: `locked` when `bestStage < part.unlockStage`,
`unaffordable` when affordable-by-progress but not by credits.

## 5. Persistence

`GarageState` serializes under the `garage` key of the existing `SaveBackend`. Nothing new
is built: `LocalStorageSaveBackend` covers offline, and Phase 8's `SupabaseBackend`
delivers cross-device for free through the same interface. `bestStage` is written at each
stage clear; credits and inventory are written when the payout commits and on each
buy/equip.

`recordRaceResult` finally populates `creditsEarned` — the column and the field already
exist, unused since Phase 8.

## 6. UI

**`ui/SummaryScreen.ts`** — renders automatically whenever `route.finished ||
route.expired`, replacing today's bare end-screen text. Draws the itemized ledger
(stages / route complete / time / passed cars / clean bonus → total), the resulting credit
balance, and a `g — garage` prompt. Pure display: it takes a `PayoutLedger` and a balance,
and computes nothing.

**`ui/GarageScreen.ts`** — an F6 overlay following the `LeaderboardScreen` /
`AccountScreen` contract exactly: an `open` getter, `toggle()`, a `handleKey()` that
swallows every key while open, and `render(backend)` drawing through `drawText` and
`backend.drawQuad`. Layout:

- horizontal carousel of the four categories (left/right switches category)
- vertical list of that category's 20 parts (up/down scrolls), each showing name, cost and
  one of the five states from §4
- a stat-diff panel: four red/green bars showing the highlighted part's resolved metrics
  minus the currently equipped loadout's, computed with the same `resolveMetrics` the
  physics uses, so the bars cannot drift from what the car actually does
- Enter buys (if purchasable) then equips; equipping rebuilds `VehicleParams` for the next
  run

**`main.ts` wiring** — build `VehicleParams` from the saved loadout at startup and on
restart (`KeyR`); add `F6` to the existing `screenOpen` guard and the `preventDefault`
list; increment `ScoreState.collisions` on collision events; commit the payout exactly
once per run.

## 7. Testing (vitest)

- **Payout** — each ledger line in isolation; clean-multiplier gating on `collisions`;
  expired runs award no time bonus and no completion bonus; totals round consistently.
- **Resolver** — an empty loadout yields exactly `DEFAULT_VEHICLE_PARAMS`; known loadouts
  yield expected metrics and params; clamping holds at both ends.
- **Balance guard** — no single loadout leads on all four metrics, and every tier-20 part
  carries a real penalty (its trade-off mod is strictly negative).
- **Catalog golden** — regenerating `parts.json` reproduces the committed file.
- **GarageState** — buy/equip transitions and the five part states; save/load round-trip;
  corrupt/missing save falls back to defaults.
- **Vehicle** — a speed-100 params object reaches a strictly higher terminal velocity than
  baseline over a fixed number of steps, and baseline params reproduce the existing
  Vehicle tests unchanged.
- **Screens** — `GarageScreen` follows the screen contract (swallows keys while open,
  renders nothing while closed); `SummaryScreen` renders a ledger through
  `RecordingBackend`.

## 8. Done-when

The race → earn → buy → equip loop is closed and persisted across a reload; equipping a
part measurably shifts effective physics through the baseline+mod resolver; the stat-diff
bars reflect the same deltas the physics applies; costs are tuned for a ~20-min/day
player; payout, resolution and save round-trip are unit-tested; and the balance guard
proves specialization trade-offs prevent a dominant loadout.
