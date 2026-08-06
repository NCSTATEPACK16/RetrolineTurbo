# active-plan.md — Phase 2+3: Pseudo-3D road rasterizer

Per-feature working plan (see `plan.md` §13). Replace contents when starting the next phase.
Full spec: `~/.claude/plans/scope-phase-2-3-road-rasterizer.md`.

## Goal
Draw a scrolling pseudo-3D road — straight first (M1), then faked curves and hills with
correct crest occlusion and a parallax background (M2) — at a stable 60fps in the fixed
480×270 framebuffer, all driven by the Phase-1 projection math. The `Renderer` calls
`RenderBackend` methods directly in near→far order; it never allocates a per-frame draw
list and never touches a `ctx` (hard rules 2 & 4).

## M1 checklist — straight road (Phase 2 done-when)
- [x] `src/constants.ts` — `DEFAULT_TRACK_CONFIG` + provisional `COLORS` palette
- [x] `src/engine/testing/RecordingBackend.ts` — `RenderBackend` test double recording all calls
- [x] `src/engine/TrackManager.ts` — builds/owns `Segment[]`; `segment()` wraps modulo length
- [x] `src/engine/Renderer.ts` — `projectSegment` pure helper + `Renderer` class (scratch-reuse loop)
- [x] Renderer draws road surface near→far with `clipToCrest` occlusion clip
- [x] Rumble strips (rumble→road→lane draw order) + centre lane line on light bands
- [x] `src/engine/Background.ts` — sky/ground bands + `layerOffset` parallax helper
- [x] `src/engine/Canvas2DBackend.ts` — real `fillBand` + `drawQuad` (trapezoid path)
- [x] `src/main.ts` — throwaway camera harness (auto-advance z, A/D steer, W/S speed)
- [x] M1 frame verified numerically: sky/ground split at horizon 135, road half-width
      504px near → 6.7px far, centred at x=240, presents once

## M2 checklist — curves + hills + parallax (Phase 3 done-when)
- [x] `TrackManager.build()` — straight lead-in (60) + S-curve + hill crest + flat run-out
- [x] Renderer curve drift proven: far quad centres bend off screen-centre through a curve
- [x] Crest occlusion proven: crest-ahead camera draws 135 road quads vs 295 on a flat run
- [x] `Background.render` pans layers (colour-phase stand-in until textured layers, Phase 4)
- [x] `main.ts` feeds the camera segment's curvature into the background each frame
- [x] `npm test` green (37 tests) · `npm run build` clean (`tsc --noEmit` strict + Vite)

## Design decisions (locked)
1. **RecordingBackend testing seam** — a `RenderBackend` double records every call so the
   headless suite asserts on projected geometry, draw order, and occlusion discards without
   a real canvas. Tests assert *relationships* (near wider than far, monotonic drift,
   occlusion cuts quad count), never absolute pixels — provisional constants can be retuned
   at the visual gate without breaking the suite.
2. **TrackManager is the segment source** — Phase 2/3 build the track in code; Phase 6 swaps
   the *source* (file loader / editor output) behind the same `segment()`/`segments` shape.
3. **Throwaway camera harness in `main.ts`** — auto-advancing `z` + debug A/D/W/S keys let the
   road be observed before real physics (Phase 5) replaces it.
4. **No per-frame allocation** in `render()` — two scratch `Projected` objects reused; backend
   methods take primitive args only. (The one `acc = accumulateSegment(...)` reassignment per
   segment matches Phase-1's pure style; convert to in-place if profiling later demands it.)

## Deviations from the written plan (and why)
- **Canvas2DBackend test** — the suite runs in Vitest's `node` environment (no jsdom, zero
  deps by design). The plan's fake-`ctx` test used `document`; replaced with `vi.stubGlobal`
  so it stays in `node` with no new dependency. Same intent (asserts the four trapezoid
  corner path ops + the full-width `fillRect`).
- **Task 2 straight-track test** — its full-track `curve===0/pitch===0` loop was scoped to the
  straight lead-in once Task 8 added curves/hills (index/z checks stay full-range).
- **Renderer "centred" test** — constrained to `drawDistance: 40` so the view stays inside the
  60-segment straight lead-in (Task 8's curve starts at segment 60).
- **Occlusion test** — the plan's `z=0` "flat reference" is actually the *occluded* case for
  this track (crest ~140 segments ahead). Corrected: `z=0` is the crest-ahead case (135
  quads); a flat run-out camera (`z=300·segLen`) is the unoccluded reference (295 quads).
  The Renderer loop was verified correct and left unchanged.

## Done-when
Straight road renders stable at 480×270, integer-upscaled, ~60fps (M1). An S-curve over a
crest hides far segments correctly and parallax layers pan (M2). `npm test` + `npm run build`
green; no third-party imports in `engine/`; `Renderer.render` reuses scratch (no per-frame
draw list, no `ctx`). **Human visual gate outstanding:** browser tooling was unavailable in
the implementing session, so the on-screen look (colours, 60fps smoothness, nearest-neighbour
crispness, bending horizon, disappearing far road, panning bands) still needs an eyeball pass
via `npm run dev` at http://localhost:5173.

## Phase 0 carryover (operational — still unverified)
- [ ] `npm install` → `npm test` green → `npm run build` clean
- [ ] Supabase MCP: create project, apply migration, write `.env`
- [ ] git init → push to `NCSTATEPACK16/RetrolineTurbo` → Netlify green
