# Phase 6 — Track Data Format, Loader, Editor, Generator

**Date:** 2026-08-05
**Roadmap:** `plan.md` §10 Phase 6
**Predecessor:** Phase 5 — Vehicle Physics + Desktop Controls
(`2026-08-05-phase-5-physics-controls-design.md`).
**Runs when:** Phase 5 is complete and its visual gate has passed. (It has.)
**Design approved:** user, 2026-08-05 (section-list editor scope chosen over full mouse GUI).

---

## 1. Goal

A data-driven, hand-authorable track pipeline: a JSON `TrackFile` format, a pure
loader/validator with clear errors, a seeded procedural generator emitting the same
format, and a keyboard-driven in-app section editor with live preview and SaveBackend
persistence. `TrackManager` keeps its exact public interface (`length`, `segments`,
`segment(i)`); only its *source* changes, so the renderer, physics, collision, HUD,
and traffic consume loaded tracks unchanged.

---

## 2. Data format — `TrackFile`

```jsonc
{
  "trackId": "default",          // non-empty string, [a-z0-9-]+
  "stageName": "Coastal Run",    // non-empty string (display)
  "segmentLength": 200,          // world depth per segment, > 0
  "roadWidth": 2000,             // world half-width, > 0
  "lanes": 3,                    // integer ≥ 1 (render hint; unused until lane lines vary)
  "colors": { "road": "#4a4a52" }, // optional partial palette override (Phase 6: parsed, applied later)
  "sections": [                  // ≥ 1 entries; run-length authored
    {
      "length": 60,              // integer ≥ 1 — number of segments in this section
      "curve": 0,                // K_i applied to every segment (finite)
      "pitch": 0,                // P_i applied to every segment (finite)
      "sprites": [               // optional placement rules for this section
        { "name": "tree", "offset": -1.6, "every": 6 } // every ≥ 1 (default 1): place on each Nth segment
      ]
    }
  ],
  "branchPoint": null            // optional; parsed + stored, inert until Phase 7
}
```

- **Sections, not per-segment rows.** Authoring 300 segments by hand is hostile; a
  section is `length` segments sharing `curve`/`pitch` and sprite rules. The loader
  expands sections → the `Segment[]` the engine already uses (same shapes as today).
- Sprite `name` must exist in the atlas manifest — validated at parse time so a typo
  fails loudly at load, not as a render-path throw.
- `colors` and `lanes` are carried through now (schema-complete per plan.md §10) and
  wired into rendering in a later polish pass; validator enforces their types.

## 3. Components

| File | Responsibility |
|---|---|
| `src/track/schema.ts` | `TrackFile`/`TrackSection` types; `parseTrackFile(json: string \| unknown): ParseResult` — pure, field-level error strings; `expandSections(file): SectionExpansion` (segments + total length). |
| `src/track/tracks.ts` | `DEFAULT_TRACK_FILE` — today's hardcoded `build()` re-expressed as a `TrackFile` (the hand-authored deliverable). |
| `src/track/generate.ts` | `mulberry32(seed)` PRNG; `generateTrack(seed, opts?): TrackFile` — section-append grammar (straight / arc / hill / S-pair), scenery density; deterministic per seed; output always passes `parseTrackFile`. |
| `src/engine/TrackManager.ts` | Gains `static fromFile(track: ParsedTrack): TrackManager` and `rebuild(track)`; hardcoded `build()` deleted in favour of `DEFAULT_TRACK_FILE` through the loader. Public read interface unchanged. |
| `src/track/editor/EditorScreen.ts` | Keyboard state machine (RemapScreen pattern): section list, per-field adjust, add/remove/duplicate, sprite-preset cycle, track switching (default / generated / saved), save/load via SaveBackend, JSON export/import. Renders via `drawText` + `drawQuad` only. |
| `src/main.ts` | Wires EditorScreen (F2) beside RemapScreen (Tab); edits rebuild the shared `TrackManager` in place. |

## 4. Loader / validator contract

```ts
type ParseResult =
  | { ok: true; track: ParsedTrack }   // ParsedTrack = validated TrackFile + expanded Segment[]
  | { ok: false; errors: string[] };   // every error: "sections[2].curve: expected finite number, got \"x\""
```

- Accepts a JSON string or an already-parsed object (editor round-trips objects).
- Collects **all** errors, not just the first (a hand-author fixes a file in one pass).
- Unknown top-level/section keys are errors (typo protection), except `$schema`.
- Malformed-input tests are part of the Done-when (plan.md §11 test matrix).

## 5. Generator contract

- `generateTrack(seed)` is pure and deterministic: same seed ⇒ deep-equal `TrackFile`.
- Grammar: lead-in straight → repeat {straight | gentle arc | sharp arc | hill | S-pair}
  until target length → run-out straight, padded ≥ 2× draw distance (seam rule).
- Curve/pitch magnitudes stay within the ranges the current renderer + skid tuning are
  gated on (|curve| ≤ 5, |pitch| ≤ 60, both provisional constants in the module).
- Scenery: per-section density roll; sprite names drawn from the manifest scenery set.
- Property test: 50 consecutive seeds all produce `parseTrackFile(...).ok === true`.

## 6. Editor behavior (keyboard, in-game)

- **F2** toggles; consumed-key gating identical to RemapScreen (editor sees keydown
  first; driving input pauses while open). Tab/remap and F2/editor are mutually
  exclusive screens (opening one closes the other).
- Selection model: ↑/↓ select section; ←/→ adjust the focused field; PageUp/PageDown
  (or [ / ]) cycle the focused field among length/curve/pitch/sprite-preset;
  N add section after selection, X delete (min 1 section), D duplicate.
- **Live preview:** every edit re-expands sections and `rebuild`s the shared
  TrackManager — the world updates while driving. Rebuild happens per edit event,
  never per frame (hard rule 4 untouched).
- **Tracks menu:** G regenerates from a shown seed (+/- step the seed); S saves the
  working track under its `trackId`; L cycles default → generated → each saved track.
- **Persistence:** SaveBackend keys `track:<trackId>` (JSON string) + `track-index`
  (JSON array of saved ids). Works over LocalStorage now, Supabase in Phase 8 —
  which is also the Phase 8 community-track seam.
- **Export/import:** E copies the working `TrackFile` JSON to the clipboard; I imports
  from the clipboard through `parseTrackFile`, showing its errors in the panel on
  failure. (Clipboard is the edge; parse/format logic is pure and tested.)

## 7. Testing — Vitest (all pure logic)

- Validator: valid file parses; each malformed case (missing field, wrong type,
  non-finite curve, empty sections, unknown key, bad sprite name, `every < 1`)
  rejects with a message naming the offending path; multi-error collection.
- Expansion: section lengths sum; per-segment `z = index * segmentLength`; sprite
  `every` placement; expansion of `DEFAULT_TRACK_FILE` reproduces today's segment
  count and curve/pitch layout (golden-master against the Phase 5 build()).
- Generator: determinism (same seed twice ⇒ deep-equal); 50-seed validity property;
  length bounds; seam padding respected.
- Editor state machine: field adjust, add/remove/duplicate bounds, save→load
  round-trip via MemorySaveBackend, import error surfacing.
- TrackManager: `fromFile` preserves the public interface; `rebuild` swaps segments
  without changing object identity (consumers hold the reference).

## 8. Done-when (plan.md §10 Phase 6)

- A hand-authored track (`DEFAULT_TRACK_FILE`) and a generated track both load and
  play through the same loader; switching tracks in the editor works while running.
- Loader is unit-tested against malformed input with clear, path-naming errors.
- Editor edits preview live; a saved track survives reload; export/import round-trips.
- `npm test` + `npm run build` green; no third-party imports in `track/` or `engine/`;
  no per-frame allocation added; renderer/physics/HUD untouched except TrackManager's
  constructor path.
- Human check at next gate (bundled with Phase 7's, since Phase 6 output is data):
  default track looks identical to Phase 5's; a generated track drives sanely.
