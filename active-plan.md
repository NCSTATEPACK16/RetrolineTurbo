# active-plan.md — Phase 0: Scaffold, Loop, Live Deploy

Per-feature working plan (see `plan.md` §13). Replace contents when starting the next phase.

## Checklist
- [x] Vite + TS(strict) + Vitest tooling (`package.json`, `tsconfig.json`, `vite.config.ts`)
- [x] `CLAUDE.md` router
- [x] `netlify.toml` SPA shell + caching
- [x] `index.html` (letterboxed, nearest-neighbour canvas) + `src/main.ts` entry
- [x] `src/constants.ts` — 480×270 logical framebuffer, fixed step
- [x] `src/engine/RenderBackend.ts` interface (primitive-arg methods)
- [x] `src/engine/Canvas2DBackend.ts` stub (clear/present/resize live; geometry no-op until Phase 2)
- [x] `src/physics/loop.ts` — pure `stepAccumulator` + `createLoop` (interpolation alpha)
- [x] `src/physics/loop.test.ts` — Vitest accumulator determinism/clamp
- [x] `supabase/migrations/0001_init.sql` — schema + RLS
- [x] `src/net/supabase.ts` — client + `ensureAnonSession()`
- [ ] `npm install` → `npm test` green → `npm run build` clean
- [ ] Supabase MCP: create project, apply migration, write `.env`
- [ ] git init → push to `NCSTATEPACK16/RetrolineTurbo` → Netlify green

## Done-when
Blank 480×270 canvas ticks at fixed 60Hz; `vitest` runs green; production build succeeds;
migration applied with RLS; shell deploys green on Netlify.
