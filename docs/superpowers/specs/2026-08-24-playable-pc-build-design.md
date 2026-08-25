# Playable PC Build — 4-Speed Gearbox, Soundtrack & Feel Tuning (design spec)

> **Finalized 2026-08-24.** Design questions resolved through brainstorming; implementation
> plan to follow via the `writing-plans` skill.

Goal: take the current branch from "all systems built, never tuned" to "a game you sit down
and play on a PC." This is a **finishing** spec, not a build spec — `npm test` is green at
558 tests across 61 files, and Phases 0–11 are landed. Three narrow gaps stand between the
repo and a playable, *fun* build, and one of them is a tool rather than a feature.

Scope explicitly excludes: new tracks, new art, Supabase work, iOS. Those are done or deferred.

---

## 1. Current state — what the audit actually found

Establishing this precisely matters, because the naive reading of "make it playable" would
rebuild three things that already work.

| Ask | Reality |
|---|---|
| "real controls" | **Already shipped.** `input/InputManager.ts` has WASD + arrows + analog mouse steering (deadzone + expo curve) + gamepad, eight actions including `gearUp`/`gearDown`/`nitro`, full rebinding with `serializeBindings`/`parseBindings` persistence. Phase 5 complete. |
| "NPCs same size as my car" | **Already fixed, uncommitted.** The working tree's `Renderer.ts` diff routes `car0..car3` onto the player's baked body atlas and the shared 12-step ladder. Root cause was the 22×14 procedural placeholder never migrating onto Spec C's bake pipeline — its tiny native footprint collapsed `ideal` to single-digit widths. Two tests cover it; suite is green. |
| "different gears" | **Partial.** A 2-speed box exists (`GEAR_MAX_KMH = [120, 290]`, `GEAR_ACCEL_KMH_S = [60, 25]`) — faithful to `plan.md` §7's OutRun spec, but it has no shift-point skill in it. |
| "retro/EDM music" | **Deliberately deferred, now unblocked.** `SoundEngine.ts:40-45` documents the deferral: no asset files existed, so a loader "would be dead code." The `musicBus` is built and routed; `SettingsScreen` already ships a "Soundtrack" slider through `ShellBridge` that controls nothing. |
| "intense and hard yet fun" | **Never addressed.** No tuning pass has happened. This is the actual centre of the request. |

## 2. Work packages

Four, ordered so each unlocks the next.

**P0 — Commit the traffic fix.** Already written and green. Zero design content; it just
needs to stop living in the working tree.

**P1 — Dev tuning overlay.** *First, because it changes the cost of everything after it.*

**P2 — 4-speed manual gearbox** (§3).

**P3 — Soundtrack: complete Phase 10 §6** (§4).

**P4 — Feel pass** (§6) — human-only, uses P1.

---

## 3. P2 — The gearbox

`plan.md` §7's 2-speed transmission is arcade-faithful but flat: with one shift point, there
is nothing to master. The chosen model is **Top Gear's 4-speed manual** — the SNES racer that
actually had a gearbox, where hitting the shift point is the skill that separates players.

### 3a. Constants (`constants.ts`)

```ts
export const GEAR_MAX_KMH   = [ 90, 150, 220, 290] as const;  // ceiling per gear
export const GEAR_MIN_KMH   = [  0,  70, 120, 180] as const;  // bottom of the torque band
export const GEAR_ACCEL_KMH_S = [95, 62, 38, 22] as const;    // peak accel per gear
export const TORQUE_FALLOFF = 0.55;  // how hard accel tapers toward a gear's ceiling
export const BOG_FACTOR     = 0.35;  // accel multiplier when below the band (mis-shift)
export const ENGINE_BRAKE_KMH_S = 45; // decel when downshifting above the band
```

`GEAR_MIN_KMH` deliberately overlaps the previous gear's ceiling, so each gear has a real
usable window rather than a single correct instant. Top speed stays **290 km/h**, preserving
`plan.md` §7's PRD figure and the existing `TOP_SPEED_WORLD` derivation.

### 3b. The torque band — where the skill lives

Acceleration is no longer flat within a gear. It peaks at the bottom of the band and tapers
toward the ceiling:

```
r      = clamp((kmh - GEAR_MIN_KMH[g]) / (GEAR_MAX_KMH[g] - GEAR_MIN_KMH[g]), 0, 1)
torque = 1 - TORQUE_FALLOFF * r²
accel  = GEAR_ACCEL_KMH_S[g] * torque
```

The optimal shift point is where the next gear's accel exceeds the current gear's tapered
accel. That point is *computable*, which makes it both unit-testable and teachable via the
shift light (§3d). Squaring `r` keeps the taper gentle early and sharp near the ceiling, so
the penalty for over-revving is felt rather than merely known.

### 3c. Mis-shift penalty — bog, not position

**Decision (was flagged open; resolved here):** an early upshift costs **time, recoverably**,
not position.

```
if (kmh < GEAR_MIN_KMH[g]) accel *= BOG_FACTOR;
```

Shift into 4th at 100 km/h and you crawl out of it. Rationale: the codebase already speaks
this language — `SKID_RECOVERY_STEPS = 12` makes skids a recoverable mistake rather than a
run-ender. A recoverable penalty teaches the shift point; an unrecoverable one just
frustrates, which fails the "fun" half of "hard yet fun." Downshifting above a gear's ceiling
applies `ENGINE_BRAKE_KMH_S` — useful for corner entry, so downshifting becomes a tactic and
not only a recovery.

### 3d. HUD (`ui/HUD.ts`)

A gear indicator plus a **shift light** that illuminates exactly when
`accel(g+1) > accel(g)`. The light is the teaching mechanism: it makes an invisible optimum
legible without a tutorial, and it is a pure function of state already on `PlayerState`.

### 3e. Engine audio (`audio/engineTone.ts`)

`ENGINE_F_BASE_LOW`/`ENGINE_F_BASE_HIGH` hard-code a two-gear world in `EngineToneParams`.
Replace the two scalars with a per-gear base-frequency array so each of the four gears has its
own pitch drop on shift. Phase 10 §4's formula `f_osc = f_base + (kmh / gearMaxKmh[g]) * f_range`
still holds — only the `f_base` lookup changes shape.

### 3f. Blast radius — this is a type migration, not a constants edit

`VehicleParams.gearMaxKmh` and `.gearAccelKmhS` are typed as fixed **2-tuples**
(`readonly [number, number]`). Widening to four gears is a breaking type change that reaches
three subsystems, and the implementation plan must sequence it as one atomic change or the
build breaks midway:

| File | What breaks |
|---|---|
| `constants.ts` | `GEAR_MAX_KMH`, `GEAR_ACCEL_KMH_S` grow to 4; `TOP_SPEED_WORLD` derives from `.length - 1` and survives unchanged |
| `physics/Vehicle.ts` | The two tuple types → `readonly number[]`. **`gearIdx` is 1-based** (`gearDown && gearIdx > 1`; `const g = gearIdx - 1`) — preserve that convention rather than silently renumbering |
| `physics/Vehicle.test.ts` | Asserts `GEAR_MAX_KMH[0]`/`[1]`; line ~297 constructs a 2-tuple literal `gearMaxKmh: [240, 580]` |
| `economy/Garage.ts` | `metricsToParams` hard-codes a 2-element literal `[GEAR_MAX_KMH[0] * speedF, GEAR_MAX_KMH[1] * speedF]` — must map over all gears |
| `economy/Garage.test.ts` | Asserts indices `[0]`/`[1]`; the "maxed car stays under 400 km/h" envelope check moves from index `[1]` to `[3]` |
| `audio/engineTone.ts` + test | Same 2-tuple param type; `EngineToneParams.fBaseLow`/`fBaseHigh` become an array (§3e) |

Phase 9's part-mod resolver is the subtle one: `speedF` currently scales exactly two ceilings,
and a maxed loadout is asserted to stay inside a readable envelope. With four gears that
guarantee must be re-derived, not assumed.

---

## 4. P3 — Soundtrack

**Do not redesign this.** Phase 10 §6 already specifies the playback architecture
(`MediaElementAudioSourceNode` streaming, separate music/SFX buses, `resume()` on an existing
user gesture). That design is sound and half-built. This package supplies the missing half:
the assets, the bake step, and the ~30 lines that connect them.

### 4a. Assets (licences verified 2026-08-24)

The repo's licence gate (research doc TASK 2: CC0/CC-BY/OFL only; CC-BY-NC and CC-BY-SA
rejected) applies. Both candidates were fetched and confirmed, not taken on trust — the
research doc's own Quaternius incident is the precedent for verifying per-item rather than
per-aggregator.

| Source | Licence | Role |
|---|---|---|
| [Retro Synthwave Music Pack](https://swarajthegreat.itch.io/retro-synthwave-music-pack) — 20 tracks | **CC0**, verbatim: *"Fully licensed under CC0, so you're free to use them in commercial and private projects without attribution."* | Primary — race + menu beds |
| [Eyeless (Retrowave)](https://opengameart.org/content/eyeless-retrowave) by Never Sleep | **CC0** option offered (also CC-BY 3.0/4.0; take the CC0 grant) | Hero / title track |

Record provenance in `art/LICENSES.md` alongside the existing model credits.

### 4b. `scripts/bake_music.py` — not optional

Eyeless ships as **55.8 MB WAV / 19 MB FLAC**. Shipping that raw violates `plan.md` §12 on
its own. The script transcodes source → OGG Vorbis + MP3 fallback at web bitrate, emits a
`manifest.json`, and follows the established `scripts/bake_*.sh` + `imageops.py` pattern:
a Python bake step producing a manifest that TypeScript parses. Manifest parsing mirrors
`parseAtlasManifest`/`parseBackdropManifest` — never throws, degrades to silence.

### 4c. Wiring

`SoundEngine` gains `playMusic(trackId)` / `stopMusic()` feeding the existing `musicBus`.
The "Soundtrack" slider in `SettingsScreen` starts controlling something real. Per Phase 10
§8, a missing or undecodable track degrades to silence and never throws.

---

## 5. P1 — Dev tuning overlay

The highest-leverage item in this spec, and the smallest.

A dev-only panel in the `ui-shell` (Phase 11's `ShellRouter`/`ShellBridge` is the natural
host) with live sliders bound to the tuning constants: gear ratios and accels, `TORQUE_FALLOFF`,
`BOG_FACTOR`, `SKID_CURVE_THRESHOLD`, `CENTRIFUGAL`, `STEER_RATE_PER_S`, `MU_OFFROAD`. A
"copy constants" button dumps the current values as a paste-able `constants.ts` block.

Gated behind `import.meta.env.DEV` so it cannot reach production.

**The seam is not `VehicleParams`.** That type carries exactly the four metrics Phase 9's
parts economy is allowed to move, and `Vehicle.ts:30-32` states the intent explicitly:
*"Everything else about the car (brake rates, off-road drag, skid thresholds) stays a module
constant — parts alter the metric surface described in the spec, nothing more."* Widening it
to carry `TORQUE_FALLOFF`, `BOG_FACTOR`, `SKID_CURVE_THRESHOLD`, `MU_OFFROAD` and
`STEER_RATE_PER_S` would let a dev tool quietly redefine what a *part* can do.

Instead: a dev-only `TuningOverrides` object, applied as a layer on top of the resolved
`VehicleParams` at `Vehicle` construction and empty in production. The overlay tunes the full
constant surface; `VehicleParams` keeps meaning "what a loadout may change." Two concerns,
two types.

Why first: every question in §6 is "does this number feel right," and without the overlay each
answer costs an edit-rebuild-drive cycle. With it, each answer costs a slider drag. This is
what makes the feel pass tractable at all.

---

## 6. P4 — The feel pass

Not delegable, and not automatable. The acceptance criterion is "is it fun," which no test
asserts and no agent can evaluate. Concretely: drive it, move sliders, find the values where
the gearbox reads as *demanding* rather than fiddly, and where the 290 km/h top end feels
dangerous rather than floaty. Then paste the constants back and commit them.

Expect this to surface follow-on work (traffic density, corner severity). Capture those as new
tasks rather than widening this spec.

---

## 7. Testing (vitest)

Follows the project's split: pure logic tested, browser edges thin and manual.

- **Pure/testable:** `torque(kmh, gear)` and `accel(kmh, gear)` as standalone functions;
  the bog penalty triggering below `GEAR_MIN_KMH`; engine braking above a ceiling; top speed
  still reaching exactly 290 km/h in 4th; the shift-light predicate `accel(g+1) > accel(g)`
  identifying a monotonic, unambiguous shift point per gear; music-manifest parsing against
  malformed input.
- **Regression guards:** the existing 558 tests must stay green — particularly
  `Vehicle.test.ts` (77 symbols) and the golden economy tests, since `GEAR_MAX_KMH` feeds
  `TOP_SPEED_WORLD` and Phase 9's part-mod resolver.
- **Thin/manual:** `MediaElementAudioSourceNode` wiring and the dev overlay's DOM, matching
  how `loadAtlases.ts` keeps fetch-and-decode separate from the pure math it feeds.

---

## 8. Execution strategy

The packages split into two lanes with opposite verification needs, and conflating them is
the main risk this spec exists to prevent.

| Lane | Packages | Definition of done | Automatable |
|---|---|---|---|
| **Mechanical** | P0, P2, P3 | `npm test` green | **Yes** |
| **Judgment** | P1 (partly), P4 | "it feels right" | **No** |

The mechanical lane is a checkbox plan driven either by `superpowers:executing-plans` /
`subagent-driven-development` (attended — review checkpoints, no context re-derivation), or
by `/loop` when unattended:

```
/loop work the next unchecked task in active-plan.md: implement it TDD,
run npm test, check the box, commit. When every box is checked, stop the loop.
```

The explicit stop condition is required; `/loop` re-fires a prompt and has no inherent
completion sense. **The loop must not be pointed at P4.** Turned loose on "make it fun," it
will retune constants indefinitely against no signal — the checkbox plan, not the loop, is
what carries progress.

---

## 9. Done-when

Four gears with distinct, audible pitch bands; the shift light marks a shift point that is
demonstrably optimal in tests and learnable in play; an early upshift bogs recoverably and a
late one visibly costs acceleration; top speed remains 290 km/h. A CC0 soundtrack streams
without blocking asset load, the Settings "Soundtrack" slider controls it, and a missing track
degrades to silence. The dev overlay tunes physics live in `npm run dev` and is absent from a
production build. `npm test` and `npm run build` green. And — the criterion none of the others
substitute for — you sit down at the PC, drive it, and want another run.
