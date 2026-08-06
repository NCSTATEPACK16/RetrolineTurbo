# Phase 6 — Track Data Format, Loader, Editor, Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `TrackManager`'s hardcoded track with a data-driven pipeline: a `TrackFile` JSON schema, a pure multi-error validator + section→segment expander, the current track re-expressed as the hand-authored `DEFAULT_TRACK_FILE`, a seeded procedural generator emitting the same format, and a keyboard-driven in-app section editor (F2) with live rebuild, SaveBackend persistence, and clipboard export/import.

**Architecture:** `track/schema.ts` is the single trust boundary — everything (default track, generator output, editor imports, saved tracks) passes `parseTrackFile` before touching the engine. `TrackManager` keeps its exact public read interface; it gains a `rebuild(parsed)` that swaps the segment array in place so consumers holding the reference (renderer, HUD, main loop) see the new track with zero rewiring. The editor is a RemapScreen-pattern state machine over `TrackFile.sections`, pure and unit-tested; clipboard and keydown wiring stay in the thin edges.

**Tech Stack:** TypeScript (strict), Vite, Vitest (node environment, zero deps). Canvas 2D behind `RenderBackend`.

## Global Constraints

- Hard rules 1–6 from `CLAUDE.md` (segment model only; no ctx outside `Canvas2DBackend`/`generateSprites`; deterministic fixed-step physics untouched; **no per-frame allocation** — track rebuild happens per edit event, never per frame; zero third-party imports in `track/`/`engine/`; RLS-only protection).
- Vitest `node` environment — clipboard/keydown wiring is untested edge; all parse/expand/generate/editor-state logic is pure and tested.
- `TrackManager`'s public read interface (`length`, `segments`, `segment(i)`) must not change; all existing construction sites (`new TrackManager(DEFAULT_TRACK_CONFIG)` in tests and main) must keep compiling and passing.
- **Config-compat rule:** the game's load path only activates a `TrackFile` whose `segmentLength`/`roadWidth` equal the active `TrackConfig`'s; the validator itself stays general (any positive values). Editor doesn't expose those fields; generator emits config values.
- Generated tracks must satisfy the seam rule: total segments ≥ 2 × `drawDistance`.
- Tests assert relationships and contracts, not incidental absolutes.
- Run `npm test` and `npm run build` green before every commit that closes a task.
- All work on branch `phase-6-track-pipeline` (off `phase-5-physics-controls`). No push, no PR, no merge to `main`.

**Spec:** `docs/superpowers/specs/2026-08-05-phase-6-track-pipeline-design.md`

---

## File Structure

**Create:**
- `src/track/schema.ts` (+ test) — `TrackFile`/`TrackSection`/`TrackSpriteRule`/`ParsedTrack` types, `parseTrackFile`, `expandSections`, `formatTrackFile`.
- `src/track/tracks.ts` (+ test) — `DEFAULT_TRACK_FILE` (hand-authored), `parsedDefaultTrack()`.
- `src/track/generate.ts` (+ test) — `mulberry32`, `generateTrack`.
- `src/track/editor/EditorScreen.ts` (+ test) — editor state machine + render.

**Modify:**
- `src/engine/TrackManager.ts` (+ existing test) — construct from `ParsedTrack`; `rebuild`; hardcoded `build()` deleted.
- `src/assets/spriteManifest.ts`, `src/ui/text.ts` (+ tests) — `glyph_minus`, `-` mapping.
- `src/main.ts` — EditorScreen wiring (F2), track switching.

---

## Task 1: `track/schema.ts` — types, validator, expander

**Files:**
- Create: `src/track/schema.ts`
- Test: `src/track/schema.test.ts`

**Interfaces (produced, used by every later task):**

```ts
export interface TrackSpriteRule { name: string; offset: number; every?: number } // every ≥ 1, default 1
export interface TrackSection { length: number; curve: number; pitch: number; sprites?: TrackSpriteRule[] }
export interface TrackFile {
  trackId: string;            // [a-z0-9-]+
  stageName: string;          // non-empty
  segmentLength: number;      // > 0
  roadWidth: number;          // > 0
  lanes: number;              // integer ≥ 1
  colors?: Record<string, string>;
  sections: TrackSection[];   // ≥ 1
  branchPoint?: unknown;      // parsed + carried, inert until Phase 7
}
export interface ParsedTrack { file: TrackFile; segments: Segment[]; totalSegments: number }
export type ParseResult = { ok: true; track: ParsedTrack } | { ok: false; errors: string[] };

export function parseTrackFile(input: string | unknown): ParseResult;
export function expandSections(file: TrackFile): Segment[];   // exported for tests; parse calls it
export function formatTrackFile(file: TrackFile): string;     // stable 2-space JSON for export/save
```

**Validator behavior:** accepts a JSON string (parse errors → `["invalid JSON: <msg>"]`) or an object. Collects **all** errors with path-style messages (`sections[2].curve: expected finite number`). Unknown keys (top-level and per-section/per-rule) are errors, except `$schema`. Sprite `name` must be in the atlas manifest name set (derived once from `SPRITE_MANIFEST`). `expandSections`: per section, `length` segments each `{ index, z: index * segmentLength, curve, pitch, sprites }`; a rule `{name, offset, every}` places on section-local indices where `i % every === 0`.

- [ ] **Step 1: Write the failing test**

```ts
// src/track/schema.test.ts
import { describe, it, expect } from 'vitest';
import { parseTrackFile, expandSections, formatTrackFile, type TrackFile } from './schema.js';

const valid: TrackFile = {
  trackId: 'test-track', stageName: 'Test', segmentLength: 200, roadWidth: 2000, lanes: 3,
  sections: [
    { length: 10, curve: 0, pitch: 0, sprites: [{ name: 'tree', offset: -1.6, every: 5 }] },
    { length: 5, curve: -2.5, pitch: 20 },
  ],
};

describe('parseTrackFile accepts', () => {
  it('a valid object and expands its segments', () => {
    const r = parseTrackFile(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.totalSegments).toBe(15);
    expect(r.track.file.trackId).toBe('test-track');
  });
  it('a valid JSON string', () => {
    expect(parseTrackFile(JSON.stringify(valid)).ok).toBe(true);
  });
  it('formatTrackFile round-trips through parse', () => {
    const r = parseTrackFile(formatTrackFile(valid));
    expect(r.ok).toBe(true);
  });
});

describe('parseTrackFile rejects with path-naming errors', () => {
  const mutate = (fn: (t: Record<string, unknown>) => void): unknown => {
    const t = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
    fn(t);
    return t;
  };
  const errorsOf = (input: unknown): string[] => {
    const r = parseTrackFile(input);
    expect(r.ok).toBe(false);
    return r.ok ? [] : r.errors;
  };

  it('invalid JSON string', () => {
    expect(errorsOf('{nope')[0]).toMatch(/invalid JSON/);
  });
  it('non-object input', () => {
    expect(errorsOf(42)[0]).toMatch(/expected an object/);
  });
  it('missing required field', () => {
    expect(errorsOf(mutate((t) => { delete t['stageName']; })).join()).toMatch(/stageName/);
  });
  it('bad trackId charset', () => {
    expect(errorsOf(mutate((t) => { t['trackId'] = 'Bad Id!'; })).join()).toMatch(/trackId/);
  });
  it('non-finite curve, naming the section index', () => {
    const errs = errorsOf(mutate((t) => {
      (t['sections'] as Record<string, unknown>[])[1]!['curve'] = 'x';
    }));
    expect(errs.join()).toMatch(/sections\[1\]\.curve/);
  });
  it('empty sections array', () => {
    expect(errorsOf(mutate((t) => { t['sections'] = []; })).join()).toMatch(/sections/);
  });
  it('non-integer or < 1 section length', () => {
    expect(errorsOf(mutate((t) => {
      (t['sections'] as Record<string, unknown>[])[0]!['length'] = 0;
    })).join()).toMatch(/sections\[0\]\.length/);
  });
  it('unknown sprite name', () => {
    expect(errorsOf(mutate((t) => {
      ((t['sections'] as Record<string, unknown>[])[0]!['sprites'] as Record<string, unknown>[])[0]!['name'] = 'dragon';
    })).join()).toMatch(/sections\[0\]\.sprites\[0\]\.name.*dragon/);
  });
  it('sprite every < 1', () => {
    expect(errorsOf(mutate((t) => {
      ((t['sections'] as Record<string, unknown>[])[0]!['sprites'] as Record<string, unknown>[])[0]!['every'] = 0;
    })).join()).toMatch(/every/);
  });
  it('unknown keys (typo protection), $schema exempt', () => {
    expect(errorsOf(mutate((t) => { t['sectons'] = []; })).join()).toMatch(/sectons/);
    expect(parseTrackFile(mutate((t) => { t['$schema'] = 'x'; })).ok).toBe(true);
  });
  it('collects multiple errors in one pass', () => {
    const errs = errorsOf(mutate((t) => { delete t['stageName']; t['lanes'] = 0; }));
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('expandSections', () => {
  it('lays segments with z = index * segmentLength across section boundaries', () => {
    const segs = expandSections(valid);
    expect(segs.length).toBe(15);
    expect(segs[0]!.z).toBe(0);
    expect(segs[12]!.z).toBe(12 * 200);
    expect(segs[12]!.curve).toBe(-2.5);
    expect(segs[12]!.pitch).toBe(20);
  });
  it('applies sprite rules on section-local every-th segments', () => {
    const segs = expandSections(valid);
    expect(segs[0]!.sprites).toEqual([{ name: 'tree', offset: -1.6 }]);
    expect(segs[1]!.sprites).toEqual([]);
    expect(segs[5]!.sprites).toEqual([{ name: 'tree', offset: -1.6 }]);
    expect(segs[10]!.sprites).toEqual([]); // second section has no rules
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/track/schema.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/track/schema.ts`**

```ts
import type { Segment } from '../types/engine.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';

/** One scenery placement rule: put `name` at `offset` on every `every`-th
 * segment of the section (section-local index; default 1 = every segment). */
export interface TrackSpriteRule { name: string; offset: number; every?: number }

/** A run of `length` segments sharing the same curve/pitch deltas. */
export interface TrackSection { length: number; curve: number; pitch: number; sprites?: TrackSpriteRule[] }

/** The on-disk / on-wire track format (plan.md §10 Phase 6). The single source
 * every track flows through: hand-authored, generated, edited, imported, saved. */
export interface TrackFile {
  trackId: string;
  stageName: string;
  segmentLength: number;
  roadWidth: number;
  lanes: number;
  colors?: Record<string, string>;
  sections: TrackSection[];
  branchPoint?: unknown; // carried through, inert until Phase 7
}

export interface ParsedTrack { file: TrackFile; segments: Segment[]; totalSegments: number }
export type ParseResult = { ok: true; track: ParsedTrack } | { ok: false; errors: string[] };

const VALID_SPRITES: ReadonlySet<string> = new Set(SPRITE_MANIFEST.map((e) => e.name));
const TOP_KEYS = new Set(['trackId', 'stageName', 'segmentLength', 'roadWidth', 'lanes', 'colors', 'sections', 'branchPoint', '$schema']);
const SECTION_KEYS = new Set(['length', 'curve', 'pitch', 'sprites']);
const RULE_KEYS = new Set(['name', 'offset', 'every']);

/** Validate anything into a ParsedTrack, or every reason it isn't one.
 * Pure; collects all errors with path-style messages so a hand-author can fix
 * a file in one pass. The only trust boundary between data and the engine. */
export function parseTrackFile(input: string | unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`invalid JSON: ${(e as Error).message}`] };
    }
  }
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['expected an object'] };
  }
  const t = raw as Record<string, unknown>;

  for (const k of Object.keys(t)) if (!TOP_KEYS.has(k)) errors.push(`${k}: unknown key`);

  const str = (k: string): string | undefined => {
    const v = t[k];
    if (typeof v !== 'string' || v.length === 0) { errors.push(`${k}: expected non-empty string`); return undefined; }
    return v;
  };
  const num = (k: string): number | undefined => {
    const v = t[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) { errors.push(`${k}: expected positive finite number`); return undefined; }
    return v;
  };

  const trackId = str('trackId');
  if (trackId !== undefined && !/^[a-z0-9-]+$/.test(trackId)) errors.push('trackId: expected [a-z0-9-]+');
  str('stageName');
  num('segmentLength');
  num('roadWidth');
  const lanes = t['lanes'];
  if (typeof lanes !== 'number' || !Number.isInteger(lanes) || lanes < 1) errors.push('lanes: expected integer >= 1');
  if (t['colors'] !== undefined) {
    const c = t['colors'];
    if (typeof c !== 'object' || c === null || Array.isArray(c)) errors.push('colors: expected an object');
    else for (const [k, v] of Object.entries(c)) if (typeof v !== 'string') errors.push(`colors.${k}: expected string`);
  }

  const sections = t['sections'];
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push('sections: expected non-empty array');
  } else {
    sections.forEach((s: unknown, i: number) => {
      const at = `sections[${i}]`;
      if (typeof s !== 'object' || s === null || Array.isArray(s)) { errors.push(`${at}: expected an object`); return; }
      const sec = s as Record<string, unknown>;
      for (const k of Object.keys(sec)) if (!SECTION_KEYS.has(k)) errors.push(`${at}.${k}: unknown key`);
      const len = sec['length'];
      if (typeof len !== 'number' || !Number.isInteger(len) || len < 1) errors.push(`${at}.length: expected integer >= 1`);
      for (const k of ['curve', 'pitch'] as const) {
        const v = sec[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${at}.${k}: expected finite number`);
      }
      const rules = sec['sprites'];
      if (rules !== undefined) {
        if (!Array.isArray(rules)) { errors.push(`${at}.sprites: expected array`); return; }
        rules.forEach((r: unknown, j: number) => {
          const rat = `${at}.sprites[${j}]`;
          if (typeof r !== 'object' || r === null) { errors.push(`${rat}: expected an object`); return; }
          const rule = r as Record<string, unknown>;
          for (const k of Object.keys(rule)) if (!RULE_KEYS.has(k)) errors.push(`${rat}.${k}: unknown key`);
          const name = rule['name'];
          if (typeof name !== 'string' || !VALID_SPRITES.has(name)) errors.push(`${rat}.name: unknown sprite "${String(name)}"`);
          const off = rule['offset'];
          if (typeof off !== 'number' || !Number.isFinite(off)) errors.push(`${rat}.offset: expected finite number`);
          const every = rule['every'];
          if (every !== undefined && (typeof every !== 'number' || !Number.isInteger(every) || every < 1)) {
            errors.push(`${rat}.every: expected integer >= 1`);
          }
        });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  const file = t as unknown as TrackFile;
  const segments = expandSections(file);
  return { ok: true, track: { file, segments, totalSegments: segments.length } };
}

/** Run-length sections → the flat Segment[] the engine consumes. */
export function expandSections(file: TrackFile): Segment[] {
  const segments: Segment[] = [];
  for (const sec of file.sections) {
    for (let i = 0; i < sec.length; i++) {
      const index = segments.length;
      const sprites = [];
      if (sec.sprites) {
        for (const rule of sec.sprites) {
          if (i % (rule.every ?? 1) === 0) sprites.push({ name: rule.name, offset: rule.offset });
        }
      }
      segments.push({ index, z: index * file.segmentLength, curve: sec.curve, pitch: sec.pitch, sprites });
    }
  }
  return segments;
}

/** Stable 2-space JSON for export and SaveBackend storage. */
export function formatTrackFile(file: TrackFile): string {
  return JSON.stringify(file, null, 2);
}
```

- [ ] **Step 4: Run tests + build** — `npx vitest run src/track/schema.test.ts && npm run build`. Expected: PASS; clean.
- [ ] **Step 5: Commit** — `git add src/track/schema.ts src/track/schema.test.ts && git commit -m "feat(track): TrackFile schema, multi-error validator, section expander"`

---

## Task 2: `DEFAULT_TRACK_FILE` + TrackManager loads through the pipeline

**Files:**
- Create: `src/track/tracks.ts`; Test: `src/track/tracks.test.ts`
- Modify: `src/engine/TrackManager.ts`; extend `src/engine/TrackManager.test.ts`

**Interfaces:**
- Produces: `DEFAULT_TRACK_FILE: TrackFile`; `parsedDefaultTrack(): ParsedTrack` (parses once, throws on invalid — a broken default is a build error); `TrackManager` gains `constructor(config: TrackConfig, track?: ParsedTrack)` (default → `parsedDefaultTrack()`) and `rebuild(track: ParsedTrack): void`. `length`/`segments`/`segment(i)` unchanged.
- The golden master: expansion reproduces the Phase 5 `build()`'s **segment count (600) and curve/pitch layout**; scenery moves to section-local rules (equivalent density both shoulders, not pixel-identical placement — the existing TrackManager sprite tests assert density + both sides, and must keep passing).

- [ ] **Step 1: Capture the golden master, then write the failing tests**

Before touching `TrackManager`, record the current layout (run in a scratch vitest or node): total segments = 600; curve/pitch runs = 60×(0,0), 40×(3,0), 40×(0,40), 40×(−3,−40), 40×(0,0), 380×(0,0).

```ts
// src/track/tracks.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_TRACK_FILE, parsedDefaultTrack } from './tracks.js';
import { parseTrackFile } from './schema.js';

describe('DEFAULT_TRACK_FILE', () => {
  it('passes its own validator', () => {
    expect(parseTrackFile(DEFAULT_TRACK_FILE).ok).toBe(true);
  });
  it('reproduces the Phase 5 layout: 600 segments, same curve/pitch runs', () => {
    const { segments, totalSegments } = parsedDefaultTrack();
    expect(totalSegments).toBe(600);
    expect(segments[30]!.curve).toBe(0);
    expect(segments[80]!.curve).toBe(3);   // right curve
    expect(segments[120]!.pitch).toBe(40); // uphill
    expect(segments[160]!.curve).toBe(-3); // left over the crest
    expect(segments[160]!.pitch).toBe(-40);
    expect(segments[250]!.curve).toBe(0);  // run-out
  });
  it('meets the seam rule for the default config draw distance (300)', () => {
    expect(parsedDefaultTrack().totalSegments).toBeGreaterThanOrEqual(600);
  });
});
```

```ts
// src/engine/TrackManager.test.ts — add
import { parseTrackFile } from '../track/schema.js';

it('rebuild swaps segments in place behind the same reference', () => {
  const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
  const before = tm.length;
  const r = parseTrackFile({
    trackId: 'tiny', stageName: 'Tiny', segmentLength: 200, roadWidth: 2000, lanes: 3,
    sections: [{ length: 700, curve: 1, pitch: 0 }],
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  tm.rebuild(r.track);
  expect(tm.length).toBe(700);
  expect(tm.length).not.toBe(before);
  expect(tm.segment(10)!.curve).toBe(1);
});
```

- [ ] **Step 2: Run to verify failures** — tracks.test module-not-found; TrackManager rebuild undefined.

- [ ] **Step 3: Write `src/track/tracks.ts`**

```ts
import { parseTrackFile, type ParsedTrack, type TrackFile } from './schema.js';

/**
 * The hand-authored default track — the Phase 2–5 hardcoded build() re-expressed
 * as data (Phase 6 deliverable). Curve/pitch runs are the golden master of the
 * Phase 5 visual gate; scenery is expressed as section rules with equivalent
 * density (not per-segment-identical placement).
 */
export const DEFAULT_TRACK_FILE: TrackFile = {
  trackId: 'default',
  stageName: 'Proving Grounds',
  segmentLength: 200,
  roadWidth: 2000,
  lanes: 3,
  sections: [
    { length: 60, curve: 0, pitch: 0, sprites: [
      { name: 'tree', offset: -1.6, every: 12 }, { name: 'bush', offset: -2.0, every: 6 },
      { name: 'tree', offset: 1.6, every: 12 }, { name: 'rock', offset: 2.0, every: 6 },
      { name: 'sign', offset: -1.3, every: 60 },
    ] },
    { length: 40, curve: 3, pitch: 0, sprites: [
      { name: 'bush', offset: -1.8, every: 6 }, { name: 'tree', offset: 1.8, every: 8 },
    ] },
    { length: 40, curve: 0, pitch: 40, sprites: [
      { name: 'tree', offset: -2.2, every: 8 }, { name: 'rock', offset: 1.7, every: 7 },
    ] },
    { length: 40, curve: -3, pitch: -40, sprites: [
      { name: 'bush', offset: -1.7, every: 6 }, { name: 'tree', offset: 2.1, every: 8 },
    ] },
    { length: 40, curve: 0, pitch: 0, sprites: [
      { name: 'billboard', offset: 1.8, every: 40 }, { name: 'tree', offset: -1.9, every: 9 },
    ] },
    { length: 380, curve: 0, pitch: 0, sprites: [
      { name: 'tree', offset: -1.6, every: 12 }, { name: 'bush', offset: 1.9, every: 10 },
      { name: 'rock', offset: -2.3, every: 14 },
    ] },
  ],
};

/** Parse the default track once; a broken default is a programmer error. */
export function parsedDefaultTrack(): ParsedTrack {
  const r = parseTrackFile(DEFAULT_TRACK_FILE);
  if (!r.ok) throw new Error(`DEFAULT_TRACK_FILE invalid:\n${r.errors.join('\n')}`);
  return r.track;
}
```

- [ ] **Step 4: Rewrite `src/engine/TrackManager.ts`**

```ts
import type { Segment, TrackConfig } from '../types/engine.js';
import { parsedDefaultTrack } from '../track/tracks.js';
import type { ParsedTrack } from '../track/schema.js';

/**
 * Owns the segment array for the active track. Since Phase 6 the source is a
 * validated ParsedTrack (default: the hand-authored DEFAULT_TRACK_FILE); the
 * hardcoded build() is gone. `rebuild` swaps the track behind the same object
 * reference so consumers (renderer, HUD, main loop) never rewire.
 * `segment()` wraps so the track loops seamlessly.
 */
export class TrackManager {
  private _segments: Segment[];

  constructor(private readonly config: TrackConfig, track?: ParsedTrack) {
    this._segments = (track ?? parsedDefaultTrack()).segments;
  }

  rebuild(track: ParsedTrack): void {
    this._segments = track.segments;
  }

  get length(): number {
    return this._segments.length;
  }

  get segments(): readonly Segment[] {
    return this._segments;
  }

  segment(index: number): Segment {
    const n = this._segments.length;
    const i = ((index % n) + n) % n; // positive modulo for negative indices
    return this._segments[i]!;
  }
}
```

Note: `config` is retained (used by main.ts for compat checks and future lane rendering); if `tsc` flags it unused, keep it as `readonly config` **public** and reference it from main.ts's compat check (Task 5), which needs it anyway.

- [ ] **Step 5: Run the full suite** — `npx vitest run && npm run build`. The existing TrackManager sprite-density tests ("total > 20", "both sides") and every Renderer/HUD test constructing `new TrackManager(DEFAULT_TRACK_CONFIG)` must still pass against the data-driven default. If density tests fail, tune the `every` values in `DEFAULT_TRACK_FILE` — never weaken the tests.
- [ ] **Step 6: Commit** — `git add src/track/tracks.ts src/track/tracks.test.ts src/engine/TrackManager.ts src/engine/TrackManager.test.ts && git commit -m "feat(track): hand-authored DEFAULT_TRACK_FILE; TrackManager loads via the validator, gains rebuild"`

---

## Task 3: `track/generate.ts` — seeded generator

**Files:**
- Create: `src/track/generate.ts`
- Test: `src/track/generate.test.ts`

**Interfaces:**
- Produces: `mulberry32(seed: number): () => number` (deterministic [0,1) PRNG); `generateTrack(seed: number, opts?: { targetSegments?: number; segmentLength?: number; roadWidth?: number }): TrackFile` — defaults 200/2000 (config values), targetSegments 700. `trackId` = `gen-<seed>`.

**Grammar:** lead-in straight (40–80) → repeat pick {straight, gentle arc (|curve| 1–2.5), sharp arc (|curve| 2.5–5), hill (|pitch| 20–60), S-pair (arc then mirrored arc)} until `targetSegments` → run-out straight; then pad with a final straight so `total ≥ max(targetSegments, 600)`. Scenery: each section rolls density (none/sparse/normal) and draws names from `['tree','bush','rock']` with occasional `sign`/`billboard` (every ≥ section length ⇒ single placement).

- [ ] **Step 1: Write the failing test**

```ts
// src/track/generate.test.ts
import { describe, it, expect } from 'vitest';
import { generateTrack, mulberry32 } from './generate.js';
import { parseTrackFile } from './schema.js';

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('generateTrack', () => {
  it('is deterministic per seed', () => {
    expect(generateTrack(7)).toEqual(generateTrack(7));
  });
  it('differs across seeds', () => {
    expect(generateTrack(1)).not.toEqual(generateTrack(2));
  });
  it('every seed 0..49 passes the validator (property)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = parseTrackFile(generateTrack(seed));
      expect(r.ok, `seed ${seed}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
    }
  });
  it('meets the seam rule and stays within tuned magnitude bounds', () => {
    for (let seed = 0; seed < 20; seed++) {
      const t = generateTrack(seed);
      const total = t.sections.reduce((n, s) => n + s.length, 0);
      expect(total).toBeGreaterThanOrEqual(600);
      for (const s of t.sections) {
        expect(Math.abs(s.curve)).toBeLessThanOrEqual(5);
        expect(Math.abs(s.pitch)).toBeLessThanOrEqual(60);
      }
    }
  });
  it('stamps a seed-derived trackId', () => {
    expect(generateTrack(9).trackId).toBe('gen-9');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Write `src/track/generate.ts`**

```ts
import type { TrackFile, TrackSection, TrackSpriteRule } from './schema.js';

/** Deterministic 32-bit PRNG (public-domain mulberry32). Same seed ⇒ same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    aes: a = (a + 0x6d2b79f5) >>> 0; // label removed in real code; see note below
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

**Note:** the `aes:` label above is a transcription guard — write the standard mulberry32 body:

```ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Magnitude bounds are provisional feel constants, matched to what the renderer
// and skid tuning were visually gated on (|curve| ≤ 5, |pitch| ≤ 60).
const MAX_CURVE = 5;
const MAX_PITCH = 60;
const SCENERY: readonly string[] = ['tree', 'bush', 'rock'];

function int(rnd: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}
function pick<T>(rnd: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rnd() * xs.length)]!;
}

function scenery(rnd: () => number, sectionLength: number): TrackSpriteRule[] | undefined {
  const roll = rnd();
  if (roll < 0.2) return undefined; // barren stretch
  const rules: TrackSpriteRule[] = [];
  const density = roll < 0.6 ? 1 : 2; // sparse or normal
  for (let i = 0; i < density; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    rules.push({
      name: pick(rnd, SCENERY),
      offset: side * (1.5 + rnd() * 1.2),
      every: int(rnd, 4, 12),
    });
  }
  if (rnd() < 0.15) rules.push({ name: rnd() < 0.5 ? 'sign' : 'billboard', offset: rnd() < 0.5 ? -1.4 : 1.6, every: Math.max(sectionLength, 1) });
  return rules;
}

/** Seeded section-append generator. Output always satisfies parseTrackFile and
 * the seam rule (total ≥ max(targetSegments, 600) ≥ 2 × drawDistance). */
export function generateTrack(
  seed: number,
  opts: { targetSegments?: number; segmentLength?: number; roadWidth?: number } = {},
): TrackFile {
  const rnd = mulberry32(seed);
  const target = Math.max(opts.targetSegments ?? 700, 600);
  const sections: TrackSection[] = [];
  let total = 0;
  const add = (length: number, curve: number, pitch: number): void => {
    sections.push({ length, curve, pitch, ...(sceneryRules(length) ?? {}) });
    total += length;
  };
  const sceneryRules = (length: number): { sprites: TrackSpriteRule[] } | undefined => {
    const s = scenery(rnd, length);
    return s === undefined ? undefined : { sprites: s };
  };

  add(int(rnd, 40, 80), 0, 0); // lead-in
  while (total < target - 120) {
    const kind = int(rnd, 0, 4);
    if (kind === 0) add(int(rnd, 20, 60), 0, 0); // straight
    else if (kind === 1) add(int(rnd, 20, 40), (rnd() < 0.5 ? -1 : 1) * (1 + rnd() * 1.5), 0); // gentle arc
    else if (kind === 2) add(int(rnd, 15, 30), (rnd() < 0.5 ? -1 : 1) * (2.5 + rnd() * (MAX_CURVE - 2.5)), 0); // sharp arc
    else if (kind === 3) add(int(rnd, 20, 40), 0, (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * (MAX_PITCH - 20))); // hill
    else { // S-pair
      const c = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 2);
      const len = int(rnd, 15, 30);
      add(len, c, 0);
      add(len, -c, 0);
    }
  }
  add(int(rnd, 40, 80), 0, 0); // run-out
  if (total < target) add(target - total, 0, 0); // seam pad

  return {
    trackId: `gen-${seed}`,
    stageName: `Generated ${seed}`,
    segmentLength: opts.segmentLength ?? 200,
    roadWidth: opts.roadWidth ?? 2000,
    lanes: 3,
    sections,
  };
}
```

(Only the second, clean `mulberry32` goes in the file; the first snippet exists to warn against a transcription typo. Hill pitch note: hills change *per-segment* delta; a long pitch section drifts the road far up — mirrored down-pitch is not enforced in Phase 6, the renderer's accumulated `dy` already handled Phase 3's uncompensated hills.)

- [ ] **Step 4: Run tests + build** — `npx vitest run src/track/generate.test.ts && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/track/generate.ts src/track/generate.test.ts && git commit -m "feat(track): seeded mulberry32 section-append generator, property-tested via the validator"`

---

## Task 4: `glyph_minus` + text mapping

**Files:**
- Modify: `src/assets/spriteManifest.ts`, `src/ui/text.ts`
- Test: extend `src/ui/text.test.ts`, `src/assets/packAtlas.test.ts`

The editor displays negative curve/pitch; the font has no `-`. Add a 3×5 minus glyph and map `-` in `frameName`.

- [ ] **Step 1: Failing tests**

```ts
// src/assets/packAtlas.test.ts — add to the glyph test
expect(names).toContain('glyph_minus');
```

```ts
// src/ui/text.test.ts — add
it('renders minus signs for negative numbers', () => {
  const b = new RecordingBackend();
  drawText(b, atlas, '-2.5', 0, 0);
  expect(b.sprites.length).toBe(4); // - 2 . 5
});
```

- [ ] **Step 2: Verify red**, then implement:

In `spriteManifest.ts`, after the `glyph_colon` entry add:

```ts
  { name: 'glyph_minus', w: 3, h: 5, anchorX: 1, anchorY: 2,
    ops: [{ rx: 0, ry: 2, rw: 3, rh: 1, color: '#e8e8f0' }] },
```

In `text.ts` `frameName`, before the letter check add:

```ts
  if (ch === '-') return 'glyph_minus';
```

- [ ] **Step 3: Run full suite + build; commit** — `git add src/assets/spriteManifest.ts src/assets/packAtlas.test.ts src/ui/text.ts src/ui/text.test.ts && git commit -m "feat(ui): minus glyph for signed numbers in menu text"`

---

## Task 5: `track/editor/EditorScreen.ts` — section editor state machine

**Files:**
- Create: `src/track/editor/EditorScreen.ts`
- Test: `src/track/editor/EditorScreen.test.ts`

**Interfaces:**
- Consumes: `TrackFile`/`TrackSection`/`parseTrackFile`/`formatTrackFile` (Task 1), `DEFAULT_TRACK_FILE` (Task 2), `generateTrack` (Task 3), `SaveBackend` (Phase 5), `drawText` (Phase 5/Task 4), `SpriteAtlas`, `RenderBackend`.
- Produces:

```ts
export const TRACK_KEY_PREFIX = 'track:';
export const TRACK_INDEX_KEY = 'track-index';

export class EditorScreen {
  constructor(atlas: SpriteAtlas, save: SaveBackend, onTrackChange: (track: ParsedTrack) => void);
  readonly open: boolean;
  readonly working: TrackFile;            // deep working copy, never a shared reference
  readonly seed: number;
  readonly status: string;                // last action / error line for the panel
  lastPersist: Promise<void>;
  handleKey(code: string): boolean;       // true when consumed; F2 toggles from closed
  importJson(json: string): boolean;      // pure import path (clipboard edge calls this)
  exportJson(): string;                   // formatTrackFile(working)
  render(backend: RenderBackend): void;
}
```

**Key map (open):** ↑/↓ select section · ←/→ adjust focused field · BracketLeft/BracketRight cycle field (length ±5 min 1 / curve ±0.5 / pitch ±5 / sprite-preset cycle) · N add copy after selection · X delete (min 1) · D duplicate · G regenerate from seed · Minus/Equal step seed · S save working track · L cycle loaded track (default → generated → saved…) · F2/Escape close. Every mutation re-parses the working file and fires `onTrackChange` **only when parse succeeds** (it always should — mutations are structured; a failure sets `status` instead of crashing).

**Sprite presets** (index stored per section, `null` = custom/imported): `none` `[]` · `sparse` `[tree −1.8 every 8, rock 1.9 every 10]` · `trees` `[tree −1.6 every 4, tree 1.7 every 5]` · `mixed` `[tree −1.6 every 6, bush 1.8 every 7, rock −2.2 every 9]`.

**Persistence:** `S` → `save.set('track:' + working.trackId, formatTrackFile(working))` + updates `track-index` (JSON string[] of ids, deduped); `L` cycles: default, `gen-<seed>`, then each id from `track-index` (loads via `save.get` → `parseTrackFile`; parse failure sets `status`, skips).

- [ ] **Step 1: Write the failing test**

```ts
// src/track/editor/EditorScreen.test.ts
import { describe, it, expect } from 'vitest';
import { EditorScreen, TRACK_KEY_PREFIX, TRACK_INDEX_KEY } from './EditorScreen.js';
import { MemorySaveBackend } from '../../economy/save.js';
import { SpriteAtlas } from '../../engine/SpriteAtlas.js';
import { packAtlas } from '../../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../../assets/spriteManifest.js';
import { RecordingBackend } from '../../engine/testing/RecordingBackend.js';
import { DEFAULT_TRACK_FILE } from '../tracks.js';
import { formatTrackFile, type ParsedTrack } from '../schema.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const make = () => {
  const save = new MemorySaveBackend();
  const changes: ParsedTrack[] = [];
  const screen = new EditorScreen(atlas, save, (t) => changes.push(t));
  return { save, screen, changes };
};
const opened = () => {
  const m = make();
  m.screen.handleKey('F2');
  return m;
};

describe('EditorScreen toggle + consumption', () => {
  it('is closed by default, opens on F2, passes keys through when closed', () => {
    const { screen } = make();
    expect(screen.open).toBe(false);
    expect(screen.handleKey('KeyW')).toBe(false);
    expect(screen.handleKey('F2')).toBe(true);
    expect(screen.open).toBe(true);
    expect(screen.handleKey('KeyW')).toBe(true); // open swallows everything
    screen.handleKey('Escape');
    expect(screen.open).toBe(false);
  });
});

describe('section editing fires live rebuilds', () => {
  it('adjusting length re-expands and notifies', () => {
    const { screen, changes } = opened();
    const before = screen.working.sections[0]!.length;
    screen.handleKey('ArrowRight'); // focused field starts at length, +5
    expect(screen.working.sections[0]!.length).toBe(before + 5);
    expect(changes.length).toBe(1);
    expect(changes[0]!.totalSegments).toBe(605); // default 600 + 5
  });
  it('cycling to curve and adjusting steps by 0.5', () => {
    const { screen } = opened();
    screen.handleKey('BracketRight'); // length → curve
    screen.handleKey('ArrowRight');
    expect(screen.working.sections[0]!.curve).toBe(0.5);
  });
  it('length clamps at 1', () => {
    const { screen } = opened();
    for (let i = 0; i < 30; i++) screen.handleKey('ArrowLeft');
    expect(screen.working.sections[0]!.length).toBe(1);
  });
  it('add, duplicate, delete respect bounds', () => {
    const { screen } = opened();
    const n0 = screen.working.sections.length;
    screen.handleKey('KeyN');
    expect(screen.working.sections.length).toBe(n0 + 1);
    screen.handleKey('KeyD');
    expect(screen.working.sections.length).toBe(n0 + 2);
    for (let i = 0; i < n0 + 5; i++) screen.handleKey('KeyX');
    expect(screen.working.sections.length).toBe(1); // never below 1
  });
  it('editing never mutates DEFAULT_TRACK_FILE (deep working copy)', () => {
    const { screen } = opened();
    screen.handleKey('ArrowRight');
    expect(DEFAULT_TRACK_FILE.sections[0]!.length).toBe(60);
  });
});

describe('generator integration', () => {
  it('G loads a generated track for the current seed and notifies', () => {
    const { screen, changes } = opened();
    screen.handleKey('KeyG');
    expect(screen.working.trackId).toBe(`gen-${screen.seed}`);
    expect(changes.length).toBe(1);
  });
  it('Equal/Minus step the seed', () => {
    const { screen } = opened();
    const s0 = screen.seed;
    screen.handleKey('Equal');
    expect(screen.seed).toBe(s0 + 1);
    screen.handleKey('Minus');
    expect(screen.seed).toBe(s0);
  });
});

describe('persistence + import/export', () => {
  it('S saves the working track and updates the index', async () => {
    const { screen, save } = opened();
    screen.handleKey('KeyS');
    await screen.lastPersist;
    expect(await save.get(TRACK_KEY_PREFIX + 'default')).toBe(formatTrackFile(screen.working));
    expect(JSON.parse((await save.get(TRACK_INDEX_KEY))!)).toEqual(['default']);
  });
  it('exportJson round-trips through importJson', () => {
    const a = opened().screen;
    a.handleKey('ArrowRight');
    const json = a.exportJson();
    const b = opened().screen;
    expect(b.importJson(json)).toBe(true);
    expect(b.working.sections[0]!.length).toBe(a.working.sections[0]!.length);
  });
  it('importJson surfaces validator errors in status and keeps the working track', () => {
    const { screen } = opened();
    const before = screen.working.trackId;
    expect(screen.importJson('{"trackId": 42}')).toBe(false);
    expect(screen.status).toMatch(/trackId|stageName/);
    expect(screen.working.trackId).toBe(before);
  });
});

describe('render', () => {
  it('draws nothing closed; a backdrop + header + section rows open', () => {
    const { screen } = make();
    const b = new RecordingBackend();
    screen.render(b);
    expect(b.quads.length).toBe(0);
    screen.handleKey('F2');
    const b2 = new RecordingBackend();
    screen.render(b2);
    expect(b2.quads.length).toBeGreaterThan(0);
    expect(b2.sprites.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Write `src/track/editor/EditorScreen.ts`**

```ts
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../../constants.js';
import type { RenderBackend } from '../../engine/RenderBackend.js';
import type { SpriteAtlas } from '../../engine/SpriteAtlas.js';
import type { SaveBackend } from '../../economy/save.js';
import { drawText } from '../../ui/text.js';
import { parseTrackFile, formatTrackFile, type ParsedTrack, type TrackFile, type TrackSpriteRule } from '../schema.js';
import { DEFAULT_TRACK_FILE } from '../tracks.js';
import { generateTrack } from '../generate.js';

export const TRACK_KEY_PREFIX = 'track:';
export const TRACK_INDEX_KEY = 'track-index';

type Field = 'length' | 'curve' | 'pitch' | 'preset';
const FIELDS: readonly Field[] = ['length', 'curve', 'pitch', 'preset'];

const PRESETS: readonly { name: string; rules: TrackSpriteRule[] }[] = [
  { name: 'none', rules: [] },
  { name: 'sparse', rules: [{ name: 'tree', offset: -1.8, every: 8 }, { name: 'rock', offset: 1.9, every: 10 }] },
  { name: 'trees', rules: [{ name: 'tree', offset: -1.6, every: 4 }, { name: 'tree', offset: 1.7, every: 5 }] },
  { name: 'mixed', rules: [{ name: 'tree', offset: -1.6, every: 6 }, { name: 'bush', offset: 1.8, every: 7 }, { name: 'rock', offset: -2.2, every: 9 }] },
];

const deepCopy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * In-game keyboard section editor (RemapScreen pattern). Owns a deep working
 * copy of a TrackFile; every mutation re-validates through parseTrackFile and,
 * on success, hands the ParsedTrack to `onTrackChange` (main.ts rebuilds the
 * live TrackManager). Pure state machine — clipboard/keydown wiring is the
 * caller's edge. Persistence via the SaveBackend seam (Phase 8: community tracks).
 */
export class EditorScreen {
  private isOpen = false;
  private workingFile: TrackFile = deepCopy(DEFAULT_TRACK_FILE);
  private selected = 0;
  private fieldIdx = 0;
  private presetIdx: (number | null)[] = DEFAULT_TRACK_FILE.sections.map(() => null);
  private seedValue = 1;
  private statusLine = '';
  private savedIds: string[] = [];
  private loadCycle = 0; // 0 = default, 1 = generated, 2+ = savedIds
  lastPersist: Promise<void> = Promise.resolve();

  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly save: SaveBackend,
    private readonly onTrackChange: (track: ParsedTrack) => void,
  ) {}

  get open(): boolean { return this.isOpen; }
  get working(): TrackFile { return this.workingFile; }
  get seed(): number { return this.seedValue; }
  get status(): string { return this.statusLine; }

  private notify(): void {
    const r = parseTrackFile(this.workingFile);
    if (r.ok) {
      this.onTrackChange(r.track);
      this.statusLine = `${r.track.totalSegments} segments`;
    } else {
      this.statusLine = r.errors[0] ?? 'invalid track';
    }
  }

  private setWorking(file: TrackFile, presetIdx?: (number | null)[]): boolean {
    const r = parseTrackFile(file);
    if (!r.ok) {
      this.statusLine = r.errors[0] ?? 'invalid track';
      return false;
    }
    this.workingFile = deepCopy(file);
    this.presetIdx = presetIdx ?? file.sections.map(() => null);
    this.selected = Math.min(this.selected, file.sections.length - 1);
    this.onTrackChange(r.track);
    this.statusLine = `loaded ${file.trackId} (${r.track.totalSegments} segments)`;
    return true;
  }

  importJson(json: string): boolean {
    const r = parseTrackFile(json);
    if (!r.ok) {
      this.statusLine = r.errors[0] ?? 'invalid track';
      return false;
    }
    return this.setWorking(r.track.file);
  }

  exportJson(): string {
    return formatTrackFile(this.workingFile);
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) {
      if (code === 'F2') { this.isOpen = true; return true; }
      return false;
    }
    const secs = this.workingFile.sections;
    const sec = secs[this.selected]!;
    switch (code) {
      case 'F2':
      case 'Escape': this.isOpen = false; break;
      case 'ArrowUp': this.selected = (this.selected + secs.length - 1) % secs.length; break;
      case 'ArrowDown': this.selected = (this.selected + 1) % secs.length; break;
      case 'BracketLeft': this.fieldIdx = (this.fieldIdx + FIELDS.length - 1) % FIELDS.length; break;
      case 'BracketRight': this.fieldIdx = (this.fieldIdx + 1) % FIELDS.length; break;
      case 'ArrowLeft': this.adjust(sec, -1); break;
      case 'ArrowRight': this.adjust(sec, 1); break;
      case 'KeyN':
        secs.splice(this.selected + 1, 0, { length: 20, curve: 0, pitch: 0 });
        this.presetIdx.splice(this.selected + 1, 0, 0);
        this.selected++;
        this.notify();
        break;
      case 'KeyD':
        secs.splice(this.selected + 1, 0, deepCopy(sec));
        this.presetIdx.splice(this.selected + 1, 0, this.presetIdx[this.selected] ?? null);
        this.selected++;
        this.notify();
        break;
      case 'KeyX':
        if (secs.length > 1) {
          secs.splice(this.selected, 1);
          this.presetIdx.splice(this.selected, 1);
          this.selected = Math.min(this.selected, secs.length - 1);
          this.notify();
        }
        break;
      case 'KeyG': this.setWorking(generateTrack(this.seedValue)); break;
      case 'Equal': this.seedValue++; this.statusLine = `seed ${this.seedValue}`; break;
      case 'Minus': this.seedValue = Math.max(0, this.seedValue - 1); this.statusLine = `seed ${this.seedValue}`; break;
      case 'KeyS': this.persist(); break;
      case 'KeyL': this.cycleLoad(); break;
      default: break; // open screen swallows everything
    }
    return true;
  }

  private adjust(sec: TrackFile['sections'][number], dir: 1 | -1): void {
    const field = FIELDS[this.fieldIdx]!;
    if (field === 'length') sec.length = Math.max(1, sec.length + dir * 5);
    else if (field === 'curve') sec.curve = Math.round((sec.curve + dir * 0.5) * 10) / 10;
    else if (field === 'pitch') sec.pitch += dir * 5;
    else {
      const cur = this.presetIdx[this.selected];
      const next = ((cur ?? -1) + dir + PRESETS.length + 1) % PRESETS.length; // null → first/last
      this.presetIdx[this.selected] = next;
      const rules = PRESETS[next]!.rules;
      if (rules.length === 0) delete sec.sprites;
      else sec.sprites = deepCopy(rules);
    }
    this.notify();
  }

  private persist(): void {
    const id = this.workingFile.trackId;
    if (!this.savedIds.includes(id)) this.savedIds.push(id);
    const json = formatTrackFile(this.workingFile);
    this.lastPersist = (async () => {
      await this.save.set(TRACK_KEY_PREFIX + id, json);
      await this.save.set(TRACK_INDEX_KEY, JSON.stringify(this.savedIds));
    })();
    this.statusLine = `saved ${id}`;
  }

  private cycleLoad(): void {
    this.loadCycle = (this.loadCycle + 1) % (2 + this.savedIds.length);
    if (this.loadCycle === 0) {
      this.setWorking(DEFAULT_TRACK_FILE);
    } else if (this.loadCycle === 1) {
      this.setWorking(generateTrack(this.seedValue));
    } else {
      const id = this.savedIds[this.loadCycle - 2]!;
      this.lastPersist = this.save.get(TRACK_KEY_PREFIX + id).then((json) => {
        if (json === null || !this.importJson(json)) this.statusLine = `load failed: ${id}`;
      });
    }
  }

  /** Hydrate the saved-track index (called once at boot by main.ts). */
  async loadIndex(): Promise<void> {
    const raw = await this.save.get(TRACK_INDEX_KEY);
    if (raw === null) return;
    try {
      const ids: unknown = JSON.parse(raw);
      if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) this.savedIds = ids;
    } catch {
      /* corrupt index: keep empty */
    }
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 14, 226, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 14, 226, '#101018');
    const f = this.workingFile;
    drawText(backend, this.atlas, `editor ${f.trackId} seed ${this.seedValue}`, 20, 20);
    drawText(backend, this.atlas, `field ${FIELDS[this.fieldIdx]!} ${this.statusLine}`, 20, 32);
    const rows = 12;
    const first = Math.max(0, Math.min(this.selected - 5, f.sections.length - rows));
    for (let r = 0; r < Math.min(rows, f.sections.length); r++) {
      const i = first + r;
      const s = f.sections[i]!;
      const preset = this.presetIdx[i] === null ? 'custom' : PRESETS[this.presetIdx[i]!]!.name;
      const marker = i === this.selected ? '*' : ' ';
      drawText(backend, this.atlas, `${marker}${i} l${s.length} c${s.curve} p${s.pitch} ${preset}`, 20, 46 + r * 12);
    }
    drawText(backend, this.atlas, 'n add x del d dup g gen s save l load e i json', 20, LOGICAL_HEIGHT - 24);
  }
}
```

- [ ] **Step 4: Run tests + build** — full `npx vitest run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/track/editor/ && git commit -m "feat(track): in-game section editor — live rebuild, seeds, SaveBackend persistence, JSON import/export"`

---

## Task 6: Wire the editor in `main.ts`

**Files:**
- Modify: `src/main.ts` (no test — thin edge; all logic tested above)

- [ ] **Step 1: Wire**

Add imports (`EditorScreen` from `./track/editor/EditorScreen.js`). After `remap` construction:

```ts
const editor = new EditorScreen(atlas, save, (t) => {
  // Config-compat rule: only activate tracks matching the engine config.
  if (t.file.segmentLength !== DEFAULT_TRACK_CONFIG.segmentLength || t.file.roadWidth !== DEFAULT_TRACK_CONFIG.roadWidth) {
    console.warn('[editor] track config mismatch; not activated:', t.file.trackId);
    return;
  }
  track.rebuild(t);
});
void editor.loadIndex();
```

Key routing becomes (replacing the current keydown body):

```ts
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab' || e.code === 'F2' || input.isBound(e.code)) e.preventDefault();
  if (remap.handleKey(e.code)) return;
  if (editor.handleKey(e.code)) return;
  input.press(e.code);
});
```

Clipboard edge, after the keydown listener (E/I only act while the editor is open and idle — route through a second listener kept in main so EditorScreen stays clipboard-free):

```ts
window.addEventListener('keydown', (e) => {
  if (!editor.open) return;
  if (e.code === 'KeyE') void navigator.clipboard?.writeText(editor.exportJson());
  else if (e.code === 'KeyI') void navigator.clipboard?.readText?.().then((json) => { editor.importJson(json); });
});
```

Update pause: extend the remap neutralize to `if (remap.open || editor.open) { ... }`. Render: add `editor.render(backend);` after `remap.render(backend);`.

- [ ] **Step 2: Full suite + build** — `npx vitest run && npm run build`. Expected: all green.
- [ ] **Step 3: Commit** — `git add src/main.ts && git commit -m "feat: wire in-game track editor (F2) with live rebuild and clipboard JSON"`

---

## Task 7: Verification, review, active-plan roll

- [ ] **Step 1:** superpowers:verification-before-completion — fresh `npx vitest run` (expect ≈150+, all green), `npm run build`, hard-rule greps (no third-party imports in `track/`; no ctx outside the two allowed files).
- [ ] **Step 2:** superpowers:requesting-code-review — reviewer subagent over the phase-6 commit range; fix Critical/Important findings, red-green any regression tests.
- [ ] **Step 3:** Roll `active-plan.md` to Phase 6 done-state: M-checklist checked, deviations recorded, visual confirmation **bundled into the Phase 7 gate** (Phase 6 output is data; the default track golden-master test pins the Phase 5 look), operational carryover updated.
- [ ] **Step 4:** Commit plan + active-plan; report and continue the loop to Phase 7.

---

## Self-Review

**Spec coverage:** §2 format → Task 1 types/validator (all listed constraints tested). §3 components → Tasks 1–6 one-to-one. §4 loader contract (string|object, multi-error, unknown keys, `$schema` exempt) → Task 1 tests. §5 generator contract (determinism, 50-seed property, bounds, seam, `gen-<seed>`) → Task 3 tests. §6 editor behavior (F2 gating, selection/adjust/add/del/dup, seeds, save/load cycle, persistence keys, import errors surfaced, export) → Task 5 tests + Task 6 wiring; mutual exclusion via remap-first routing (remap swallows while open). §7 test matrix → mapped above; TrackManager rebuild identity → Task 2 test. §8 done-when → Tasks 2 (hand-authored), 3+5 (generated, switchable), 1 (malformed input), 5 (save/reload, export/import), 7 (green + rules). ✓

**Placeholder scan:** all code complete; the one intentional double-snippet (mulberry32 transcription guard) states exactly which version to use. ✓

**Type consistency:** `TrackFile`/`TrackSection`/`TrackSpriteRule`/`ParsedTrack`/`ParseResult` defined once (Task 1), imported everywhere; `EditorScreen` ctor `(atlas, save, onTrackChange)` matches Task 6 wiring; `TRACK_KEY_PREFIX`/`TRACK_INDEX_KEY` shared between Task 5 impl and tests; `rebuild(track: ParsedTrack)` matches Task 2 and Task 6. `presetIdx` cycling handles `null` (custom) start. ✓
