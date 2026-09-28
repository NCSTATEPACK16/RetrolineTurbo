# Retroline Turbo 2.0 — Roadmap

Authoritative v2 roadmap. The spec is `docs/v2/PRD.md`, which gives the **why** for every item here.
1.x roadmap archived at `docs/v1/plan.md` (Phases 0–11 code-complete; 1.x stays live on Netlify from `main` until v2 is better).

**Branching:** v2 work lands on the long-lived `v2` branch (feature branches → PR into `v2`). `main` keeps 1.x hotfixes only.
**Method:** each phase gets a working plan (`active-plan.md`, per feature), TDD for all sim logic, and headless verification before any visual pass.
**Phases A–F are the vertical slice.** Nothing after F starts until the slice has been played and felt by a human.

---

## Phase A — Foundations
- [ ] Add `three` (tree-shaken imports only); Vite config for the v2 entry (`src/v2/main.ts`) alongside 1.x
- [ ] Carve out `sim/` (pure TypeScript, no DOM, no three.js) and `view/` (three.js). Add an ESLint import boundary rule that enforces it
- [ ] `SimWorld` state snapshot and a fixed 60Hz stepper (port `physics/loop.ts`); the view interpolates between two snapshots
- [ ] Input → `InputFrame` per tick (port `InputManager`; keyboard, gamepad, remap). Record and replay input streams (the ghost foundation)
- [ ] Headless benchmark harness plus CI budget gate (frame time, JavaScript size)
- **Done when:** an empty sim runs 10,000 steps headless and deterministically (same inputs → identical state hash), and the view opens a blank three.js scene at 60fps

## Phase B — Low-res pipeline and road
- [ ] Render into a ~427×240 target (320×240 on 4:3). Whole-number nearest-neighbour upscale; resize handling
- [ ] Palette-reduction plus ordered-dither post shader using `assets/palette.json`; optional CRT pass (port 1.x `CrtEffect`)
- [ ] **Track schema v2**: circuits (closed loop), segments (curve/pitch/width), racing line, item boxes, coin lines, spawn grid, scenery lists. Validator plus tests
- [ ] Road mesh generator from the track data (road, kerbs, rumble, shoulders, flat-shaded); ground plane; horizon parallax plates
- [ ] Billboard scenery sprites with a size-by-world-width contract (the lesson from 1.x PR #16)
- [ ] Chase camera: roll into turns, boost field-of-view widening, drift zoom
- **Done when:** Sunset Beach renders and loops at 60fps on the reference laptop, and the pixel-crawl, kerb-strobe and scenery-pop visual gates are signed off

## Phase C — Driving model
- [ ] Port `Vehicle` to v2 stats (speed / acceleration / handling / weight / off-road / mini-turbo); automatic gearbox by default, manual optional with a shift reward
- [ ] Hop-drift with mini-turbo tiers (blue/orange/purple), rocket start, slipstream, off-road drag, coins (capped speed buff)
- [ ] Car-to-car bump resolution (weight-based, handles lap wrap, 2D footprint, not lane-based)
- [ ] Junior assist: auto-accelerate, road-keeping nudge, no spin-outs, auto-drift
- [ ] Lap counting, checkpoints, wrong-way detection, respawn
- [ ] Juice: particles (sparks, dust, drift smoke), screen shake, hit-stop, speed lines
- [ ] F8 dev tuning overlay ported to v2 stats
- **Done when:** a human feel pass on the drift loop is signed off, and all sim rules are unit-tested

## Phase D — CPU racers
- [ ] Racing-line generation from track data; lane-offset targets
- [ ] Driver personality parameters (skill, aggression, item usage, mistake rate, drift skill)
- [ ] Awareness: overtake gap search, defend, hazard avoidance
- [ ] Fair rubber-banding (skill and mistake modulation by position; **no speed cheats**)
- [ ] Rival targeting (one per cup)
- [ ] **Headless race sim** in Vitest: 8-car seeded races with a reference player bot; balance acceptance thresholds per class
- **Done when:** the sim meets the PRD balance targets, and CPUs visibly race, pass, block and make mistakes in-game

## Phase E — Race layer: items, grand prix, split-screen
- [ ] Item boxes with position-weighted odds; Boost, Oil Slick, Shield, Draft Magnet, and the leader-homing catch-up item; "Pure" toggle
- [ ] Race flow: grid, countdown, 3 laps, finish, results, cup points table
- [ ] 2P split-screen (top/bottom, 120 lines each, per-player assist)
- [ ] Race HUD v2: position, lap, item slot, mini-map, portrait pop-ups (icon-first)
- **Done when:** a full 1-track cup plays start to finish solo and in 2P, and item odds are covered by sim tests

## Phase F — Cars, drivers, garage (slice art)
- [ ] Blender-scripted modular car kit: body, wheels, engine, spoiler, exhaust. Toon or flat, palette-clamped, glTF export pipeline
- [ ] Part catalogue v2 (trade-off stats), paint and decals, horns; unlock and purchase flow in the ported DOM garage shell
- [ ] 8 drivers: portraits (3 expressions), default paint, personality; name generator (no free text)
- [ ] Sampled SFX (engine layers, tyres, bumps, items); barks for 2 drivers
- [ ] Sequenced-music player plus the Sunset Beach theme (final-lap tempo up)
- [ ] 30-second icon tutorial
- [ ] **Slice sign-off:** play-test with at least one kid and one adult; confirm budgets on the reference laptop and iPad in Safari
- **Done when:** the PRD §16 slice definition is met

---

## Phase G — Persistence and online (post-slice)
- [ ] Supabase `retroline_v2` schema: profiles (generated names), saves, part inventory, time-trial results, ghosts (input streams), leaderboards. RLS on everything
- [ ] Plays and stat counters through a `security definer` RPC (fixes the 1.x RLS bug)
- [ ] Veteran paint job for existing 1.x profiles
- [ ] Time Trial mode with ghost upload and download
- **Done when:** the RLS advisor is clean, ghosts replay bit-exact across machines, and leaderboards work

## Phase H — Content build-out
- [ ] Remaining 7 circuits: Neon City Night, Canyon Desert, Snow Pass, **Tunnel/Cave with side lighting**, plus 3 to be named
- [ ] 2 cups × 4, engine classes, Mirror mode, full roster barks, music per track
- [ ] Full part catalogue and trophy unlocks
- **Done when:** both cups are complete at every class, with balance sims green per track

## Phase I — Road Trip mode
- [ ] Port the 1.x branching pyramid (`track/route.ts`) onto the v2 renderer and sim as a point-to-point mode

## Phase J — Polish and 2.0 launch
- [ ] Performance pass against budgets, PWA/offline, accessibility review (colour-blind palettes, remap), string table
- [ ] Switch the Netlify production deploy to v2; 1.x archived as a separate URL

## Later
- **2.1:** track editor and community tracks on the circuit format
- **iOS/iPadOS:** Capacitor, touch and gyro controls, paid versus free decision
- **3.0:** real-time online racing (deterministic sim plus input streams)
