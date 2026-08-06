# active-plan.md — Phase 7: Branching Pyramid & Many Levels

Per-feature working plan (see `plan.md` §13). Replace contents when starting the next phase.
Full plan: `docs/superpowers/plans/2026-08-05-phase-7-branching-pyramid.md`.
Spec: `docs/superpowers/specs/2026-08-05-phase-7-branching-pyramid-design.md`.

## Goal
The OutRun/TX-1 five-stage expanding fork: a 15-scene route pyramid of generated `TrackFile`s
with 5 endings, forks rendered as dual diverging roads + median wedge in the segment model,
player-x path assignment at the node, checkpoint-timer extension per stage, and a RouteMap
overlay. Unchosen branches are never loaded.

## M-checklist — Phase 7 done-when
- [x] `BranchPoint` structured type + schema validation (`branchPoint.<key>` errors; null/absent
      = ending); `TrackManager.activeBranch` refreshed on rebuild (vitest)
- [x] `engine/BranchRenderer.ts` — pure eased `t²` spread, 2/3-way road offsets (pre-allocated),
      `chosenOffsetAtNode` (vitest)
- [x] Renderer fork pass — each visible span drawn once per branch road; median wedge between
      inner edges once the gap opens; forked road ends at track end (no full-spread wrap);
      **zero per-frame allocation** (RecordingBackend relationship tests)
- [x] `track/route.ts` — 5 stages / 15 scenes / deterministic seeds; **all 15 scene tracks
      property-pass the validator**; stages 0–3 fork, stage 4 = endings; `resolveFork`
      (x<0→A rule; 3-way thresholds at ±roadWidth/2); `RouteState` walks to all 5 endings;
      timer tick/extend/expiry/finish semantics (vitest)
- [x] `Vehicle.translate` (world-shift at hand-off; determinism-preserving, tested) +
      **branch-aware off-road** (`roadCenterX` param: following a diverged branch road is
      never punished as off-road — vitest)
- [x] `Traffic.rescope` — cars shift with the player at hand-off and wrap into the new scene
      length (vitest)
- [x] `ui/RouteMap.ts` — 15-node pyramid overlay, visited path + current scene highlighted,
      ending named; `HUD` checkpoint countdown (vitest)
- [x] `main.ts` route wiring — parse-before-advance hand-off (a bad scene can never desync
      the pyramid), landing clamped onto the chosen road's surface, timer expiry / route
      complete overlays, R restart, M map toggle (pinned on the ending screen)
- [x] 3-way forks engine-supported + tested; shipped pyramid is 2-way (spec §8 cut)
- [x] `npm test` green (**194 tests**, up from 158) · `npm run build` clean
- [ ] **HUMAN VISUAL GATE (pending — also closes Phase 6's bundled check)** —
      `npm run dev` @ http://localhost:5173 and verify:
      1. Drive stage 1: near the end the road visibly splits in two with a dark median wedge
         between; the split grows smoothly; ~60fps through the fork window.
      2. Follow the LEFT road through the node: the world hands off seamlessly to a new
         scene (no teleport jolt), the RouteMap flashes showing your path going left, and
         the checkpoint timer jumps up (+35s).
      3. Restart (finish or let the timer expire, press R) and go RIGHT at stage 1 —
         a different scene loads (different curves/scenery seed).
      4. Following a branch road at full split does NOT bleed speed (no phantom off-road
         drag); driving the grass median between roads DOES.
      5. Reach a stage-5 ending: "route complete" + pinned RouteMap naming ending N of 5.
      6. Let the timer hit zero: "time up", car rolls to a stop, R restarts.
      7. Traffic cars still appear in every stage (they re-scope across hand-offs).
      8. Phase 6 check: F2 editor still opens/edits/live-rebuilds; Tab remap still works and
         closes the editor; default track still looks like Phase 5.
      Known cosmetic artifact (documented): branch roads carry no scenery/traffic during the
      split window; per-scene palettes arrive with Phase 10/11 polish.

## Design decisions (locked)
1. **Scenes are TrackFiles** — the Phase 6 pipeline is the content system; forks rebuild the
   shared TrackManager and translate the vehicle/traffic back to the new origin.
2. **Centre-line records** — the sprite/traffic pass follows the track centre; branch roads
   are draw-time offsets of the same span (segment model preserved, hard rule 1).
3. **Branch-aware off-road** — `Vehicle.step` takes the nearest road centre; main computes it
   from `branchSpread`/`fillRoadOffsets` per step (pre-allocated array, hard rule 4).
4. **Parse-before-advance** — the destination scene must validate before `RouteState.advance`
   mutates; `advance` is additionally a no-op on the final stage.
5. **Hand-off landing clamp** — player lands at their offset relative to the chosen road,
   clamped to ±0.8 roadWidth, so no choice ever teleports them off-road.

## Deviations from the written plan (and why)
- **Plan's Task 6 snippet ordering was defective** (advance-before-parse, flagged in review);
  implemented parse-before-advance instead.
- **`translate` determinism test premise tightened** — translation only commutes with stepping
  while both trajectories stay on-road (off-road drag reads |x|); the test now asserts its
  own premise and uses an on-road shift.
- **Forked tracks end at the horizon** rather than wrapping (wrapped scene-start segments
  painted at full spread looked broken); route mode swaps scenes at the node before the end
  is reachable.

## Code-review round (reviewer subagent; all Critical/Important fixed)
- **Critical fixed:** off-road physics was branch-unaware — following the branch road bled
  speed as "off-road" and the hand-off teleported centre-hugging players off-road on every
  stage. Fixed with `roadCenterX` in `Vehicle.step` + clamped landing (both unit-tested).
- **Important fixed:** advance-before-parse desync risk (now parse-first + stage-4 guard);
  traffic wrapped on the boot track's length and ignored hand-offs (now `rescope`d at forks
  and restart, tested). M-toggle now re-pins the map on the ending screen.
- **Noted (gate checklist):** branch roads carry no scenery during the split (spec cut);
  HUD countdown string allocates per frame (matches existing HUD precedent; Phase 11 sweep).

## Done-when
Player traverses distinct 5-stage routes to 5 endings; unchosen branches never load; median
renders between forked roads; checkpoint timer extends per fork; RouteMap shows the pyramid.
`npm test` (194) + `npm run build` green; hard rules held. **Human visual gate pending.**

## Operational carryover
- [x] `npm test` green (194) · `npm run build` clean
- [x] Supabase project `iytniuygdkwxxmtdkmlj` — retroline schema with RLS (unchanged)
- [ ] PR opened per user request: phases 2–7 branch stack → `main` (Netlify deploys on merge;
      set `VITE_SUPABASE_*` env vars in Netlify if not already present)
- [ ] Phase 8 note: wire editor/remap persistence error handling when SupabaseBackend lands
