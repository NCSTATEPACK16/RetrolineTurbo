# CLAUDE.md — Retroline Turbo (router)

Web-first pseudo-3D arcade racer (Pole Position → TX-1 → OutRun lineage): scanline
segment-projection engine, branching track pyramid, arcade skid/recovery physics, a
persistent upgrade economy, stable 60fps "chunky retro" look.

## Stack
- TypeScript (strict) · Vite · Vitest
- Renderer: HTML5 **Canvas 2D** behind a `RenderBackend` interface (WebGL/PixiJS only if profiling demands)
- Audio: Web Audio API (procedural) — later phase
- Backend: **Supabase** (Postgres + Auth + RLS) — save, economy, leaderboards, community tracks
- Hosting: **Netlify** (continuous deploy from `main`) — repo `NCSTATEPACK16/RetrolineTurbo`
- iOS: Capacitor — deferred to the final phase

## Module map (`src/`)
- `types/` engine domain types (Segment, TrackConfig, Camera, Vehicle, Sprite, BranchPoint)
- `math/` pure projection transforms (`S=d/z`, screen proj, z-map, clip bounds)
- `engine/` `RenderBackend`, `Canvas2DBackend`, `Renderer`, `Background`, `TrackManager`, `BranchRenderer`
- `physics/` `Vehicle`, `loop.ts` (fixed-timestep accumulator + interpolation)
- `input/` `InputManager` (keyboard / mouse / gamepad; touch/gyro later)
- `economy/` `Garage`, `upgrades`, `save` (`SaveBackend` interface)
- `net/` `supabase.ts` (client, auth, sync, leaderboards, track share)
- `audio/` `SoundEngine`  ·  `ui/` HUD + menus  ·  `track/` editor + schema + generator

## Commands
- `npm run dev` — Vite dev server (HMR)
- `npm test` — Vitest (headless unit tests; `npm run test:watch` to watch)
- `npm run build` — `tsc --noEmit` typecheck + Vite production build to `dist/`
- Deploy: push `main` → Netlify auto-builds. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Netlify env.

## Hard rules (non-negotiable)
1. **Segment model only** — no WebGL geometry / Three.js / real 3D. Project 2D segments with similar triangles.
2. **Renderer stays behind `RenderBackend`** — Canvas2D is one implementation; game code never touches a `ctx` directly.
3. **Physics is deterministic & fixed-timestep** (1/60s accumulator), decoupled from render, and unit-tested in Vitest.
4. **No per-frame allocation in `render()`** — pre-allocate vectors/sprite pools; backend methods take primitive args.
5. **Zero external deps in the engine core** — native browser APIs only. Libraries (Supabase, audio) live at the edges.
6. **Supabase anon key is public** — all data protection is via **RLS**, never client-side checks.

## Sequencing
`plan.md` is the authoritative 12-phase roadmap; keep `active-plan.md` as the per-feature working plan.
Write unit tests for pure logic (projection, physics, economy, track loader) before wiring into the render loop.
