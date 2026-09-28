# Retroline Turbo 2.0 — What's left

Snapshot: 2026-09-28, `v2` at the "slice minus audio" checkpoint (issues #17–#37 done).
`plan.md` is the roadmap and `docs/v2/PRD.md` the spec. This file lists **what is not done yet**, including gaps and follow-ups inside finished items, so nothing gets lost between the roadmap's checkboxes.

---

## 1. Vertical slice: open issues (Phase F)

| Issue | What | Notes for whoever picks it up |
|---|---|---|
| **#38** Sampled SFX + voice barks | Engine layers crossfaded by RPM, tyres, bumps, items; barks for 2 drivers (suggest Rosa Rocket and Bolt-7) | Plan: **synthesise every sample from a script in the repo** (`scripts/bake_sfx.py`), so the audio is original and can be dedicated CC0 with no downloads. An `ATTRIBUTION.md` still ships listing each file and how it was made. Barks can be gibberish "babble" voices (formant-synth for Rosa, bleeps for Bolt-7), which suits a kids' game and needs no voice actors. The 1.x `src/audio/SoundEngine.ts` / `engineTone.ts` are worth porting. Hooks already exist: `world.impact` (bumps), `race.items.hits` / `spin` (items), `Popups` (overtakes, being hit, when to bark), `car.rpm` and `gear` (engine). Barks need a cooldown so they don't spam |
| **#39** Sequenced music + Sunset Beach theme | SNES-style sequenced player (Web Audio), one theme, tempo up on the final lap | The 1.x `bake_music.py` pipeline transcodes recorded tracks and doesn't sequence. v2 needs a small pattern/step sequencer (square/triangle/noise + a few samples). Trigger the final-lap tempo from `lapOf(racer) === race.laps - 1` |
| **#40** Icon-only first-race tutorial | Skippable ~30 s tutorial made of icons, not words | Show it on the first race (flag in the profile). Show icons for steer, throttle, drift (hold), item, and mini-turbo sparks. Show keyboard or gamepad glyphs depending on the last input device |
| **#41** Slice sign-off | Play-test with at least one kid and one adult; budgets on the reference laptop and an iPad (Safari) | See the feel-pass checklist in §2. 2P at 60 fps was measured once in the desktop browser pane only |

## 2. Feel-pass checklist (needs a human)

These can't be judged by tests or screenshots. Flagged during the build:

- **Balance target.** The PRD wants the reference player 3rd–5th in ≥80% of races at 100cc. The measured rate is **~72–74%**, and the CI gate sits at **70%**. The field races as a tight pack, so late small events reshuffle it. Decide: tighten the pack, or accept the lower target.
- **Class feel.** 50cc: podium ~60–80% of the time (gate 55%). 150cc: 4th–7th ~83–88% (gate 75%). Check that 50cc really feels kid-friendly and 150cc feels hard.
- **Speed is the most valuable stat.** Parts are zero-sum on paper, but speed-up parts (Wedge body, Blower engine) are probably stronger in practice. Tune prices and deltas by feel.
- **Coins.** The top-speed buff is +0.25% per coin, capped at 10 coins (+2.5%). It was halved from the first design to keep the balance gate green. Check that it still feels worth grabbing.
- **Rival (Rosa Rocket in the Sunset Cup).** She spends ~76% of the race within 30 m of the player, against ~55% for the same driver without a rival. Check whether that feels like a rivalry or like a shadow.
- **Visual gates:**
  - shimmer or popping at speed
  - scenery billboards at the 240-line target
  - how the kit cars read from behind: wheels are partly tucked under wide bodies and could move outward
  - the split-screen FOV (0.78×)
- **Menu and garage legibility** for non-readers: icons lead, but some rows (Mirror, Items) still rely on words.

## 3. Known gaps inside "done" items

| Area | Gap | Why / suggested fix |
|---|---|---|
| **Saves** | Profile (credits, parts, trophies, name) and menu settings are in **`localStorage`** | Online saves are Phase G (Supabase `retroline_v2`). `parseProfile` already validates untrusted data, so the same shape can move to a table behind RLS |
| **CPU cars** | Drivers' kit parts are **cosmetic**: CPUs race stock stats | This keeps the balance gate meaningful. To make parts real for CPUs, run the balance sim with the roster builds and re-gate |
| **Player 2** | P2 races a stock car in the P1 paint scheme (blue), with the name "Player 2" and no garage or profile of their own | A second profile, or a "guest build" picker in the Versus menu |
| **Cup** | The Sunset Cup is **Sunset Beach four times** (only one circuit exists). Mirror is a global setting, not a per-round twist | Real rounds arrive with Phase H circuits. `CupDef.rounds` already takes track ids |
| **Cup line-up** | 7 of the 8 drivers race (2P: 6). One non-rival driver sits out, picked by seed | Intended for variety; confirm in the feel pass |
| **Results screens** | Results, cup table and trophy are DOM **text** | Portraits are available (`Hud.portrait`); put faces and a podium on these screens |
| **Input** | Keyboard/gamepad work, split keyboard halves for 2P, gamepad menu navigation. **No key remapping in v2 yet** (1.x `RemapScreen` exists) | Port remap to the v2 shell; it's also an accessibility item (Phase J) |
| **In-race pause** | Esc during a race quits to the menu (and abandons a cup) | Add a pause menu with Resume, Restart and Quit |
| **Horns** | Chosen in the garage, but silent | Wire into #38 |
| **Decals** | The PRD lists paint *and decals*; only paint exists | Decal textures on the kit's `paint` material |
| **Garage preview** | Uses a second WebGL context | Fine on desktop; check on iPad (Safari has context limits) |
| **Balance CI time** | The full suite takes ~40–50 s, mostly the seeded race sims | Fine now. If it grows, move the 50-seed runs to a nightly job and keep 10-seed smoke checks per PR |
| **Replay/ghosts** | `InputRecording` records player 1's inputs, but there is no playback UI yet | Time Trial, Phase G |

## 4. After the slice (from `plan.md`)

- **Phase G — Persistence and online:** Supabase `retroline_v2` (profiles, saves, inventory, time trials, ghosts, leaderboards, all behind RLS). A `security definer` RPC for counters (fixes the 1.x RLS bug). Veteran paint for 1.x players. Time Trial with ghosts.
- **Phase H — Content:**
  - 7 more circuits: Neon City Night, Canyon Desert, Snow Pass, **Tunnel/Cave with side lighting**, plus 3 to be named
  - a second cup
  - barks for the full roster
  - music per track
  - the full part catalogue and trophy unlocks
- **Phase I — Road Trip:** port the 1.x branching pyramid to the v2 sim and renderer.
- **Phase J — Polish and launch:**
  - performance pass
  - PWA/offline
  - accessibility (colour-blind palettes, remap)
  - string table
  - switch Netlify production to v2 and archive 1.x at its own URL
- **Later:** track editor (2.1), iOS/iPadOS via Capacitor with touch and gyro, real-time online (3.0).

## 5. How to try the current build

```bash
npm install
npm run dev
```

Open `http://localhost:5173/v2.html` (1.x is still at `/`). Controls, the test guide and the known caveats are in the PR description.
