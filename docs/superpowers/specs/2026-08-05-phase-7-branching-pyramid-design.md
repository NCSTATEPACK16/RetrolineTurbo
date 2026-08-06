# Phase 7 — Branching Pyramid & Many Levels

**Date:** 2026-08-05
**Roadmap:** `plan.md` §10 Phase 7 · math in `plan.md` §7 (branching geometry)
**Predecessor:** Phase 6 — Track Data Format, Loader, Editor, Generator.
**Runs when:** Phase 6 is code-complete. (It is; its visual check rides this phase's gate.)
**Design decisions resolved autonomously** (loop mode; plan.md fully constrains the phase —
scope cuts documented in §8).

---

## 1. Goal

The OutRun/TX-1 five-stage expanding fork as the "many levels" backbone: a route pyramid of
15 scenes (stage s has s scenes), forks rendered as dual diverging roads with a median wedge,
path assignment from player x at the node, checkpoint-timer extension per stage, a RouteMap
overlay, and 5 endings (the stage-5 scenes). Scenes are `TrackFile`s — Phase 6's pipeline is
the content system; the unchosen branch is never loaded.

## 2. Data & types

- `types/engine.ts` — `BranchPoint` placeholder becomes real:
  `{ startSegment: number; splitDurationSegments: number; ways: 2 | 3 }`
  (split begins at `startSegment`, roads fully separated at the **node**
  `startSegment + splitDurationSegments`; segment indices, not world z).
- `track/schema.ts` — `branchPoint` is now validated when present (int fields ≥ 0 / ≥ 1,
  `ways` ∈ {2,3}, unknown keys rejected); absent/null stays legal (no fork — an ending).
- `TrackManager` stores the active track's `branchPoint` as `activeBranch: BranchPoint | null`
  (set on construct/rebuild) so the renderer and main loop read it without re-parsing.

## 3. Route pyramid — `track/route.ts` (pure, fully tested)

- `buildPyramid(baseSeed: number): ScenePlan[][]` — 5 stages; stage s (0-based) has s+1
  scenes; each `ScenePlan { stage, idx, seed, name }` with `seed = baseSeed * 100 + stage * 10 + idx`.
  `sceneTrack(plan, cfg): TrackFile` = `generateTrack(seed, { targetSegments: 650 })` +
  `branchPoint = { startSegment: total − 100, splitDurationSegments: 60, ways: 2 }` for
  stages 0–3; stage 4 scenes get **no** branchPoint (endings). Every scene track must pass
  `parseTrackFile` (property-tested).
- `resolveFork(playerX: number, ways: 2 | 3, roadWidth: number): number` — 2-way:
  `x < 0 → 0` else `1` (spec §7 rule); 3-way: `x < −roadWidth/2 → 0`, `x > +roadWidth/2 → 2`,
  else `1`.
- `nextSceneIdx(currentIdx: number, choice: number, ways: number, nextStageScenes: number)` —
  2-way: left keeps `i`, right takes `i+1`; 3-way maps `i−1 | i | i+1`; clamped to
  `[0, nextStageScenes−1]`.
- `class RouteState` — `stage`, `sceneIdx`, `visited: number[]` (sceneIdx per completed
  stage), `remainingMs` countdown (`tick(dtMs)`, `extend(ms)`, `expired`), `finished`
  (+ `endingIdx`). `advance(choice)` moves to the next stage's scene; stage-4 completion
  (z past track end, no branch) → `finish()`. Initial time 60 s, +35 s per stage entry
  (provisional feel constants).

## 4. Branch geometry & rendering — `engine/BranchRenderer.ts` + Renderer hook

- Pure helpers (unit-tested):
  - `branchSpread(segIdx, branch, maxSpread)` — 0 before `startSegment`; eased `t²`
    growth across the window; `maxSpread` after the node. `maxSpread = roadWidth * 2.5`
    (provisional).
  - `roadOffsetsFor(ways, spread): readonly number[]` — `[−spread, +spread]` (2-way) or
    `[−spread, 0, +spread]` (3-way). Zero-allocation variant fills a pre-allocated array.
- `Renderer.render` — in the existing near→far road loop, when the active track has a
  branch and the segment is inside/after the split window, the road trapezoid is drawn
  **once per road offset** (2–3 quads instead of 1: rumble/lane treatment identical, each
  shifted by the offset projected through the same scale). A **median wedge** (ground-dark
  quad) fills between inner road edges whenever `spread > roadWidth` (a visible gap).
  Records/sprite pass keep following the centre-line (branch roads carry no scenery during
  the window — documented cut, §8). No per-frame allocation: offsets go through a
  pre-allocated 3-slot array.

## 5. Transition, timer, endings — `main.ts` glue + `Vehicle.translate`

- `Vehicle` gains `translate(dz: number, dx: number)` — explicit world-shift mutation
  (used only at scene hand-off; keeps fields otherwise read-only).
- Each update, when route mode is live (active track has a branch) and
  `vehicle.z ≥ nodeZ = (start + duration) * segmentLength`:
  1. `choice = resolveFork(vehicle.x, ways, roadWidth)`;
  2. `route.advance(choice)`; build + parse the chosen next scene; `track.rebuild(...)`;
  3. `vehicle.translate(−nodeZ, −chosenOffset)` where `chosenOffset` is the chosen road's
     centre offset at the node (player continues seamlessly on the new centre-line);
  4. `route.extend(STAGE_TIME_BONUS_MS)`; RouteMap flashes for 3 s.
- Stage-4 scene end (no branch): `route.finish()` → "route complete" overlay names the
  ending (1 of 5); timer stops. Timer expiry → "time up" overlay; throttle neutralized
  (same pause path as the screens); R restarts the route (fresh RouteState + stage-0 scene).
- Editor interplay: opening the editor loads editor tracks (usually branchless) — route
  progression simply pauses (no branch ⇒ no node). Documented; no special casing.

## 6. RouteMap — `ui/RouteMap.ts`

Pyramid overlay drawn with quads + bitmap text: 15 nodes bottom-up, visited path
highlighted, current scene marked, ending names on stage 5. Shown while `flashMs > 0`
(post-fork + on finish) and toggleable with M. Pure render from `RouteState` (tested via
RecordingBackend: node count, highlight count).

## 7. HUD countdown

`HUD.render` gains an optional trailing `remainingMs?: number` — when present, draws the
countdown top-centre (existing bitmap font; red-ish urgency handled at the Phase 10 juice
pass). Existing HUD tests unchanged; new test asserts the extra digits render.

## 8. Scope cuts (documented, deliberate)

- **Shipped pyramid uses 2-way forks**; 3-way is engine-supported and unit-tested
  (geometry + resolution) but not used by the default pyramid — TX-1 3-way content can be
  authored later via `branchPoint.ways = 3` in any TrackFile.
- **Branch roads carry no scenery/traffic during the split window** — the centre-line
  records still drive sprites; visual dressing of the off-branches lands with the Phase
  10/11 polish passes.
- **Scene visual identity = generator seed variance** (curve/hill character + scenery
  density). Per-scene palettes wait for the `colors` wiring (Phase 10/11), as Phase 6
  already noted.
- "25 route permutations" (research count) emerges from the 2-way pyramid's distinct
  visited-path sets; no additional mechanism needed.

## 9. Testing — Vitest (all pure)

- Pyramid: 5 stages / 1..5 scenes / 15 total; every scene track validates; stages 0–3
  branch, stage 4 doesn't; seeds deterministic.
- `resolveFork` thresholds both ways; `nextSceneIdx` mapping + clamping at pyramid edges.
- `RouteState`: advance walk to each of the 5 endings; timer tick/extend/expiry; visited
  path recorded; finish semantics.
- `branchSpread` monotonic 0→max, eased, window edges exact; `roadOffsetsFor` shapes.
- Renderer branch pass (RecordingBackend): road-quad count multiplies inside the window;
  median quad appears once spread > roadWidth; zero quads change before the window.
- Schema: structured `branchPoint` accept/reject cases.
- `Vehicle.translate` determinism-preserving (translation then identical steps ⇒ identical
  deltas).
- HUD countdown digits; RouteMap render smoke.

## 10. Done-when (plan.md §10 Phase 7)

- Player can traverse distinct 5-stage routes to 5 endings; unchosen branches never load.
- Median renders between roads at the fork; fork geometry per §7.
- Checkpoint timer extends per fork; expiry handled.
- RouteMap shows the pyramid at stage end.
- `npm test` + `npm run build` green; hard rules 1–5 held (no per-frame allocation in the
  branch pass).
- **HUMAN VISUAL GATE** (also closes Phase 6's bundled check): fork split reads correctly,
  median visible, choosing left/right lands on different scenes, timer/RouteMap legible,
  60 fps through the fork window.
