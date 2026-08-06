# plan.md — Project Retroline Turbo: Sequential Build Plan (Web-First)

> **How to read this file.** `plan.md` is the ordered roadmap Claude Code follows.
> The **research report** (`game-development.md`) is the *logical backbone* — it sets
> the decisions, ordering, and benchmarks. The **Retroline Turbo technical spec** (the
> PDF) is the *implementation guide* — it supplies the math, schemas, physics, and
> pipelines. `CLAUDE.md` (see §6) is a separate always-on router, not this file.
>
> **Scope decision:** build and polish a **web** game first, deployed on **Netlify**
> with persistence on **Supabase**. iOS via Capacitor is deferred to the final phase
> and is intentionally *not* on the critical path.

---

## 1. Product summary

A retro pseudo-3D arcade racer in the Pole Position → TX-1 → OutRun lineage:
scanline segment-projected road, branching multi-stage track pyramid, arcade
handling with skid/recovery, a persistent post-race upgrade economy, and a stable
60fps "chunky retro" look. Desktop browser is the primary platform; iOS follows.

- **Target frame rate:** 60fps stable (hard floor 55fps).
- **Look:** fixed low logical framebuffer, nearest-neighbour upscaled (Pole Position pixel aesthetic).
- **Primary platform:** desktop + mobile web (Safari/Chrome), shipped on Netlify.
- **Persistence/backend:** Supabase (save, economy, leaderboards, shared tracks).
- **Deferred:** iOS native shell via Capacitor (touch/gyro/haptics).

---

## 2. Non-negotiable principles (from research §4 + spec architecture rules)

1. **Segment model, not real 3D.** The road is an array of segments projected with
   similar-triangles; curves are faked by offsetting camera-x per segment, hills by a
   per-segment `y`. This is Lou/Gordon's approach and the correct one for this workload.
2. **Renderer behind a `RenderBackend` interface.** Canvas 2D is the primary backend.
   A WebGL/PixiJS backend can be swapped in later *only* if profiling demands it or a
   GPU CRT post-process is wanted. This is a low-regret hedge — build the seam now.
3. **Fixed-timestep deterministic simulation.** Physics runs at a fixed 1/60s
   accumulator, decoupled from render; rendering interpolates. Determinism is what makes
   physics unit-testable in vitest.
4. **Fixed logical framebuffer + integer upscale.** Render to ~**480×270** (research
   recommendation; spec's 640×360 is the alternative), then nearest-neighbour scale to
   the window. This locks the retro look *and* bounds fill cost independent of display size.
5. **Zero external deps in the engine core.** Math, projection, physics, and raster use
   native browser APIs only. Third-party libs (audio, Supabase client, later Capacitor)
   live at the edges.
6. **No per-frame allocation in the render loop.** Pre-allocate vectors and sprite pools
   to avoid GC spikes.
7. **Strict module segregation.** Track data, renderer, input, physics, economy, audio,
   and UI stay in isolated modules with narrow interfaces.

---

## 3. Tech stack (web-first)

| Layer | Choice | Rationale (source) |
|---|---|---|
| Language | TypeScript (strict) | Spec + research; testable, modular |
| Bundler / dev | Vite | Fast HMR, ES modules, TS-native (research §3) |
| Render | HTML5 Canvas 2D (hardware-accelerated) behind `RenderBackend` | Right for ~300 quad fills + dozens of sprites; matches reference engines (research §3) |
| Optional render fallback | PixiJS (WebGL, Canvas fallback) | Only if WKWebView/mobile profiling drops frames, or for a CRT post pass |
| Audio | Web Audio API (procedural) + HTMLAudio for music | Hybrid: buffers for low-latency SFX, streamed music; resume on user gesture |
| Tests | Vitest | Unit-test pure logic headlessly |
| Hosting / CI-CD | **Netlify** (continuous deploy from repo) | Static SPA; deploy the shell from Phase 0 |
| Backend / persistence | **Supabase** (Postgres + Auth + RLS) | Save, economy, leaderboards, community tracks |
| iOS (deferred) | Capacitor + WKWebView | Final phase only |

---

## 4. Open-source & reference map (with license care)

- **Jake Gordon `javascript-racer` (MIT).** The definitive Canvas 2D segment-projection
  reference. MIT-licensed, so its *techniques and structure* can be adapted directly.
  Use it as the model for `p1/p2` projected points, `curve`, `y` hill coord, `sprites[]`
  with normalized `offset ∈ [-1,+1]`, `cars[]`, the two-phase render loop, and `maxy`
  hill clipping. Upgrade it from its "global-variable tech demo" form into the modular TS
  architecture in §5.
- **Lou's Pseudo 3D Page (extentofthejam.com).** Theory source for scanline segment roads
  and the 3D-projected-segment aesthetic. Reference, not code.
- **Cannonball (`djyt/cannonball`; forks `bni/`, `J1mbo/cannonball-se`).** Gold-standard
  *behavioural* reference for OutRun-faithful physics, AI traffic, and branching stages,
  plus the `LayOut` editor idea and (in `-se`) a GPU CRT filter recipe. **Do not port its
  code** — it is a C++/SDL re-implementation of arcade ROM behaviour, GPL-licensed, and
  needs original ROMs. Treat as observational reference only.
- **`ssusnic/Pseudo-3d-Racer`, `jamessimo/Phaser3-Road`.** Confirm the segment model ports
  cleanly to modern JS; useful cross-checks.
- **Commercial benchmarks (design reference, not code):** Slipstream (branching forks +
  Grand Prix money→upgrades), 80's Overdrive (engine/chassis/tyres upgrade taxonomy +
  built-in track generator), Horizon Chase 2 (per-car upgrade tokens), Hotshot Racing
  (car archetypes, 60fps overdraw caution).
- **Optional libs:** `howler.js` (MIT) if you want cross-browser audio abstraction;
  `@supabase/supabase-js` for backend; PixiJS (MIT) for the optional WebGL path.

> **License rule for Claude Code:** freely adapt MIT reference techniques (Gordon); never
> copy GPL Cannonball source into this codebase. When unsure, re-implement from the math
> in §7 rather than lifting code.

---

## 5. Repository / module architecture

```
src/
  types/        engine.ts        — Segment, TrackConfig, Camera, Vehicle, Sprite, BranchPoint
  math/         projection.ts    — pure transforms: S=d/z, screen proj, z-map, clip bounds
  engine/       RenderBackend.ts — interface (drawQuad, drawSprite, clear, present)
                Canvas2DBackend.ts
                Renderer.ts      — segment loop, rumble/lane lines, occlusion
                Background.ts     — multi-layer parallax
                TrackManager.ts   — load/parse schema, active-segment, route switching
                BranchRenderer.ts — dual-road quads, median wedge, path assignment
  physics/      Vehicle.ts        — fixed-step accel/brake/gear/skid/off-road
                loop.ts           — fixed-timestep accumulator + interpolation
  input/        InputManager.ts   — keyboard / mouse / gamepad (+ touch/gyro later)
  economy/      Garage.ts, upgrades.ts, save.ts (SaveBackend interface)
  net/          supabase.ts       — client, auth, save sync, leaderboards, track share
  audio/        SoundEngine.ts    — Web Audio synth + music
  ui/           HUD.ts, menus, GarageScreen, RouteMap, RemapScreen
  track/        editor/           — in-app track editor + JSON schema + generator
```

Deployment/config: `vite.config.ts`, `netlify.toml`, `supabase/` (schema/migrations),
`CLAUDE.md`, `plan.md`, `active-plan.md` (per-feature working plan).

---

## 6. CLAUDE.md contents (short router — prune ruthlessly)

Keep it always-true and small (research §9): one-line project goal; stack + versions;
the module map from §5; coding conventions; **test command (`vitest`)** and build/deploy
commands; a pointer to this `plan.md` for sequencing; and hard rules —
*"physics is deterministic/fixed-timestep and unit-tested"*, *"renderer stays behind
`RenderBackend`"*, *"no per-frame allocation in `render()`"*, *"Supabase anon key is
public; all data protection is via RLS"*. Convert must-always rules into hooks where possible.

---

## 7. Math & rendering foundations (Claude Code must get these exact — from the spec)

**Perspective projection (similar triangles).** With camera height `h_camera`, focal
distance `d_screen`, forward depth `z_world`:

```
S       = d_screen / z_world                              // world→screen scale
X_s     = W/2 + S * (x_world - x_camera) * (W/2)
Y_s     = H/2 - S * (y_world - y_camera) * (H/2)
```

**Z-map (inverted projection for flat ground, y_world=0).** Precompute depth per scanline:

```
z(Y_s)  = (h_camera * d_screen) / (Y_s - Y_horizon)
```

Accumulate texture position down scanlines for correct compression toward the vanishing
point: `Z_next = Z + ΔZ; ΔZ_next = ΔZ + ΔΔZ` (ΔΔZ = constant perspective acceleration).

**Curvature + elevation accumulation (per segment i, far→near).** Each segment carries
curve `K_i` and pitch `P_i`:

```
dx += K_i ;  x_center(i) = x_center(i-1) + dx     // centrifugal horizontal drift
dy += P_i ;  y_screen(i) = y_projected(i) + dy    // hills
```

**Hill occlusion (cheap painter's alternative).** Track the max screen-y drawn (`maxy` /
`Y_clip`). If a segment projects *below* `Y_clip`, it's hidden behind a foreground crest —
discard it; else render and raise `Y_clip`.

**Branching geometry.** At a fork, instantiate two center-lines:
`Road A = -(W_road/2) - ΔX_branch`, `Road B = +(W_road/2) + ΔX_branch`, `ΔX_branch`
growing over `splitDurationSegments`; fill the wedge between inner borders with median
terrain. Path resolution at the node: `X_player < 0 → Branch A` else `Branch B`; unload
the unchosen branch.

**Sprite scaling + depth.** Sort far→near (painter's), then per sprite on segment i:

```
scale   = d_screen / z_i
X_draw  = x_screen(i) + scale * X_offset * (W/2)
Y_draw  = y_screen(i)
```

Clip sprite bottom scanlines against the segment's `Y_clip` so trackside objects don't
bleed through hills.

**Parallax background.** Layer offsets driven by camera pan + curvature:
`ΔX_bg_layer = (ΔX_camera * K_layer_speed) + (K_i * V_player * K_curve_layer_speed)`
with e.g. sky ×0.001, hills ×0.002, trees ×0.003.

**Physics targets (spec PRD).** 2-speed transmission (Low 0→120 km/h high torque, High
120→**290 km/h**); entering `K_i > threshold` at max speed triggers a **skid** (grip −60%);
recovery requires releasing throttle + counter-steering; off-road drag `μ_offroad = 0.85`.
Fixed step 16.66ms.

**Render frame order (spec).** clear + sky/parallax → compute camera + active segment →
segment loop near→far (projection, `Y_clip`, quads/rumble/lanes) → branch check (secondary
quads + median) → sprites far→near with clipping → player car (steer/skid tilt) → HUD.

---

## 8. Supabase data model (new — supports save/economy/leaderboards/community tracks)

Use **Supabase Auth** (anonymous sign-in acceptable for a web arcade; allow later
upgrade to email/OAuth). All tables protected by **Row-Level Security**; the anon key is
public and safe *because of* RLS.

```
profiles         (id uuid PK = auth.uid, display_name text, created_at)
saves            (user_id uuid PK/FK, credits int, owned_cars jsonb,
                  upgrades jsonb, unlocked_stages jsonb, settings jsonb, updated_at)
race_results     (id uuid PK, user_id FK, track_id text, route text,
                  time_ms int, position int, credits_earned int, created_at)
tracks           (id uuid PK, author_id FK, name text, data jsonb,
                  is_public bool, plays int default 0, created_at)      -- community/shared
leaderboard_best (view: min(time_ms) per (track_id) join profiles for display_name)
```

**RLS policies.** `saves`: user can select/update only `user_id = auth.uid()`.
`race_results`: insert own rows; select all (for leaderboards) or expose via a
read-only view. `tracks`: select where `is_public` or `author_id = auth.uid()`; insert/
update/delete only own. `profiles`: select all, update own.

**Client seam.** `economy/save.ts` defines a `SaveBackend` interface with a
`LocalStorageBackend` (offline dev) and a `SupabaseBackend` (real). Build economy against
the interface first, wire Supabase in Phase 8 — swap without touching game logic.

---

## 9. Netlify deployment

- `netlify.toml`: `build.command = "npm run build"`, `publish = "dist"`, SPA redirect
  (`/* → /index.html 200`).
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public, RLS-protected).
- **Deploy the empty shell in Phase 0** and keep continuous deploy on `main` — every phase
  lands on a live URL, so the "web-first, polish before iOS" loop is real from day one.
- Cache-bust hashed assets; set long cache for `/assets/*`, no-cache for `index.html`.

---

## 10. Sequential phases

Each phase lists **Goal → Deliverables → Research anchors → Done-when**. Anchors point to
the exact detail in the two docs so nothing is lost.

### Phase 0 — Scaffold, loop, live deploy
- **Goal:** repo, tooling, deterministic loop, and a live Netlify URL wired to Supabase env.
- **Deliverables:** Vite+TS(strict)+vitest; `CLAUDE.md`; `RenderBackend` interface +
  `Canvas2DBackend` stub; fixed-timestep `loop.ts` (accumulator + interpolation);
  `netlify.toml`; Supabase project created with the §8 schema + RLS migrations; `net/supabase.ts`
  client (anonymous auth).
- **Research anchors:** principles §2.2–2.3; Netlify §9; Supabase §8; CLAUDE.md §6.
- **Done-when:** blank canvas ticks at fixed 60Hz, deploys green on Netlify, `vitest` runs.

### Phase 1 — Core math engine & domain types
- **Goal:** pure, tested transforms with no game logic.
- **Deliverables:** `types/engine.ts` (Segment, TrackConfig, Camera, Vehicle, Sprite,
  BranchPoint); `math/projection.ts` (`S=d/z`, screen projection, z-map, clip bounds).
- **Research anchors:** all of §7 (projection, z-map, ΔΔZ accumulation).
- **Done-when:** vitest verifies scaling `S=d/z` across `z ∈ [1,10000]` and coordinates
  collapse correctly to `Y_horizon`.

### Phase 2 — Pseudo-3D rasterizer: straight road (Gordon v1)
- **Goal:** a standalone scanline rasterizer drawing a straight road at 60fps.
- **Deliverables:** `engine/Renderer.ts` — trapezoid segment quads, alternating rumble
  strips, lane lines, ground bands.
- **Research anchors:** §7 frame order; segment model §2.1; Gordon MIT reference §4.
- **Done-when:** straight road renders stable at the fixed logical resolution, integer-upscaled.

### Phase 3 — Curves + hills with occlusion (Gordon v2/v3)
- **Goal:** faked curves and hills with correct crest occlusion.
- **Deliverables:** curve via progressive camera-x offset (`dx += K_i`); hills via
  per-segment `y` (`dy += P_i`); `maxy`/`Y_clip` occlusion; `engine/Background.ts` parallax.
- **Research anchors:** §7 curvature/elevation + occlusion; parallax coefficients §7.
- **Done-when:** an S-curve over a crest hides far segments correctly; parallax layers pan.

### Phase 4 — Sprites, traffic, collisions, HUD; lock the look
- **Goal:** roadside sprites, AI traffic, collision boundaries, HUD; finalize retro look.
- **Deliverables:** far→near sprite sort + scaling + `Y_clip` bottom-clip; traffic cars as
  depth-sorted sprites; collision/off-road boundaries; `ui/HUD.ts` (speedo, gear, timer,
  mini-map); confirm **480×270** logical framebuffer + nearest-neighbour upscale.
- **Research anchors:** §7 sprite scaling/depth; look-lock §2.4; performance budgets §12;
  Hotshot overdraw caution (research §2).
- **Done-when:** dozens of sprites + traffic render sorted with no hill bleed-through, 60fps.

### Phase 5 — Vehicle physics + desktop controls
- **Goal:** the arcade feel and the primary (desktop) input scheme.
- **Deliverables:** `physics/Vehicle.ts` (accel curve, 2-speed gears, top speed 290 km/h,
  skid state −60% grip, counter-steer recovery, off-road `μ=0.85`); `input/InputManager.ts` —
  **WASD default (W=gas / S=brake stacked, A/D steer)**, **arrows as full mirror alternate**,
  **analog mouse-X steering** (center deadzone + tunable, exponential-option sensitivity),
  gamepad (LT/RT + left stick), Space=handbrake, Q/E or Shift/Ctrl for gears/nitro;
  `ui/RemapScreen` (full rebinding). Mouse also drives all menus.
- **Research anchors:** controls research §7; physics spec PRD (§7 here); determinism §2.3.
- **Done-when:** vitest confirms top-speed limits + consistent skid triggers; all three
  input paths steer identically; rebinding persists.

### Phase 6 — Track data format, loader, editor, generator
- **Goal:** a data-driven, hand-authorable track pipeline.
- **Deliverables:** JSON schema per spec (`trackId, stageName, segmentLength, rumbleWidth,
  lanes, colors{}, segments[{index,length,curve,pitch,sprites[]}], branchPoint{}`);
  `TrackManager` loader/validator; **in-app track editor** (`track/editor/`); **seeded
  procedural generator** (segment-append: straights/arcs, vary length/angle, place sprites).
- **Research anchors:** track schema (spec); editor-first lesson + procedural pattern
  (research §6, 80's Overdrive/LayOut).
- **Done-when:** a hand-authored track and a generated track both load and play; loader is
  unit-tested against malformed input.

### Phase 7 — Branching pyramid & many levels
- **Goal:** the OutRun/TX-1 five-stage expanding fork as the "many levels" backbone.
- **Deliverables:** `engine/BranchRenderer.ts` (dual-road quads, median wedge, path
  assignment); route state machine; **5 stages / 15 unique scenes / 25 route permutations /
  multiple endings**; support **3-way forks** (left/straight/right); checkpoint-timer
  extension per fork; a `RouteMap` screen (show the pyramid at stage end).
- **Research anchors:** branching geometry §7; pyramid counts + TX-1 3-way forks (research §6).
- **Done-when:** player can traverse distinct 5-stage routes; unchosen branches unload;
  median renders between roads at the fork.

### Phase 8 — Supabase persistence integration
- **Goal:** swap the local save adapter for the real backend; add leaderboards + track sharing.
- **Deliverables:** `SupabaseBackend` implementing `SaveBackend`; save sync on race end;
  `race_results` insert + `leaderboard_best` reads; publish/browse community tracks
  (`tracks.is_public`); anonymous-auth → optional account upgrade.
- **Research anchors:** Supabase model §8; economy save requirement (research §5).
- **Done-when:** a save survives reload across devices under one account; a best time
  appears on a per-track leaderboard; a shared track is loadable by another user. RLS
  verified (no cross-user reads/writes).

### Phase 9 — Modular economy & post-race shop
- **Goal:** the persistent, skill-earned post-race economy — a **modular, stat-altering**
  parts system (replaces any linear tier ladder) with a data-driven Garage shop.
- **Model:** vehicles start at a **median baseline of 50/100** on every core metric; parts
  add/subtract from those baselines, so high-end parts are *specializations with trade-offs*,
  not strict upgrades. Metric→physics mapping (see §7): **Top Speed→`maxSpeed`**,
  **Acceleration→`accel`**, **Handling→`maxSteer`**, **Grip→`centrifugal`** (skid threshold +
  off-road resistance).
- **Deliverables:**
  - `types/inventory.ts` — `Part` interface (`id, name, category, cost, speedMod, accelMod,
    handlingMod, gripMod`) + `EquippedLoadout` (one part per category).
  - **80-part JSON catalog** — four categories × 20 items: **Engine** (biases `maxSpeed`, weight
    penalises handling), **Transmission** (biases `accel`, short ratios cap top speed),
    **Suspension** (biases `maxSteer`, stiff tunes cost grip off-road), **Wheels/Tires** (biases
    `centrifugal`/grip, slicks trade a little top speed for cornering).
  - `economy/Garage.ts` — pure loadout resolver (baseline + equipped mods → effective
    `Vehicle` params) feeding `physics/Vehicle.ts`; owned/equipped/credits in the save.
  - **Payout logic** (awarded at finish → Post-Race Summary): **placement** base scaled by
    position (e.g. 1st 1000c / 2nd 750c / 3rd 500c), flat **fastest-lap bonus** (~500c) if the
    player holds the session's best single lap, **clean-race multiplier** (~1.1×) for no
    trackside collisions.
  - `ui/GarageScreen` — Post-Race **Summary** (ledger breakdown: placement + bonuses = total),
    a **horizontal carousel** of the four categories, **stat-diff UI** (red/green bars: equipped
    part vs. hovered/selected part), and per-part state **Locked / Purchasable / Owned / Equipped**.
  - Multiple car archetypes (accel vs top-speed vs handling) sharing the same baseline+parts model.
  No loot boxes.
- **Research anchors:** economy design research §5 (80's Overdrive engine/chassis/tyres taxonomy,
  Slipstream money→upgrades, Horizon Chase 2 tokens); anti-rubber-band note; metric→physics
  mapping §7; source spec `docs/superpowers/specs/2026-08-05-phase-9-modular-economy.md`.
- **Done-when:** race→earn→buy→equip loop is closed and persisted; equipping a part visibly and
  correctly shifts effective physics params via the baseline+mod resolver; the stat-diff UI
  reflects real deltas; costs tuned for a ~20-min/day player; economy math (payout curve,
  baseline+mod resolution, save/load round-trip) unit-tested; specialization trade-offs prevent a
  single dominant loadout.

### Phase 10 — Audio & juice
- **Goal:** procedural engine audio, SFX, music, optional CRT.
- **Deliverables:** `audio/SoundEngine.ts` — Sawtooth `OscillatorNode` → low-pass
  `BiquadFilterNode` (cutoff = f(RPM)) → `GainNode`; `f_osc = f_base + (V_car/V_max_gear)*
  f_range` (`f_base=40Hz` low gear) for gear-shift drops; tire squeal = white noise →
  high-pass `1200Hz`, gain by skid magnitude; hybrid audio (streamed music, preloaded SFX
  buffers, separate music/SFX gain, **resume AudioContext on user gesture**); optional
  WebGL/PixiJS CRT post pass (scanlines/curvature/bloom), **off by default on mobile**.
- **Research anchors:** audio synthesis (spec); hybrid Web Audio best practice + CRT via
  Cannonball-SE (research §3–4).
- **Done-when:** engine pitch tracks speed/gear; SFX are low-latency; music streams;
  autoplay policy handled.

### Phase 11 — Web polish & release
- **Goal:** ship a polished web build.
- **Deliverables:** menu/flow polish, settings, accessibility of controls, PWA/offline
  shell (optional), asset/texture atlases, capped canvas resolution, WKWebView-safe memory
  use; profiling pass on mid-range laptop + mobile Safari.
- **Research anchors:** performance budgets §12; WKWebView pitfalls + overdraw caution (research §3).
- **Done-when:** sustained 60fps desktop, ≥55fps mobile web on target devices; budgets met.

### Phase 12 — iOS via Capacitor (deferred)
- **Goal:** native iOS shell *after* the web game is polished.
- **Deliverables:** Capacitor wrap (WKWebView, orientation lock); touch overlay; gyro tilt
  via `DeviceMotionEvent.requestPermission()` (gesture-gated, feature-detected, re-requested
  each launch); `@capacitor/haptics` presets (collision=heavy impact, gear/UI=selection);
  device perf pass; App Store prep. CoreHaptics custom plugin only if engine-rumble is a priority.
- **Research anchors:** iOS controls + haptics + WKWebView permission caveats (research §8).
- **Done-when:** installable iOS build steers by touch + tilt, haptics fire, budgets hold.

---

## 11. Testing & validation matrix

- **Math (vitest):** projection `S=d/z` across `z ∈ [1,10000]`; horizon collapse; z-map monotonic.
- **Physics (vitest):** deterministic ticks → top speed 290 km/h (High); skid triggers on
  overspeed cornering; off-road drag applied; identical result across input paths.
- **Track loader (vitest):** valid tracks parse; malformed JSON rejected with clear errors.
- **Economy (vitest):** payout curve (placement/fastest-lap/clean-race); baseline+mod loadout
  resolution → effective `Vehicle` params; no single dominant loadout (trade-offs hold);
  save/load round-trips; Supabase RLS (no cross-user access).
- **Performance:** frame-time <16.66ms sustained on desktop and mobile web over a 10-min
  run; watch for GC pauses; branch/fork scenes stay in budget.

---

## 12. Performance budgets (spec, web targets first)

| Metric | Web desktop | Mobile web | Hard limit |
|---|---|---|---|
| Frame rate | 60fps | 60fps (≥55) | 55fps |
| Physics step | 16.66ms fixed | 16.66ms fixed | deterministic |
| Logical framebuffer | 480×270 (or 640×360) | same | 854×480 max |
| Draw calls/frame | <150 quads | <150 quads | 250 quads |
| On-screen sprites | 80 | 60 | 100 |
| Heap | <40MB | <30MB | <60MB |
| Initial JS | <1.5MB | <1.5MB | <3.0MB |

Budget-eroders to avoid: gradient fills, shadow blur, per-frame allocations, oversized
textures. Threshold to introduce a WebGL sprite layer: sustained >16.6ms in profiling.

---

## 13. Claude Code workflow notes

- **Plan mode before edits.** Use plan mode to design each phase; keep a per-feature
  `active-plan.md`.
- **Subagents for fan-out.** Delegate independent work (e.g., track-editor scaffold,
  physics test suite) to subagents that report summaries, keeping main context clean; use a
  reviewer subagent to diff work against the phase's Done-when list.
- **Keep logic pure, rendering thin** so everything above is testable headlessly.
- Verify evolving Claude Code / Capacitor / Supabase syntax against current docs at build time.
