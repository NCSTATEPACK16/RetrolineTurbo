# Phase 7 — Branching Pyramid & Many Levels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five-stage route pyramid (15 generated scenes, 5 endings) with forks rendered as dual diverging roads + median wedge in the segment model, player-x path assignment at the node, per-stage checkpoint-timer extension, and a RouteMap overlay.

**Architecture:** Scenes are `TrackFile`s from the Phase 6 pipeline; `track/route.ts` owns the pure pyramid/state machine; `engine/BranchRenderer.ts` owns pure spread/offset math; the Renderer's road loop draws each visible span once per branch road using screen-space offsets derived from the already-projected half-width (`far.w * worldOffset / roadWidth`) — zero new allocation. Transitions rebuild the shared `TrackManager` and `Vehicle.translate` the player back to the new scene's origin. The unchosen branch is never parsed or loaded.

**Tech Stack:** TypeScript (strict), Vite, Vitest (node). Canvas 2D behind `RenderBackend`.

## Global Constraints

- Hard rules 1–6 (`CLAUDE.md`); branch pass must not allocate per frame (pre-allocated 3-slot offset array).
- `Vehicle` stays deterministic; `translate` is an explicit mutation used only at scene hand-off.
- All route/branch logic pure and vitest-tested before main.ts wiring.
- Shipped pyramid uses 2-way forks; 3-way is engine-supported + tested (spec §8 cuts).
- Provisional feel constants (`MAX_SPREAD = roadWidth * 2.5`, timer 60s + 35s/stage, split window 60 segs) live in `track/route.ts` / `constants.ts` and are gate-tunable.
- `npm test` + `npm run build` green before each task-closing commit. Branch `phase-7-branching-pyramid`; no push/PR/merge.

**Spec:** `docs/superpowers/specs/2026-08-05-phase-7-branching-pyramid-design.md`

---

## Task 1: `BranchPoint` type + structured schema validation + `TrackManager.activeBranch`

**Files:** modify `src/types/engine.ts`, `src/track/schema.ts`, `src/engine/TrackManager.ts`; extend `src/track/schema.test.ts`, `src/engine/TrackManager.test.ts`.

**Interfaces:** `BranchPoint { startSegment: number; splitDurationSegments: number; ways: 2 | 3 }` (replaces the placeholder). `TrackFile.branchPoint?: BranchPoint | null`. `TrackManager.activeBranch: BranchPoint | null` (getter; refreshed by rebuild).

- [ ] Tests first:

```ts
// schema.test.ts — add
describe('branchPoint validation', () => {
  const withBranch = (bp: unknown): unknown => ({ ...JSON.parse(JSON.stringify(valid)) as object, branchPoint: bp });
  it('accepts a well-formed branchPoint and carries it through', () => {
    const r = parseTrackFile(withBranch({ startSegment: 500, splitDurationSegments: 60, ways: 2 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.track.file.branchPoint).toEqual({ startSegment: 500, splitDurationSegments: 60, ways: 2 });
  });
  it('accepts null / absent (an ending)', () => {
    expect(parseTrackFile(withBranch(null)).ok).toBe(true);
    expect(parseTrackFile(valid).ok).toBe(true);
  });
  it('rejects bad shapes with paths', () => {
    expect(parseTrackFile(withBranch({ startSegment: -1, splitDurationSegments: 60, ways: 2 })).ok).toBe(false);
    expect(parseTrackFile(withBranch({ startSegment: 5, splitDurationSegments: 0, ways: 2 })).ok).toBe(false);
    expect(parseTrackFile(withBranch({ startSegment: 5, splitDurationSegments: 60, ways: 4 })).ok).toBe(false);
    const r = parseTrackFile(withBranch({ startSegment: 5, splitDurationSegments: 60, ways: 2, extra: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/branchPoint\.extra/);
  });
});
```

```ts
// TrackManager.test.ts — add
it('exposes the active branch and refreshes it on rebuild', () => {
  const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
  expect(tm.activeBranch).toBeNull(); // default track has no fork
  const r = parseTrackFile({
    trackId: 'forked', stageName: 'Forked', segmentLength: 200, roadWidth: 2000, lanes: 3,
    sections: [{ length: 700, curve: 0, pitch: 0 }],
    branchPoint: { startSegment: 500, splitDurationSegments: 60, ways: 2 },
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  tm.rebuild(r.track);
  expect(tm.activeBranch).toEqual({ startSegment: 500, splitDurationSegments: 60, ways: 2 });
});
```

- [ ] Implement: replace the `types/engine.ts` placeholder `BranchPoint` (keep the name, new fields, doc comment "split begins at startSegment; node at startSegment + splitDurationSegments"). In `schema.ts`: type `branchPoint?: BranchPoint | null` on `TrackFile`; validation block (when present and non-null): object shape, `BRANCH_KEYS = Set('startSegment','splitDurationSegments','ways')`, `startSegment` int ≥ 0, `splitDurationSegments` int ≥ 1, `ways === 2 || ways === 3`; errors under `branchPoint.<key>`. In `TrackManager`: `private _branch: BranchPoint | null` set from `(track ?? parsedDefaultTrack()).file.branchPoint ?? null` in ctor and `rebuild`; `get activeBranch()`.
- [ ] `npx vitest run && npm run build` green → commit `feat(track): structured BranchPoint schema; TrackManager exposes activeBranch`.

---

## Task 2: `engine/BranchRenderer.ts` — pure spread/offset math

**Files:** create `src/engine/BranchRenderer.ts` + `src/engine/BranchRenderer.test.ts`.

**Interfaces:**

```ts
export function branchSpread(segIdx: number, branch: BranchPoint, maxSpread: number): number;
// 0 for segIdx < startSegment; maxSpread for segIdx ≥ startSegment + splitDurationSegments;
// eased t*t between (t = (segIdx − startSegment) / splitDurationSegments).

export function fillRoadOffsets(out: number[], ways: 2 | 3, spread: number): number;
// Fills pre-allocated out[0..n) and returns n. spread === 0 → n = 1, out[0] = 0.
// 2-way: [−spread, +spread]; 3-way: [−spread, 0, +spread].

export function chosenOffsetAtNode(choice: number, ways: 2 | 3, maxSpread: number): number;
// The chosen road's world-x centre offset at the node (used for the hand-off translate).
```

- [ ] Tests: zero before window; exact max at/after node; strictly increasing inside; eased (value at t=0.5 < linear half); `fillRoadOffsets` counts/shapes for spread 0 / 2-way / 3-way; `chosenOffsetAtNode(0,2)=−max, (1,2)=+max, (1,3)=0`. Red → implement (straightforward transcription) → green → commit `feat(engine): pure branch spread/offset math`.

---

## Task 3: Renderer branch pass — multi-road quads + median wedge

**Files:** modify `src/engine/Renderer.ts`; extend `src/engine/Renderer.test.ts`.

**Design:** add to the Renderer: `private readonly branchOffsets = [0, 0, 0];` and `private static readonly MAX_SPREAD_ROADWIDTHS = 2.5;`. Inside the road loop's `clip.visible` block, before drawing:

```ts
const branch = track.activeBranch;
let roads = 1;
let spreadFar = 0;
if (branch) {
  const maxSpread = roadWidth * Renderer.MAX_SPREAD_ROADWIDTHS;
  spreadFar = branchSpread(base + i, branch, maxSpread);
  roads = fillRoadOffsets(this.branchOffsets, branch.ways, spreadFar);
}
// Median wedge first (roads overlay its edges) when a gap has opened.
if (spreadFar > roadWidth) {
  const wMedFar = this.far.w * ((spreadFar - roadWidth) / roadWidth);
  const wMedNear = this.near.w * ((this.prevSpread - roadWidth) / roadWidth);
  if (this.prevSpread > roadWidth) {
    backend.drawQuad(this.far.x, this.far.y, wMedFar, this.near.x, this.near.y, Math.max(wMedNear, 0), COLORS.groundDark);
  }
}
for (let r = 0; r < roads; r++) {
  const offFarPx = this.far.w * (this.branchOffsets[r]! / roadWidth);
  const offNearPx = this.near.w * ((this.prevSpread === 0 ? 0 : this.prevOffsets[r]!) / roadWidth);
  // rumble, road, lane exactly as today, with far.x+offFarPx / near.x+offNearPx
}
```

Bookkeeping: `prevSpread: number` and `prevOffsets = [0, 0, 0]` roll like `near` does (copy after each span; reset when `relZ < CAM_CLIP_Z`). For 3-way the centre road keeps offset 0 so the existing record/sprite pass stays centre-line-true; `rec.*` continues to store the **centre** projection (sprites/traffic unaffected). Median drawn only between spans fully inside the gap (`prevSpread > roadWidth` guard) — a one-span pop-in at the gap mouth is acceptable at this art level (gate-checked).

- [ ] Tests first (RecordingBackend), using a forked 700-segment flat track via `parseTrackFile` (branch start 100, duration 60, camera z = 0 vs deep in window):
  - camera far from the window → road-quad count identical to an unforked control track;
  - camera with the window in view → road-surface quad count strictly greater than control;
  - deep split (camera just before node) → at least one `COLORS.groundDark` median quad whose colour equals groundDark and count grows vs early-window render;
  - a 3-way fork renders more road quads than the same-position 2-way.
  (Count road-surface quads by colour ∈ {road, roadDark}; the existing tests distinguish colours the same way.)
- [ ] Red → implement → full suite green (existing Renderer tests must not change) → commit `feat(engine): fork rendering — per-road quads + median wedge in the segment road loop`.

---

## Task 4: `track/route.ts` — pyramid + route state machine (pure)

**Files:** create `src/track/route.ts` + `src/track/route.test.ts`.

**Interfaces (from spec §3):**

```ts
export interface ScenePlan { stage: number; idx: number; seed: number; name: string }
export const STAGES = 5;
export const INITIAL_TIME_MS = 60_000;
export const STAGE_TIME_BONUS_MS = 35_000;
export const SPLIT_DURATION_SEGMENTS = 60;
export const BRANCH_LEAD_SEGMENTS = 100; // startSegment = total − BRANCH_LEAD_SEGMENTS

export function buildPyramid(baseSeed: number): ScenePlan[][];       // [stage][idx], stage s has s+1 scenes
export function sceneTrack(plan: ScenePlan): TrackFile;              // generateTrack + branchPoint (none on stage 4)
export function resolveFork(playerX: number, ways: 2 | 3, roadWidth: number): number;
export function nextSceneIdx(currentIdx: number, choice: number, ways: 2 | 3, nextStageScenes: number): number;

export class RouteState {
  constructor(baseSeed: number);
  readonly pyramid: ScenePlan[][];
  stage: number; sceneIdx: number;
  readonly visited: number[];            // sceneIdx chosen per completed stage
  remainingMs: number; readonly expired: boolean;
  readonly finished: boolean; readonly endingIdx: number | null;
  currentPlan(): ScenePlan;
  tick(dtMs: number): void;              // counts down unless finished
  extend(ms: number): void;
  advance(choice: number): ScenePlan;    // records visited, moves stage+1, extends timer
  finish(): void;                        // stage-4 completion → endingIdx = sceneIdx
}
```

`sceneTrack`: `generateTrack(seed, { targetSegments: 650 })`; for stages 0–3 set `branchPoint = { startSegment: total − BRANCH_LEAD_SEGMENTS, splitDurationSegments: SPLIT_DURATION_SEGMENTS, ways: 2 }` (compute total from the generated sections); stage 4 → no branchPoint. `trackId` patched to `s<stage>-<idx>-<seed>` — wait, trackId charset is `[a-z0-9-]+`, fine.

- [ ] Tests: pyramid shape (5 stages, s+1 scenes, 15 total, deterministic seeds); every `sceneTrack` passes `parseTrackFile` (all 15); stages 0–3 have a branch whose node < total, stage 4 none; `resolveFork` 2-way sign rule + 3-way thresholds at ±roadWidth/2; `nextSceneIdx` left/right mapping + clamping at both pyramid edges; `RouteState` full walk — always-left reaches ending 0, always-right reaches ending 4, visited records the path, timer extends on advance, `tick` to zero sets `expired` (but not when finished first), `finish` freezes the timer.
- [ ] Red → implement → green → commit `feat(track): route pyramid, fork resolution, checkpoint-timer state machine`.

---

## Task 5: `Vehicle.translate` + HUD countdown + `ui/RouteMap.ts`

**Files:** modify `src/physics/Vehicle.ts`, `src/ui/HUD.ts`; create `src/ui/RouteMap.ts`; extend/create tests.

- [ ] `Vehicle.translate(dz, dx)` — adds to `posZ`/`posX`, nothing else. Test: translate then identical step scripts produce identical deltas as an untranslated control (determinism preserved).
- [ ] `HUD.render(..., remainingMs?: number)` trailing optional param: when present draw `time <ceil(s)>` centred top (via drawText, x ≈ LOGICAL_WIDTH/2 − 30). Test: render with `remainingMs` emits more glyph sprites than without.
- [ ] `ui/RouteMap.ts`:

```ts
export class RouteMap {
  constructor(atlas: SpriteAtlas);
  flashMs: number;                          // counts down in main's update; also M-toggled
  render(route: RouteState, backend: RenderBackend): void; // no-op when flashMs <= 0
}
```

Draws a bottom-up pyramid: stage s row at `y = LOGICAL_HEIGHT − 60 − s*18`, scene nodes as 6×6 quads centred, visited path + current scene in `rumbleLight`, others `road`; header `route map` + ending label when finished. Tests: no draws when `flashMs = 0`; 15 node quads when flashing; highlight count = stages completed + 1.
- [ ] Full suite + build green → commit `feat(ui): route map overlay, HUD countdown; Vehicle.translate for scene hand-off`.

---

## Task 6: `main.ts` route-mode wiring

**Files:** modify `src/main.ts` (thin edge; logic all tested above).

- [ ] Construct `route = new RouteState(1)`, `routeMap = new RouteMap(atlas)`; boot the world on `sceneTrack(route.currentPlan())` through `parseTrackFile` (replacing the default-track boot: `const boot = parseTrackFile(sceneTrack(route.currentPlan())); if (boot.ok) track.rebuild(boot.track);` — default track remains the editor's base).
- [ ] In `update` after `vehicle.step` (all guarded on `!route.finished && !route.expired`):

```ts
route.tick(dt * 1000);
const branch = track.activeBranch;
if (branch) {
  const nodeZ = (branch.startSegment + branch.splitDurationSegments) * DEFAULT_TRACK_CONFIG.segmentLength;
  if (vehicle.z >= nodeZ) {
    const choice = resolveFork(vehicle.x, branch.ways, DEFAULT_TRACK_CONFIG.roadWidth);
    const plan = route.advance(choice);
    const r = parseTrackFile(sceneTrack(plan));
    if (r.ok) {
      track.rebuild(r.track);
      vehicle.translate(-nodeZ, -chosenOffsetAtNode(choice, branch.ways, DEFAULT_TRACK_CONFIG.roadWidth * 2.5));
      routeMap.flashMs = 3000;
    }
  }
} else if (route.stage === STAGES - 1 && vehicle.z >= track.length * DEFAULT_TRACK_CONFIG.segmentLength) {
  route.finish();
  routeMap.flashMs = 999_999; // stays up on the ending screen
}
if (route.expired) { cmd.throttle = 0; cmd.brake = 1; } // roll to a stop — must be applied BEFORE vehicle.step; hoist this guard above step()
routeMap.flashMs = Math.max(0, routeMap.flashMs - dt * 1000);
```

Note the ordering caveat: the expired-guard mutates `cmd`, so place the route-expiry check before `vehicle.step` in the actual wiring (read cmd → neutralize if screens open or route.expired → step → route/node logic).
- [ ] `KeyM` toggles `routeMap.flashMs` (0 ↔ 60000) in the keydown router (before `input.press`, non-consuming otherwise); `KeyR` when `route.expired || route.finished` → fresh `RouteState`, reboot scene 0, `vehicle.reset()`.
- [ ] Render: `hud.render(vehicle, elapsedMs, track, camera, backend, route.remainingMs)`; `routeMap.render(route, backend)` after remap/editor renders; "time up" / "route complete <name>" via `drawText` when applicable (main-level, simple).
- [ ] Full suite + build → commit `feat: route-mode wiring — scene hand-off at forks, countdown, RouteMap, restart`.

---

## Task 7: Verification, review, gate, roll

- [ ] superpowers:verification-before-completion — fresh full suite (expect ≈190+), build, hard-rule greps (no alloc in branch pass: offsets pre-allocated; no third-party imports; ctx confinement).
- [ ] superpowers:requesting-code-review — reviewer over the phase range; fix Critical/Important, red-green regressions.
- [ ] Roll `active-plan.md` to Phase 7 with the M-checklist; **HUMAN VISUAL GATE `[ ]` pending** with exact `npm run dev` steps (fork split + median, left/right land on different scenes, all 5 endings reachable across runs, timer + RouteMap legible, 60fps through the fork; also closes Phase 6's bundled editor check). Commit docs + roll.
- [ ] **STOP the loop** (Phase 7 is a gate phase) and report the checklist.

---

## Self-Review

**Spec coverage:** §2 → Task 1; §3 → Task 4; §4 → Tasks 2–3; §5 → Tasks 5–6 (translate, transitions, timer, endings, restart); §6 → Task 5 (RouteMap); §7 → Task 5 (HUD); §8 cuts honoured (2-way content, centre-line sprites, seed-variance scenes); §9 test matrix mapped task-by-task; §10 gate handled in Task 7. ✓

**Placeholder scan:** Task 3 shows the exact integration pattern with named bookkeeping fields; rumble/road/lane "exactly as today" refers to the verbatim block quoted in the same task's context (offsets applied to x only). No TBDs. ✓

**Type consistency:** `BranchPoint` fields identical across Tasks 1–4/6; `fillRoadOffsets(out, ways, spread): number` matches Renderer usage; `chosenOffsetAtNode(choice, ways, maxSpread)` matches Task 6 call (maxSpread = roadWidth × 2.5 in both); `RouteState.advance(choice): ScenePlan` matches Task 6; HUD trailing optional param keeps every existing call site compiling. ✓
