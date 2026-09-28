# Retroline Turbo 2.0 — PRD

> Status: **agreed** (grilling session, 2026-09-27). Every decision below was put to the owner and confirmed.
> 1.x plans are archived at `docs/v1/`. The roadmap lives in `/plan.md`.

## 1. Vision

**A Top Gear road with a Pole Position horizon, and a Mario Kart soul.**
A pseudo-3D-feeling arcade racer with a chunky 16-bit look, played at a locked 60fps in the browser (iPad and iPhone later). Named rivals, light items and drift-boost driving make it fun at 5 and deep at 50.

### Why a 2.0 (findings from the 1.x audit)
- **The CPUs are traffic, not racers.** 12 cars on rails, 3 fixed lanes, constant speed, always slower than the player. No steering, avoidance, positions or laps (`src/engine/Traffic.ts`).
- **The CPUs were drawn 15–18× too small.** Their sprite size came from a 22px placeholder, not their world width. Fixed in 1.x by PR #16. Props share the flaw.
- **Upgrades are invisible.** 80 stat-only part tiers, none of them visible while driving.
- **The content is thin.** 1 car model, 1 hand-authored track, 1 unheard music track, a synth-tone engine sound, no touch input.
- **Worth keeping:** deterministic 60Hz physics, 605 tests, the Supabase schema with RLS, the palette, the Blender bake scripts, the track schema and branching-route logic, and the DOM UI shell.

## 2. Audience and accessibility (ages 5–50)

| Lever | Decision |
|---|---|
| Engine classes | 50cc / 100cc / 150cc-style classes plus Mirror mode |
| Junior assist (per player) | Auto-accelerate, steering nudges back toward the road, no spin-outs, auto-drift |
| Rubber-banding | Adaptive and **fair**: it modulates CPU skill and mistake rate by position, never raw speed or teleports |
| Non-readers | Icon- and colour-first UI; string table ready for localisation later (English only at launch) |
| Onboarding | Skippable 30-second first-race tutorial that shows icons, not text |
| Gearbox | **Automatic by default**. Manual is optional, and a well-timed shift gives about a 3% edge |

Split-screen assist is per player, so a kid on Junior can race a parent on 150cc.

## 3. Modes

| Mode | Scope |
|---|---|
| Grand Prix | 8 racers, closed circuits, 3 laps, cups of 4 tracks, points table |
| Time Trial | Solo, with online ghosts and leaderboards |
| Versus | Local 2-player **split-screen** (top/bottom) |
| Road Trip | The 1.x OutRun branching pyramid, point-to-point. **After the slice** |
| Online | Asynchronous only: ghosts and leaderboards through Supabase. Real-time netcode is 3.0 |

## 4. Driving

- **Hop-drift with mini-turbo tiers** (blue → orange → purple sparks). This is the main skill mechanic.
- **Rocket start**: time the throttle to the countdown.
- **Slipstream**: sit behind a car to charge a draft boost.
- **Car-to-car bumping** with weight-based physics.
- **Coins** on track: credits, plus a small top-speed buff capped at 10 coins, Mario Kart-style.
- **Camera**: low chase camera in the Top Gear style. It rolls slightly into turns, widens the field of view during a boost, and briefly zooms in during a drift.
- Existing skid/recovery, off-road drag and gear models are re-tuned into this, not thrown away.

## 5. Items (light, non-violent; a "Pure" toggle turns them off)

Slice set: **Boost · Oil Slick · Shield · Draft Magnet** · **catch-up homing item** that targets the leader.
Item odds depend on race position: leaders get defensive items, trailing players get catch-up items.

## 6. CPU AI (six layers)

1. **Racing-line follower.** A per-track racing line generated from track data, plus lane offsets.
2. **Personality per driver.** Skill, aggression (blocking and bumping), item usage, mistake rate, drift skill.
3. **Awareness.** Find gaps to overtake, defend when being passed, avoid hazards and oil.
4. **Fair rubber-banding.** Skill and mistake rate are modulated by position; no speed cheats.
5. **Rivals.** One named rival per cup who targets the player, with taunt portraits and voice barks.
6. **Bumping physics.** Weight classes matter.

**Balance is tested with numbers.** A headless race sim in Vitest runs full 8-car races with a scripted player bot. Example acceptance check: "at 100cc Normal, the reference bot finishes 3rd–5th in at least 80% of 50 seeded races."

## 7. Drivers

A mixed original cast of 8: humans, robots, animals and one oddball (for example, a sentient traffic cone).
Each driver has a pixel portrait in 3 expressions (neutral, happy, angry), a default paint scheme, an AI personality and voice barks.
Silhouettes and colours must read at 32px. Every driver uses the customisable car; identity comes through portrait, voice and paint.

## 8. Car customisation (Mario Kart 8 model)

| Slot | Look | Stats |
|---|---|---|
| Body | Mesh | Speed, weight, handling |
| Wheels / tires | Mesh | Acceleration, off-road, grip |
| Engine | Mesh (engine cover/intake) | Speed, acceleration |
| Spoiler | Mesh | Handling, mini-turbo |
| Exhaust | Flame colour and shape | Mini-turbo |
| Paint / decals | Material and decal | — (cosmetic) |
| Horn | Sound | — (cosmetic) |

- Stats: **speed / acceleration / handling / weight / off-road / mini-turbo**.
- Every stat-bearing part is a **trade-off**; there is no strictly-best build.
- Parts are unlocked by trophies and bought with credits.
- Parts are **visible in-race** because cars are real low-poly 3D (§10).

## 9. Economy and monetisation

- Earn credits from finishing position and coins. Cup trophies unlock whole part sets.
- **No ads and no in-app purchases in 2.0.** Revisit paid-app versus free at the iOS phase.
- **Fresh v2 save.** New Supabase schema `retroline_v2`. 1.x players get a "Veteran" paint job.
- Fix the 1.x plays-counter RLS bug by incrementing through a `security definer` Postgres RPC.

## 10. Rendering and art

- **three.js** renders into a **~427×240 low-res target** ("widescreen SNES"; about 320×240 on 4:3 iPad).
- That target is upscaled by a whole-number factor with nearest-neighbour filtering.
- A **palette-reduction and ordered-dither** post shader. The existing CRT pass stays as an optional toggle.
- **The road mesh is generated from the segment and track data** (curve and pitch), with rumble strips and kerbs as flat-shaded geometry.
- **Cars, CPUs and items** are low-poly 3D meshes, toon or flat shaded and clamped to the master palette. They read as chunky sprites on screen, but parts are swappable meshes and spin-outs rotate smoothly.
- **Scenery** (trees, signs, crowds, palm rows) is billboarded pixel sprites.
- **Horizon** plates use parallax, as in 1.x.
- **Split-screen** is a top/bottom split, 120 lines per player.
- **Art source:** a Blender-scripted modular car kit (via Blender MCP) is the house style. Kenney and other CC0 packs are placeholders during the slice. AI 3D generation only for odd one-off props.
- **The 1.x art-direction research still applies** (`docs/research/2026-08-10-*`): 40–48 colour master palette, flat ramps, chunky silhouettes, no gradients or soft blur. It is amended because cars now rotate in 3D.
- **Juice layer:** screen shake, hit-stop on bumps, spark and dust particles, speed lines, squash-and-stretch on landings, boost field-of-view widening.

## 11. Content (2.0)

**2 cups × 4 circuits = 8 tracks.** Themes:
- Sunset Beach
- Neon City Night
- Canyon Desert
- Snow Pass
- **the tunnel/cave stage with side lighting**
- 3 more, chosen during production

The slice ships **Sunset Beach** only.

## 12. Audio

- **Course music:** SNES-style **sequenced music** (samples plus a tracker-style sequencer, procedural-friendly). One theme per track, with a faster tempo on the final lap.
- **CC0 sampled sound effects:** engine layers, tyres, bumps, items.
- **Voice barks** per driver.
- Keep the 1.x music/SFX buses.

## 13. Child safety and privacy (COPPA-minded)

- **No free text anywhere.** Names come from a generator ("Turbo Otter 42"). No chat.
- Anonymous Supabase auth only. Upgrading to an account is optional and labelled "parent/13+".
- Ghost and leaderboard entries show only the generated name and the car.

## 14. Architecture (replaces the 1.x hard rules)

1. **The simulation core is pure TypeScript and deterministic.** No three.js, no DOM. Physics, AI, items, race rules and economy all run headless in Vitest, including full CPU-only races.
2. **Rendering is a thin three.js view.** It reads simulation state and interpolates between ticks. The two only connect in one place.
3. **Track JSON is the source of truth.** Segments, racing line and item boxes live in one schema; the road mesh and AI lines are *generated* from it.
4. **Fixed 60Hz timestep. No per-frame allocation** in hot loops (sim step, render sync).
5. **Supabase stays at the edges.** All protection is via RLS; the anon key is public.
6. **Replays are the recorded inputs.** Determinism makes ghosts cheap and keeps the door open for 3.0 netcode.

### Carry-over from 1.x
- **Reused with adaptation:** `physics/` (vehicle, gearbox, loop), `economy/save` backends, `net/` (client, account, leaderboards), `track/schema` and `route` (Road Trip), `assets/palette.json`, `scripts/*.py` bake pipeline, `ui-shell/` components and tokens, `input/` (keyboard, gamepad, remap).
- **Replaced:** the Canvas2D `Renderer` and backends, `Traffic`, `Collision`, the canvas `ui/` screens, the part catalogue, and the `main.ts` god-module.

## 15. Budgets

| Budget | Target |
|---|---|
| Frame rate | 60fps locked, **2P split-screen**, on a mid-2019 integrated-GPU laptop and an iPad 9th gen |
| JavaScript | < 3 MB gzipped (three.js tree-shaken) |
| First load | < 15 MB including audio. Tracks streamed on demand |
| Time to title | < 3 s on a typical connection |
| CI | Headless benchmark scene gates the budgets |

## 16. Vertical slice (definition of "playable 2.0")

- **Sunset Beach** circuit, 3 laps.
- **8 racers**: the player plus 7 personality CPUs, including 1 rival.
- **A 1-track cup** with a points table.
- **A garage** with about 3 parts per slot, visible on the car, stats changing handling.
- **Drift and mini-turbo, rocket start, slipstream**, and the 5-item set.
- **Keyboard and gamepad**, with **2P split-screen**.
- **Junior assist** and **automatic gearbox**.
- Sequenced music for one track, sampled SFX, barks for 2 drivers.
- **AI balance sim** in CI.
- **Budgets met** on the reference laptop.

## 17. Out of scope for 2.0

Real-time online racing · the track editor and community tracks (return in 2.1 on the circuit format) · touch controls and Capacitor iOS (the phase after 2.0) · monetisation · localisation beyond the string table.

## 18. Open for later

- Paid versus free app on iOS.
- Touch and gyro control scheme.
- Names of the 3 unassigned track themes.
- The final roster names and designs.
