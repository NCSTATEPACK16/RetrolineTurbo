# CLAUDE.md — Retroline Turbo (router)

Web-first arcade racer: **a Top Gear road with a Pole Position horizon, and a Mario Kart soul**.
Chunky 16-bit look, locked 60fps, 8-racer grand prix vs personality CPUs, light items,
drift/mini-turbo, customisable low-poly cars, fun from age 5 to 50. iOS/iPadOS later.

**2.0 is in progress on the `v2` branch.** Spec: `docs/v2/PRD.md`. Roadmap: `plan.md`.
`main` = 1.x (Canvas2D segment engine, live on Netlify). 1.x plans archived in `docs/v1/`.

## Stack
- TypeScript (strict) · Vite · Vitest
- Rendering (v2): **three.js** into a ~427×240 low-res target, whole-number nearest upscale, palette/dither post shader, optional CRT
- Audio: Web Audio API: sequenced SNES-style music, sampled SFX, driver barks
- Backend: **Supabase** (Postgres + Auth + RLS). v2 schema is `retroline_v2`; 1.x is `retroline`
- Hosting: **Netlify** (continuous deploy from `main`). Repo `NCSTATEPACK16/RetrolineTurbo`
- Art: Blender-scripted modular car kit (glTF), billboard pixel scenery, bake scripts in `scripts/`
- iOS: Capacitor, after 2.0

## Module map (v2 target, `src/`)
- `sim/`: **pure TS, deterministic**. Vehicle, drift, items, AI, race rules, track schema, economy. No DOM, no three.js
- `view/`: three.js scene, road mesh generator, cars, billboards, camera, post, HUD sync
- `input/`: `InputManager` → per-tick `InputFrame` (keyboard / gamepad; touch later)
- `net/`: Supabase client, auth, saves, ghosts, leaderboards
- `audio/` · `ui-shell/` (DOM menus/garage) · `assets/` (palette, manifests)
- 1.x modules (`engine/`, `math/`, `physics/`, `ui/`, `track/`) remain until ported or retired

## Commands
- `npm run dev`: Vite dev server (HMR)
- `npm test`: Vitest (headless; `npm run test:watch` to watch)
- `npm run build`: `tsc --noEmit` typecheck plus Vite production build to `dist/`
- Deploy: push `main` → Netlify auto-builds. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Netlify env.

## Hard rules (v2, non-negotiable)
1. **Simulation core is pure TS and deterministic.** `sim/` never imports three.js or touches the DOM. Physics, AI, items, race rules and economy all run headless in Vitest, including full CPU-only races.
2. **The view is a thin three.js layer.** It reads sim snapshots and interpolates between ticks. The two connect in exactly one place.
3. **Track JSON is the source of truth.** The road mesh, racing lines, item boxes and coins are *generated* from it.
4. **Fixed 60Hz timestep; no per-frame allocation** in the sim step or the render sync. Pre-allocate and pool.
5. **Sprite and mesh size comes from world units**, never from an asset's pixel size (the lesson from 1.x PR #16).
6. **Supabase anon key is public.** All data protection is via **RLS** or `security definer` RPCs, never client-side checks.
7. **Child-safe by construction.** No free-text input anywhere (generated names only), no chat, no ads, no in-app purchases.
8. **Budgets are CI-gated.** 60fps with 2P split-screen on the reference hardware, <3 MB JS gzipped, <3 s to title.

## Sequencing
`plan.md` is the authoritative v2 roadmap (Phases A–J; A–F are the vertical slice). Keep `active-plan.md` as the per-feature working plan.
TDD all sim logic before wiring it into the view. AI balance is proven with the headless race sim, not by feel alone. Every phase ends with a human feel pass.
