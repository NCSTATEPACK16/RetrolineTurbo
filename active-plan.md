# active-plan.md — Phase 6: Track Data Format, Loader, Editor, Generator

Per-feature working plan (see `plan.md` §13). Replace contents when starting the next phase.
Full plan: `docs/superpowers/plans/2026-08-05-phase-6-track-pipeline.md`.
Spec: `docs/superpowers/specs/2026-08-05-phase-6-track-pipeline-design.md` (design approved by user).

## Goal
A data-driven track pipeline: `TrackFile` JSON schema, pure multi-error validator + run-length
section→segment expander, the previous hardcoded track re-expressed as the hand-authored
`DEFAULT_TRACK_FILE`, a seeded procedural generator emitting the same format, and an in-game
keyboard section editor (F2) with live rebuild, SaveBackend persistence, and clipboard JSON.

## M-checklist — Phase 6 done-when
- [x] `track/schema.ts` — `TrackFile` format per plan.md §10; `parseTrackFile` collects **all**
      errors with path-naming messages; unknown-key typo protection (`$schema` exempt, stripped);
      sprite names validated against the atlas manifest (vitest: 16 accept/reject/expansion cases)
- [x] Hand-authored track — `DEFAULT_TRACK_FILE` golden-master tested to reproduce the Phase 5
      layout (600 segments, same curve/pitch runs); all Phase 4/5 render/HUD tests pass unchanged
- [x] `TrackManager` loads via the validator; `rebuild()` swaps segments behind the same
      reference (identity-tested); public read interface unchanged; hardcoded `build()` deleted
- [x] `track/generate.ts` — seeded mulberry32 section-append generator; deterministic per seed;
      **property-tested: seeds 0–49 all pass the validator**; seam rule + magnitude bounds held
- [x] `track/editor/EditorScreen.ts` — F2 section editor: select/adjust (length/curve/pitch/
      sprite-preset), add/delete/duplicate, seed stepping + regenerate, save/load cycle via
      SaveBackend (`track:<id>` + `track-index`), JSON export/import with validator errors
      surfaced in-panel; **live rebuild** on every edit (per event, never per frame)
- [x] `main.ts` — remap-first key routing with spec §6 mutual exclusion; clipboard edge;
      config-compat guard (mismatched tracks load in the editor but report "not activated")
- [x] `glyph_minus` + `-` text mapping (signed curve/pitch legible in the editor)
- [x] `npm test` green (**158 tests**, up from 115) · `npm run build` clean
- [x] Loader unit-tested against malformed input (Done-when requirement) ✓
- [ ] Visual confirmation — **bundled into the Phase 7 gate** (Phase 6 output is data; the
      golden-master test pins the Phase 5 look): default track looks identical; F2 editor
      legible; a generated track (G) drives sanely; save→reload persists; E/I round-trips JSON.

## Design decisions (locked)
1. **Sections, not per-segment rows** — run-length authoring; loader expands to the engine's
   `Segment[]`. Sprite rules are section-local (`every` Nth segment).
2. **Single trust boundary** — nothing reaches `TrackManager` without `parseTrackFile`;
   the editor re-validates after every mutation and on every import/load.
3. **`rebuild` behind the same reference** — consumers never rewire; `segment()`'s modulo wrap
   makes mid-drive track swaps safe.
4. **Config-compat rule** — the game only activates tracks whose `segmentLength`/`roadWidth`
   match the engine config; the format itself stays general. `onTrackChange` returns
   activation status; the editor surfaces "not activated: config mismatch".
5. **Editor owns a deep working copy** — `DEFAULT_TRACK_FILE` is immutable; presets tracked
   per-section (`null` = custom for imported/generated sections).

## Deviations from the written plan (and why)
- **`TrackManager.fromFile` static → optional constructor param** — functionally equivalent,
  one less code path; the plan's named test became the rebuild-identity test.
- **Generator rounds curve (0.1) / pitch (integer)** — raw floats overflowed the editor's
  3×5-glyph rows; rounding is deterministic and inside validator bounds.
- **Red-step compression** — established Phase 5 pattern: module-not-found red demonstrated
  per new module family; every suite run green before its commit.

## Code-review round (reviewer subagent; fixes applied + red-green verified)
- **Critical fixed:** preset-cycle arithmetic (`+1` inside the modulo) made two presets
  unreachable and wedged left-cycling from custom; rewritten with explicit null entry/exit,
  regression test proven red against the old code.
- **Fixed:** spec §6 screen mutual exclusion (Tab while editor open now closes the editor;
  clipboard listener gated on `editor.open && !remap.open`); config-mismatch rejection now
  surfaces in the editor status instead of a silent console.warn; saved-track load race
  guarded by a monotonic load token with a separate `lastLoad` promise (tested); `$schema`
  stripped from parsed files; Cmd/Ctrl combos pass through while a screen is open;
  whitespace-only strings rejected by the validator.
- **Deferred (noted):** persistence status is optimistic and `lastPersist` rejections are
  unhandled — same debt as RemapScreen; becomes real in Phase 8 (Supabase backend), fix there.
  Tighten `branchPoint` validation when Phase 7 wires it.

## Done-when
Hand-authored and generated tracks both load and play through the same validated pipeline;
tracks switch in-game; loader rejects malformed input with clear errors; editor previews live,
persists via SaveBackend, round-trips JSON. `npm test` (158) + `npm run build` green; zero
third-party imports in `track/`/`engine/`; no per-frame allocation added. Visual check rides
the Phase 7 gate. ✓ (code-complete)

## Operational carryover
- [x] `npm test` green (158) · `npm run build` clean
- [x] Supabase project `iytniuygdkwxxmtdkmlj` — retroline schema with RLS (unchanged this phase)
- [ ] Netlify green — still pending merge to `main` (branch stack: `phase-2-3-road-rasterizer`
      ← `phase-5-physics-controls` ← `phase-6-track-pipeline`)
- [ ] Phase 8 note: wire editor/remap persistence error handling when SupabaseBackend lands
