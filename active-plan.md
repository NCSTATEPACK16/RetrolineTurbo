# active-plan.md — Phase 1: Core math engine & domain types

Per-feature working plan (see `plan.md` §13). Replace contents when starting the next phase.
Full spec: `~/.claude/plans/scope-phase-1-and-purring-bubble.md`.

## Goal
Pure, tested transforms with **no game logic** (plan.md §255–261). Greenfield `types/` and
`math/` — the foundation Phases 2–4 (rasterizer, curves/hills, sprites) consume.

## Checklist
- [x] `src/constants.ts` — append projection defaults (`DEFAULT_FOCAL_LENGTH`,
      `DEFAULT_CAMERA_HEIGHT`, `HORIZON_Y = LOGICAL_HEIGHT/2`)
- [x] `src/types/engine.ts` — full `Camera` (world pose + intrinsics), `Segment`,
      `TrackConfig`; placeholder stubs for `Vehicle`/`Sprite`/`BranchPoint` (data only, no logic)
- [x] `src/math/projection.test.ts` — write first (TDD): `scaleFor` S=d/z over z∈[1,10000];
      horizon collapse; z-map round-trip + monotonic; accumulator determinism; `clipToCrest`
- [x] `src/math/projection.ts` — pure §7 transforms: `scaleFor`, `projectX`, `projectY`,
      `zAtScanline`, `stepZAccumulator`, `accumulateSegment`, `clipToCrest`
- [x] `npm test` green (new suite + existing `loop.test.ts`) — 21 tests pass
- [x] `npm run build` clean (`tsc --noEmit` strict + Vite build)

## Note on the plan's `zAtScanline` formula
The scoped formula `(h_camera·d_screen)/(Y_s − Y_horizon)` omits the `H/2` half-dimension
factor that `projectX`/`projectY` carry. Since the round-trip is an acceptance criterion,
`zAtScanline` was implemented as `(h_camera·d_screen·(H/2))/(Y_s − Y_horizon)` so it is the
exact inverse of `projectY`. Documented in `projection.ts`.

## Design decisions (locked)
1. Types: math-critical fully defined (`Camera`/`Segment`/`TrackConfig`); `Vehicle`/`Sprite`/
   `BranchPoint` are minimal stubs completed in Phases 5/4/7.
2. Projection intrinsics live as fields on the `Camera` type; defaults exported from `constants.ts`.
3. Accumulation helpers included now as pure state-in → state-out functions (no module state).

## Done-when
`S=d/z` verified across `z ∈ [1,10000]`; coordinates collapse to `Y_horizon` as `z→∞`;
z-map monotonic and inverse of forward projection (round-trip); `npm test` + `npm run build` green;
no third-party imports in `math/` or `types/`; `projection.ts` has no mutable module state.

## Phase 0 carryover (operational — still unverified)
- [ ] `npm install` → `npm test` green → `npm run build` clean
- [ ] Supabase MCP: create project, apply migration, write `.env`
- [ ] git init → push to `NCSTATEPACK16/RetrolineTurbo` → Netlify green
