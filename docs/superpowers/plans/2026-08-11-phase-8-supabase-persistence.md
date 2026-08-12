# Phase 8 — Supabase Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the local-only save adapter for real Supabase persistence, and close the loop plan.md §10 Phase 8 describes: a save that survives reload under one account, race-result leaderboards, community track publish/browse, and anonymous→permanent account upgrade.

**Architecture:** Everything above `net/supabase.ts` already goes through narrow seams (`SaveBackend`, and now the same pattern for race results / leaderboard / tracks / account). Each new capability is a small edge module in `src/net/` that takes the live `supabase` client and degrades to a no-op when it's `null` (offline/misconfigured). New UI is a handful of keyboard-driven overlay screens following the existing `RemapScreen`/`EditorScreen` pattern — pure state machines, rendered via `RenderBackend`, wired into `main.ts` at the edge. `main.ts` itself has no test file (matches existing convention: it's untested glue, verified by `npm run build` + manual smoke).

**Tech Stack:** TypeScript strict, `@supabase/supabase-js` 2.45.4, Vitest 2.1.

## Global Constraints

- No new dependencies — only `@supabase/supabase-js`, already installed.
- Every `net/` module degrades silently (returns `null`/`[]`/a typed failure result) when `supabase` is the null client — never throw, per `net/supabase.ts`'s existing contract.
- RLS is the only authorization boundary (CLAUDE.md hard rule 6) — no client-side ownership checks beyond what RLS already enforces; every write relies on `auth.uid()` server-side.
- No per-frame allocation in any `render()` (CLAUDE.md hard rule 4) — these are overlay screens rendered only while `open`, same as `RemapScreen`.
- The bitmap font (`src/ui/text.ts`) only draws `a-z`, `0-9`, `:`, `-`, space — no `@`. Any screen needing free-text email/password entry uses `window.prompt`, not on-canvas text.
- New screens follow the `RemapScreen` contract: `open` getter, `handleKey(code): boolean` (returns whether consumed), `render(backend)`, toggled by a dedicated function key not already bound (`Tab`=remap, `F2`=editor in use; `F3`/`F4`/`F5` are free).
- `main.ts` changes are not unit-tested (no `main.test.ts` exists in this codebase); verify each `main.ts` edit with `npm run build` (typecheck) and note it needs a manual `npm run dev` smoke pass.

---

### Task 1: `SupabaseBackend implements SaveBackend`

**Files:**
- Create: `src/net/SupabaseBackend.ts`
- Test: `src/net/SupabaseBackend.test.ts`

**Interfaces:**
- Consumes: `SaveBackend` (`src/economy/save.ts`) — `get(key): Promise<string|null>`, `set(key,value): Promise<void>`. `supabase` + `ensureAnonSession` from `src/net/supabase.ts`.
- Produces: `export class SupabaseBackend implements SaveBackend` — used by Task 2's `chooseSaveBackend()`.

The flat key-value contract (`SaveBackend`) doesn't map one-to-one onto the `saves` table's typed columns (`credits`, `owned_cars`, …, none of which exist yet — Phase 9 is unwritten). So the whole key-value store lives as one JSON object in the `settings` jsonb column, keyed by the authenticated user, cached in memory after first read so repeated `get`/`set` calls (bindings, editor track drafts) don't round-trip per key.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { user: { id: 'user-1' } };

function makeQuery(result: { data: unknown; error: { message: string } | null }) {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  q.upsert = vi.fn(() => Promise.resolve(result));
  return q;
}

vi.mock('./supabase.js', () => ({
  supabase: { from: vi.fn() },
  ensureAnonSession: vi.fn(),
}));

describe('SupabaseBackend', () => {
  beforeEach(() => vi.resetModules());

  it('get() returns null before any set(), when the row does not exist', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    vi.mocked(supabase!.from).mockReturnValue(makeQuery({ data: null, error: null }));
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await expect(backend.get('bindings')).resolves.toBeNull();
  });

  it('get() reads a key out of the loaded settings blob', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    vi.mocked(supabase!.from).mockReturnValue(
      makeQuery({ data: { settings: { bindings: 'stored-value' } }, error: null }),
    );
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await expect(backend.get('bindings')).resolves.toBe('stored-value');
  });

  it('set() upserts the merged settings blob under the session user id', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    const query = makeQuery({ data: { settings: {} }, error: null });
    vi.mocked(supabase!.from).mockReturnValue(query);
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await backend.set('bindings', 'v1');
    expect(query.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', settings: { bindings: 'v1' } },
      { onConflict: 'user_id' },
    );
  });

  it('degrades to a no-op when there is no session (offline/misconfigured)', async () => {
    const { ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(null);
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    const backend = new SupabaseBackend();
    await expect(backend.get('bindings')).resolves.toBeNull();
    await expect(backend.set('bindings', 'v1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/net/SupabaseBackend.test.ts`
Expected: FAIL — `./SupabaseBackend.js` has no exports yet (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
import { supabase, ensureAnonSession } from './supabase.js';
import type { SaveBackend } from '../economy/save.js';

/**
 * Supabase-backed SaveBackend. The whole flat key-value store (control
 * bindings, local editor track drafts) lives as one JSON object in
 * `retroline.saves.settings`, keyed by the authenticated user — the `saves`
 * table's typed columns (credits, owned_cars, …) are Phase 9's, unwritten
 * today. Reads are cached in memory after the first fetch so repeated
 * get()/set() calls don't round-trip per key.
 */
export class SupabaseBackend implements SaveBackend {
  private cache: Record<string, string> | null = null;
  private userId: string | null = null;

  private async ensureLoaded(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    const session = await ensureAnonSession();
    if (!supabase || !session) {
      this.cache = {};
      return this.cache;
    }
    this.userId = session.user.id;
    const { data, error } = await supabase
      .from('saves')
      .select('settings')
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) {
      console.error('[SupabaseBackend] load failed:', error.message);
      this.cache = {};
      return this.cache;
    }
    this.cache = ((data as { settings?: Record<string, string> } | null)?.settings) ?? {};
    return this.cache;
  }

  async get(key: string): Promise<string | null> {
    const settings = await this.ensureLoaded();
    return settings[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const settings = await this.ensureLoaded();
    settings[key] = value;
    if (!supabase || !this.userId) return;
    const { error } = await supabase
      .from('saves')
      .upsert({ user_id: this.userId, settings }, { onConflict: 'user_id' });
    if (error) console.error('[SupabaseBackend] save failed:', error.message);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/net/SupabaseBackend.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/net/SupabaseBackend.ts src/net/SupabaseBackend.test.ts
git commit -m "feat(net): add SupabaseBackend implementing SaveBackend"
```

---

### Task 2: Save-backend selection wired into `main.ts`

**Files:**
- Create: `src/net/saveBackend.ts`
- Test: `src/net/saveBackend.test.ts`
- Modify: `src/main.ts:14,68` (import + construction)

**Interfaces:**
- Consumes: `supabase` (`src/net/supabase.ts`), `SupabaseBackend` (Task 1), `LocalStorageSaveBackend`/`SaveBackend` (`src/economy/save.ts`).
- Produces: `export function chooseSaveBackend(): SaveBackend`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase.js', () => ({ supabase: null, ensureAnonSession: vi.fn() }));
vi.mock('./SupabaseBackend.js', () => ({ SupabaseBackend: class {} }));

describe('chooseSaveBackend', () => {
  beforeEach(() => vi.resetModules());

  it('falls back to LocalStorageSaveBackend when supabase is unconfigured', async () => {
    const { chooseSaveBackend } = await import('./saveBackend.js');
    const { LocalStorageSaveBackend } = await import('../economy/save.js');
    expect(chooseSaveBackend()).toBeInstanceOf(LocalStorageSaveBackend);
  });
});

describe('chooseSaveBackend with a configured client', () => {
  beforeEach(() => vi.resetModules());

  it('picks SupabaseBackend when supabase is configured', async () => {
    vi.doMock('./supabase.js', () => ({ supabase: {}, ensureAnonSession: vi.fn() }));
    const { chooseSaveBackend } = await import('./saveBackend.js');
    const { SupabaseBackend } = await import('./SupabaseBackend.js');
    expect(chooseSaveBackend()).toBeInstanceOf(SupabaseBackend);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/net/saveBackend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
import { supabase } from './supabase.js';
import { SupabaseBackend } from './SupabaseBackend.js';
import { LocalStorageSaveBackend } from '../economy/save.js';
import type { SaveBackend } from '../economy/save.js';

/** Real backend when configured, offline localStorage otherwise — one call
 * site so main.ts never branches on `supabase` itself. */
export function chooseSaveBackend(): SaveBackend {
  return supabase ? new SupabaseBackend() : new LocalStorageSaveBackend();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/net/saveBackend.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into `main.ts`**

Replace the import and construction:

```typescript
// main.ts:14 — replace
import { LocalStorageSaveBackend } from './economy/save.js';
// with
import { chooseSaveBackend } from './net/saveBackend.js';
```

```typescript
// main.ts:68 — replace
const save = new LocalStorageSaveBackend();
// with
const save = chooseSaveBackend();
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run build`
Expected: clean (no type errors).

- [ ] **Step 7: Commit**

```bash
git add src/net/saveBackend.ts src/net/saveBackend.test.ts src/main.ts
git commit -m "feat(net): select SupabaseBackend when configured, else localStorage"
```

---

### Task 3: `race_results` insert on race finish

**Files:**
- Modify: `src/track/route.ts` (add `baseSeed` field + `routeIdentity` helper)
- Modify: `src/track/route.test.ts`
- Create: `src/net/raceResults.ts`
- Test: `src/net/raceResults.test.ts`
- Modify: `src/main.ts:23,277-278` (import + call at `route.finish()`)

**Interfaces:**
- Consumes: `supabase`, `ensureAnonSession` (`src/net/supabase.ts`); `RouteState` (`src/track/route.ts`).
- Produces: `RouteState.baseSeed: number`; `export function routeIdentity(route: RouteState): { trackId: string; path: string }`; `export interface RaceResultInput { trackId: string; route: string; timeMs: number; creditsEarned?: number }`; `export async function recordRaceResult(input: RaceResultInput): Promise<void>`. Task 4's `LeaderboardScreen` consumes `routeIdentity`'s `trackId` shape.

- [ ] **Step 1: Write the failing test for `routeIdentity`**

Add to `src/track/route.test.ts` (existing file — append a new `describe` block):

```typescript
describe('routeIdentity', () => {
  it('derives a stable trackId from baseSeed and a path from the forks taken', () => {
    const route = new RouteState(7);
    expect(route.baseSeed).toBe(7);
    route.advance(1); // stage 0 -> 1, choice 1
    route.advance(0); // stage 1 -> 2, choice 0
    const { trackId } = routeIdentity(route);
    expect(trackId).toBe('route-7');
    // visited holds the sceneIdx at each fork, ending in the current (unfinished) sceneIdx
    expect(routeIdentity(route).path).toBe(route.visited.concat(route.sceneIdx).join('-'));
  });

  it('uses endingIdx once the route has finished', () => {
    const route = new RouteState(3);
    for (let i = 0; i < 4; i++) route.advance(1);
    route.finish();
    expect(routeIdentity(route).path).toBe(route.visited.concat(route.endingIdx!).join('-'));
  });
});
```

Add `routeIdentity` to the file's existing import line for `RouteState`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/track/route.test.ts -t routeIdentity`
Expected: FAIL — `routeIdentity` is not exported, `route.baseSeed` is undefined.

- [ ] **Step 3: Add `baseSeed` and `routeIdentity` to `route.ts`**

In the `RouteState` class, add the field and set it in the constructor:

```typescript
export class RouteState {
  readonly pyramid: ScenePlan[][];
  readonly baseSeed: number;
  stage = 0;
  sceneIdx = 0;
  readonly visited: number[] = [];
  remainingMs = INITIAL_TIME_MS;
  private isFinished = false;
  private ending: number | null = null;

  constructor(baseSeed: number) {
    this.baseSeed = baseSeed;
    this.pyramid = buildPyramid(baseSeed);
  }
  // ... rest unchanged
```

Add the helper function near the bottom of the file, after the class:

```typescript
/** Stable identity for a finished (or in-progress) run, for `race_results`.
 * `trackId` groups every attempt at the same seeded pyramid; `path` records
 * which fork was taken at each stage, ending in the current or final scene. */
export function routeIdentity(route: RouteState): { trackId: string; path: string } {
  const last = route.endingIdx ?? route.sceneIdx;
  return { trackId: `route-${route.baseSeed}`, path: route.visited.concat(last).join('-') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/track/route.test.ts`
Expected: PASS (all route.test.ts tests, including the two new ones)

- [ ] **Step 5: Write the failing test for `recordRaceResult`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { user: { id: 'user-1' } };

vi.mock('./supabase.js', () => ({ supabase: { from: vi.fn() }, ensureAnonSession: vi.fn() }));

describe('recordRaceResult', () => {
  beforeEach(() => vi.resetModules());

  it('inserts a race_results row for the current user', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase!.from).mockReturnValue({ insert } as any);
    const { recordRaceResult } = await import('./raceResults.js');
    await recordRaceResult({ trackId: 'route-7', route: '0-1', timeMs: 123456.7 });
    expect(supabase!.from).toHaveBeenCalledWith('race_results');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1', track_id: 'route-7', route: '0-1', time_ms: 123457, credits_earned: 0,
    });
  });

  it('no-ops when there is no session', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(null);
    const { recordRaceResult } = await import('./raceResults.js');
    await recordRaceResult({ trackId: 'route-7', route: '0-1', timeMs: 1000 });
    expect(supabase!.from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/net/raceResults.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the implementation**

```typescript
import { supabase, ensureAnonSession } from './supabase.js';

export interface RaceResultInput {
  trackId: string;
  route: string;
  timeMs: number;
  creditsEarned?: number;
}

/** Insert a finished run into `race_results` (feeds `leaderboard_best` and
 * the leaderboard screen). No-ops when Supabase is unconfigured or auth
 * fails — a race always finishes locally even if the network write is lost. */
export async function recordRaceResult(input: RaceResultInput): Promise<void> {
  const session = await ensureAnonSession();
  if (!supabase || !session) return;
  const { error } = await supabase.from('race_results').insert({
    user_id: session.user.id,
    track_id: input.trackId,
    route: input.route,
    time_ms: Math.round(input.timeMs),
    credits_earned: input.creditsEarned ?? 0,
  });
  if (error) console.error('[raceResults] insert failed:', error.message);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/net/raceResults.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Wire into `main.ts`**

```typescript
// main.ts:23 — extend the existing route.js import
import { RouteState, sceneTrack, resolveFork, nextSceneIdx, STAGES, routeIdentity } from './track/route.js';
```

Add a new import line near the other `net/` import:

```typescript
import { recordRaceResult } from './net/raceResults.js';
```

At `main.ts:277-278`, extend the finish branch:

```typescript
      } else if (route.stage === STAGES - 1
          && vehicle.z >= track.length * DEFAULT_TRACK_CONFIG.segmentLength) {
        route.finish();
        routeMap.flashMs = Number.MAX_SAFE_INTEGER; // stays up on the ending screen
        const { trackId, path } = routeIdentity(route);
        void recordRaceResult({ trackId, route: path, timeMs: elapsedMs });
      }
```

- [ ] **Step 10: Typecheck and build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/track/route.ts src/track/route.test.ts src/net/raceResults.ts src/net/raceResults.test.ts src/main.ts
git commit -m "feat(net): insert race_results on route finish"
```

---

### Task 4: `leaderboard_best`/`race_results` reads + `LeaderboardScreen` (F3)

**Files:**
- Create: `src/net/leaderboard.ts`
- Test: `src/net/leaderboard.test.ts`
- Create: `src/ui/LeaderboardScreen.ts`
- Test: `src/ui/LeaderboardScreen.test.ts`
- Modify: `src/main.ts` (import, construction, key routing, render, driving-pause gate)

**Interfaces:**
- Consumes: `supabase`, `ensureAnonSession` (`src/net/supabase.ts`); `formatTime` (`src/ui/HUD.ts`, already exported); `drawText` (`src/ui/text.ts`); `routeIdentity` (Task 3).
- Produces: `export interface LeaderboardEntry { timeMs: number; isYou: boolean }`; `export async function fetchLeaderboard(trackId: string, limit?: number): Promise<LeaderboardEntry[]>`; `export class LeaderboardScreen` with `open`, `toggle(trackId: string)`, `handleKey(code): boolean`, `render(backend)`.

- [ ] **Step 1: Write the failing tests for `fetchLeaderboard`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSession = { user: { id: 'user-1' } };

function makeQuery(result: { data: unknown; error: { message: string } | null }) {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.limit = vi.fn(() => Promise.resolve(result));
  return q;
}

vi.mock('./supabase.js', () => ({ supabase: { from: vi.fn() }, ensureAnonSession: vi.fn() }));

describe('fetchLeaderboard', () => {
  beforeEach(() => vi.resetModules());

  it('returns the fastest times first, flagging the current user', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    vi.mocked(supabase!.from).mockReturnValue(makeQuery({
      data: [{ time_ms: 90000, user_id: 'user-1' }, { time_ms: 95000, user_id: 'user-2' }],
      error: null,
    }));
    const { fetchLeaderboard } = await import('./leaderboard.js');
    await expect(fetchLeaderboard('route-7')).resolves.toEqual([
      { timeMs: 90000, isYou: true },
      { timeMs: 95000, isYou: false },
    ]);
  });

  it('returns [] when supabase is unconfigured', async () => {
    vi.doMock('./supabase.js', () => ({ supabase: null, ensureAnonSession: vi.fn() }));
    const { fetchLeaderboard } = await import('./leaderboard.js');
    await expect(fetchLeaderboard('route-7')).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/net/leaderboard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `net/leaderboard.ts`**

```typescript
import { supabase, ensureAnonSession } from './supabase.js';

export interface LeaderboardEntry {
  timeMs: number;
  isYou: boolean;
}

/** Top `limit` `race_results` for a track, fastest first. Readable by anyone
 * (RLS: "race results are viewable by everyone"), so this works even before
 * the current player has raced. */
export async function fetchLeaderboard(trackId: string, limit = 5): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const session = await ensureAnonSession();
  const myId = session?.user.id ?? null;
  const { data, error } = await supabase
    .from('race_results')
    .select('time_ms, user_id')
    .eq('track_id', trackId)
    .order('time_ms', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[leaderboard] fetch failed:', error.message);
    return [];
  }
  return ((data ?? []) as { time_ms: number; user_id: string }[]).map((row) => (
    { timeMs: row.time_ms, isYou: row.user_id === myId }
  ));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/net/leaderboard.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing tests for `LeaderboardScreen`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';

vi.mock('../net/leaderboard.js', () => ({ fetchLeaderboard: vi.fn() }));

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('LeaderboardScreen', () => {
  it('is closed by default; toggle opens it and kicks off a fetch', async () => {
    const { fetchLeaderboard } = await import('../net/leaderboard.js');
    vi.mocked(fetchLeaderboard).mockResolvedValue([{ timeMs: 1000, isYou: false }]);
    const { LeaderboardScreen } = await import('./LeaderboardScreen.js');
    const screen = new LeaderboardScreen(atlas);
    expect(screen.open).toBe(false);
    screen.toggle('route-7');
    expect(screen.open).toBe(true);
    expect(fetchLeaderboard).toHaveBeenCalledWith('route-7');
    await screen.lastFetch;
    const backend = new RecordingBackend();
    screen.render(backend);
    expect(backend.calls.length).toBeGreaterThan(0);
  });

  it('closes on F3 or Escape while open; passes other keys through when closed', () => {
    const screen = new (require('./LeaderboardScreen.js').LeaderboardScreen)(atlas);
    expect(screen.handleKey('KeyW')).toBe(false);
    screen.toggle('route-7');
    expect(screen.handleKey('F3')).toBe(true);
    expect(screen.open).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/ui/LeaderboardScreen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write `ui/LeaderboardScreen.ts`**

```typescript
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { drawText } from './text.js';
import { formatTime } from './HUD.js';
import { fetchLeaderboard, type LeaderboardEntry } from '../net/leaderboard.js';

/** F3 overlay: top `race_results` times for the given trackId. Pure display —
 * main.ts supplies the trackId (from `routeIdentity`) and owns the keybind,
 * following the RemapScreen contract. */
export class LeaderboardScreen {
  private isOpen = false;
  private entries: LeaderboardEntry[] = [];
  private loading = false;
  lastFetch: Promise<void> = Promise.resolve();

  constructor(private readonly atlas: SpriteAtlas) {}

  get open(): boolean { return this.isOpen; }

  /** Open (or close, on repeat) and kick off a fetch for `trackId` on open. */
  toggle(trackId: string): void {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) return;
    this.loading = true;
    this.entries = [];
    this.lastFetch = fetchLeaderboard(trackId).then((rows) => {
      this.entries = rows;
      this.loading = false;
    });
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F3' || code === 'Escape') this.isOpen = false;
    return true; // open screen swallows everything
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 40, 140, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 40, 140, '#101018');
    drawText(backend, this.atlas, 'leaderboard  f3 close', 40, 48);
    if (this.loading) {
      drawText(backend, this.atlas, 'loading', 40, 64);
      return;
    }
    if (this.entries.length === 0) {
      drawText(backend, this.atlas, 'no times yet', 40, 64);
      return;
    }
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      drawText(backend, this.atlas, `${i + 1} ${formatTime(e.timeMs)}${e.isYou ? ' you' : ''}`, 40, 64 + i * 12);
    }
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/ui/LeaderboardScreen.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Wire into `main.ts`**

Add imports near the other `ui/`/`net/` imports:

```typescript
import { LeaderboardScreen } from './ui/LeaderboardScreen.js';
import { routeIdentity } from './track/route.js'; // already added in Task 3 if not present
```

Construct alongside `remap`/`editor` (near `main.ts:124`):

```typescript
const leaderboard = new LeaderboardScreen(atlas);
```

In the `keydown` handler, add F3 routing after the `editor.handleKey(e.code)` check (around `main.ts:164`):

```typescript
  if (editor.handleKey(e.code)) return;
  if (e.code === 'F3') {
    leaderboard.toggle(routeIdentity(route).trackId);
    return;
  }
  if (leaderboard.handleKey(e.code)) return;
```

Extend the `screenOpen` / preventDefault checks and the driving-pause gate to include `leaderboard.open` everywhere `remap.open || editor.open` currently appears (the `screenOpen` const at the top of the keydown handler, and the `update()` pause condition at `main.ts:215`):

```typescript
const screenOpen = remap.open || editor.open || leaderboard.open;
// ...
if (e.code === 'Tab' || e.code === 'F2' || e.code === 'F3' || input.isBound(e.code)) e.preventDefault();
// ...
if (remap.open || editor.open || leaderboard.open) { // pause driving while a screen is up
```

Render it alongside the other screens in `render()` (near `main.ts:299`):

```typescript
    leaderboard.render(backend);
```

- [ ] **Step 10: Typecheck and build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/net/leaderboard.ts src/net/leaderboard.test.ts src/ui/LeaderboardScreen.ts src/ui/LeaderboardScreen.test.ts src/main.ts
git commit -m "feat(ui): leaderboard reads + F3 leaderboard screen"
```

---

### Task 5: Community track publish (`tracks.is_public`) + `EditorScreen` hook (`KeyP`)

**Files:**
- Create: `src/net/tracks.ts` (this task: `publishTrack` only — Task 6 extends the same file)
- Test: `src/net/tracks.test.ts` (this task: publish tests only — Task 6 appends)
- Modify: `src/track/editor/EditorScreen.ts` (constructor param, `KeyP` case, footer text)
- Modify: `src/track/editor/EditorScreen.test.ts`
- Modify: `src/main.ts` (import, construction arg)

**Interfaces:**
- Consumes: `supabase`, `ensureAnonSession` (`src/net/supabase.ts`); `TrackFile` (`src/track/schema.ts`).
- Produces: `export async function publishTrack(name: string, file: TrackFile): Promise<boolean>`. `EditorScreen`'s constructor gains an optional 4th param `publish?: (name: string, file: TrackFile) => Promise<boolean>`.

- [ ] **Step 1: Write the failing tests for `publishTrack`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrackFile } from '../track/schema.js';

const mockSession = { user: { id: 'user-1' } };
const sampleFile = { trackId: 't1', segmentLength: 200, roadWidth: 2000, lanes: 3, sections: [] } as unknown as TrackFile;

vi.mock('./supabase.js', () => ({ supabase: { from: vi.fn() }, ensureAnonSession: vi.fn() }));

describe('publishTrack', () => {
  beforeEach(() => vi.resetModules());

  it('inserts a public tracks row authored by the current user', async () => {
    const { supabase, ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(mockSession as any);
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase!.from).mockReturnValue({ insert } as any);
    const { publishTrack } = await import('./tracks.js');
    await expect(publishTrack('my track', sampleFile)).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith({
      author_id: 'user-1', name: 'my track', data: sampleFile, is_public: true,
    });
  });

  it('returns false when there is no session', async () => {
    const { ensureAnonSession } = await import('./supabase.js');
    vi.mocked(ensureAnonSession).mockResolvedValue(null);
    const { publishTrack } = await import('./tracks.js');
    await expect(publishTrack('my track', sampleFile)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/net/tracks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `net/tracks.ts`**

```typescript
import { supabase, ensureAnonSession } from './supabase.js';
import type { TrackFile } from '../track/schema.js';

/** Publish a TrackFile publicly (retroline.tracks, is_public — RLS: readable
 * by everyone once public). Returns whether the insert succeeded. */
export async function publishTrack(name: string, file: TrackFile): Promise<boolean> {
  const session = await ensureAnonSession();
  if (!supabase || !session) return false;
  const { error } = await supabase.from('tracks').insert({
    author_id: session.user.id,
    name,
    data: file,
    is_public: true,
  });
  if (error) {
    console.error('[tracks] publish failed:', error.message);
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/net/tracks.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for the `EditorScreen` publish hook**

Append to `src/track/editor/EditorScreen.test.ts` (add a `publish` mock to the `make()` helper's signature — extend it, don't replace the existing calls):

```typescript
describe('publishing the working track (KeyP)', () => {
  it('calls the injected publish() with the working file and reports the result', async () => {
    const save = new MemorySaveBackend();
    const publish = vi.fn(() => Promise.resolve(true));
    const screen = new EditorScreen(atlas, save, () => true, publish);
    screen.handleKey('F2');
    screen.handleKey('KeyP');
    await screen.lastPersist;
    expect(publish).toHaveBeenCalledWith(screen.working.trackId, screen.working);
    expect(screen.status).toBe(`published ${screen.working.trackId}`);
  });

  it('reports "publish unavailable" when no publish() was injected', () => {
    const save = new MemorySaveBackend();
    const screen = new EditorScreen(atlas, save, () => true);
    screen.handleKey('F2');
    screen.handleKey('KeyP');
    expect(screen.status).toBe('publish unavailable');
  });
});
```

Add `vi` to the file's existing `vitest` import if not already present.

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/track/editor/EditorScreen.test.ts -t publish`
Expected: FAIL — `EditorScreen` takes only 3 constructor args, no `KeyP` case.

- [ ] **Step 7: Add the publish hook to `EditorScreen`**

Modify the constructor (`EditorScreen.ts:48-52`):

```typescript
  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly save: SaveBackend,
    private readonly onTrackChange: (track: ParsedTrack) => boolean,
    private readonly publish?: (name: string, file: TrackFile) => Promise<boolean>,
  ) {}
```

Add a case to the `handleKey` switch, alongside `KeyS`/`KeyL` (`EditorScreen.ts:139-140`):

```typescript
      case 'KeyS': this.persist(); break;
      case 'KeyL': this.cycleLoad(); break;
      case 'KeyP': this.publishCurrent(); break;
```

Add the private method near `persist()`:

```typescript
  private publishCurrent(): void {
    if (!this.publish) {
      this.statusLine = 'publish unavailable';
      return;
    }
    const id = this.workingFile.trackId;
    this.statusLine = 'publishing...';
    this.lastPersist = this.publish(id, this.workingFile).then((ok) => {
      this.statusLine = ok ? `published ${id}` : 'publish failed';
    });
  }
```

Update the footer hint text (`EditorScreen.ts:219`):

```typescript
    drawText(backend, this.atlas, 'n add x del d dup g gen s save l load p publish e i json', 20, LOGICAL_HEIGHT - 24);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/track/editor/EditorScreen.test.ts`
Expected: PASS (all EditorScreen tests, including the two new ones)

- [ ] **Step 9: Wire into `main.ts`**

Add an import near the other `net/` imports:

```typescript
import { publishTrack } from './net/tracks.js';
```

Pass it as the 4th arg to `EditorScreen`'s construction (`main.ts:137-144`):

```typescript
const editor = new EditorScreen(atlas, save, (t) => {
  // Config-compat rule: only activate tracks matching the engine config.
  if (t.file.segmentLength !== DEFAULT_TRACK_CONFIG.segmentLength || t.file.roadWidth !== DEFAULT_TRACK_CONFIG.roadWidth) {
    return false; // editor surfaces "not activated" in its status line
  }
  track.rebuild(t);
  return true;
}, publishTrack);
```

- [ ] **Step 10: Typecheck and build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/net/tracks.ts src/net/tracks.test.ts src/track/editor/EditorScreen.ts src/track/editor/EditorScreen.test.ts src/main.ts
git commit -m "feat(editor): publish the working track to the community catalogue"
```

---

### Task 6: Community track browse + `TrackBrowserScreen` (F4)

**Files:**
- Modify: `src/net/tracks.ts` (add `browsePublicTracks`, `fetchTrack`)
- Modify: `src/net/tracks.test.ts`
- Create: `src/ui/TrackBrowserScreen.ts`
- Test: `src/ui/TrackBrowserScreen.test.ts`
- Modify: `src/main.ts` (import, construction, key routing, render, driving-pause gate)

**Interfaces:**
- Consumes: `supabase` (`src/net/supabase.ts`); `parseTrackFile`, `ParsedTrack`, `TrackFile` (`src/track/schema.ts`); `drawText` (`src/ui/text.ts`).
- Produces: `export interface PublicTrackSummary { id: string; name: string; plays: number }`; `export async function browsePublicTracks(limit?: number): Promise<PublicTrackSummary[]>`; `export async function fetchTrack(id: string): Promise<TrackFile | null>`; `export class TrackBrowserScreen` with the same `open`/`handleKey`/`render` contract as `LeaderboardScreen`, constructor `(atlas, onTrackChange: (track: ParsedTrack) => boolean)` — same signature `EditorScreen` uses.

- [ ] **Step 1: Write the failing tests for `browsePublicTracks`/`fetchTrack`**

Append to `src/net/tracks.test.ts`:

```typescript
describe('browsePublicTracks', () => {
  beforeEach(() => vi.resetModules());

  it('lists public tracks, most-played first', async () => {
    const { supabase } = await import('./supabase.js');
    const q: any = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.limit = vi.fn(() => Promise.resolve({
      data: [{ id: 'a', name: 'Alpha', plays: 10 }],
      error: null,
    }));
    vi.mocked(supabase!.from).mockReturnValue(q);
    const { browsePublicTracks } = await import('./tracks.js');
    await expect(browsePublicTracks()).resolves.toEqual([{ id: 'a', name: 'Alpha', plays: 10 }]);
    expect(q.eq).toHaveBeenCalledWith('is_public', true);
  });

  it('returns [] when supabase is unconfigured', async () => {
    vi.doMock('./supabase.js', () => ({ supabase: null, ensureAnonSession: vi.fn() }));
    const { browsePublicTracks } = await import('./tracks.js');
    await expect(browsePublicTracks()).resolves.toEqual([]);
  });
});

describe('fetchTrack', () => {
  beforeEach(() => vi.resetModules());

  it('returns the track data and bumps its play count', async () => {
    const { supabase } = await import('./supabase.js');
    const selectQ: any = {};
    selectQ.select = vi.fn(() => selectQ);
    selectQ.eq = vi.fn(() => selectQ);
    selectQ.maybeSingle = vi.fn(() => Promise.resolve({ data: { data: sampleFile, plays: 4 }, error: null }));
    const updateQ: any = {};
    updateQ.update = vi.fn(() => updateQ);
    updateQ.eq = vi.fn(() => Promise.resolve({ error: null }));
    vi.mocked(supabase!.from).mockReturnValueOnce(selectQ).mockReturnValueOnce(updateQ);
    const { fetchTrack } = await import('./tracks.js');
    await expect(fetchTrack('id-1')).resolves.toEqual(sampleFile);
    await Promise.resolve(); // let the fire-and-forget bump settle
    expect(updateQ.update).toHaveBeenCalledWith({ plays: 5 });
  });

  it('returns null when the row is missing', async () => {
    const { supabase } = await import('./supabase.js');
    const q: any = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    vi.mocked(supabase!.from).mockReturnValue(q);
    const { fetchTrack } = await import('./tracks.js');
    await expect(fetchTrack('missing')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/net/tracks.test.ts -t browsePublicTracks`
Expected: FAIL — `browsePublicTracks`/`fetchTrack` not exported.

- [ ] **Step 3: Extend `net/tracks.ts`**

Append below `publishTrack`:

```typescript
export interface PublicTrackSummary {
  id: string;
  name: string;
  plays: number;
}

/** Public track catalogue, most-played first. */
export async function browsePublicTracks(limit = 20): Promise<PublicTrackSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('tracks')
    .select('id, name, plays')
    .eq('is_public', true)
    .order('plays', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[tracks] browse failed:', error.message);
    return [];
  }
  return (data ?? []) as PublicTrackSummary[];
}

/** Fetch one published track's data and bump its play count (fire-and-forget
 * — a failed bump must not block loading the track). */
export async function fetchTrack(id: string): Promise<TrackFile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('tracks')
    .select('data, plays')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[tracks] fetch failed:', error.message);
    return null;
  }
  const row = data as { data: TrackFile; plays: number };
  void supabase.from('tracks').update({ plays: row.plays + 1 }).eq('id', id).then(({ error: bumpErr }) => {
    if (bumpErr) console.error('[tracks] play-count bump failed:', bumpErr.message);
  });
  return row.data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/net/tracks.test.ts`
Expected: PASS (all tracks.test.ts tests)

- [ ] **Step 5: Write the failing tests for `TrackBrowserScreen`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { DEFAULT_TRACK_FILE } from '../track/tracks.js';

vi.mock('../net/tracks.js', () => ({ browsePublicTracks: vi.fn(), fetchTrack: vi.fn() }));

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('TrackBrowserScreen', () => {
  it('is closed by default; toggle opens it and lists public tracks', async () => {
    const { browsePublicTracks } = await import('../net/tracks.js');
    vi.mocked(browsePublicTracks).mockResolvedValue([{ id: 'a', name: 'Alpha', plays: 3 }]);
    const { TrackBrowserScreen } = await import('./TrackBrowserScreen.js');
    const screen = new TrackBrowserScreen(atlas, () => true);
    expect(screen.open).toBe(false);
    expect(screen.handleKey('KeyW')).toBe(false);
    screen.toggle();
    expect(screen.open).toBe(true);
    await screen.lastFetch;
  });

  it('Enter loads the selected track through onTrackChange', async () => {
    const { browsePublicTracks, fetchTrack } = await import('../net/tracks.js');
    vi.mocked(browsePublicTracks).mockResolvedValue([{ id: 'a', name: 'Alpha', plays: 3 }]);
    vi.mocked(fetchTrack).mockResolvedValue(DEFAULT_TRACK_FILE);
    const onTrackChange = vi.fn(() => true);
    const { TrackBrowserScreen } = await import('./TrackBrowserScreen.js');
    const screen = new TrackBrowserScreen(atlas, onTrackChange);
    screen.toggle();
    await screen.lastFetch;
    screen.handleKey('Enter');
    await screen.lastLoad;
    expect(onTrackChange).toHaveBeenCalled();
  });

  it('closes on F4 or Escape', () => {
    const screen = new (require('./TrackBrowserScreen.js').TrackBrowserScreen)(atlas, () => true);
    screen.toggle();
    expect(screen.handleKey('F4')).toBe(true);
    expect(screen.open).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/ui/TrackBrowserScreen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write `ui/TrackBrowserScreen.ts`**

```typescript
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { drawText } from './text.js';
import { parseTrackFile, type ParsedTrack } from '../track/schema.js';
import { browsePublicTracks, fetchTrack, type PublicTrackSummary } from '../net/tracks.js';

/**
 * F4 overlay: browse and load community tracks (retroline.tracks, is_public).
 * Loading re-validates through parseTrackFile and hands off through the same
 * `onTrackChange` contract EditorScreen uses, so a config-mismatched track
 * surfaces "not activated" instead of desyncing the world.
 */
export class TrackBrowserScreen {
  private isOpen = false;
  private tracks: PublicTrackSummary[] = [];
  private selected = 0;
  private statusLine = '';
  private loading = false;
  lastFetch: Promise<void> = Promise.resolve();
  lastLoad: Promise<void> = Promise.resolve();

  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly onTrackChange: (track: ParsedTrack) => boolean,
  ) {}

  get open(): boolean { return this.isOpen; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) return;
    this.loading = true;
    this.tracks = [];
    this.selected = 0;
    this.statusLine = '';
    this.lastFetch = browsePublicTracks().then((rows) => {
      this.tracks = rows;
      this.loading = false;
      if (rows.length === 0) this.statusLine = 'no public tracks yet';
    });
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F4' || code === 'Escape') { this.isOpen = false; return true; }
    if (this.tracks.length === 0) return true;
    if (code === 'ArrowUp') this.selected = (this.selected + this.tracks.length - 1) % this.tracks.length;
    else if (code === 'ArrowDown') this.selected = (this.selected + 1) % this.tracks.length;
    else if (code === 'Enter') this.loadSelected();
    return true;
  }

  private loadSelected(): void {
    const summary = this.tracks[this.selected];
    if (!summary) return;
    this.statusLine = 'loading...';
    this.lastLoad = fetchTrack(summary.id).then((file) => {
      if (!file) { this.statusLine = 'load failed'; return; }
      const r = parseTrackFile(file);
      if (!r.ok) { this.statusLine = r.errors[0] ?? 'invalid track'; return; }
      const activated = this.onTrackChange(r.track);
      this.statusLine = activated ? `loaded ${summary.name}` : `${summary.name}: not activated (config mismatch)`;
    });
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 30, 160, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 30, 160, '#101018');
    drawText(backend, this.atlas, 'community tracks  f4 close  enter load', 30, 38);
    if (this.loading) { drawText(backend, this.atlas, 'loading', 30, 54); return; }
    if (this.statusLine) drawText(backend, this.atlas, this.statusLine, 30, 54);
    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i]!;
      const marker = i === this.selected ? '>' : ' ';
      drawText(backend, this.atlas, `${marker}${t.name} plays ${t.plays}`, 30, 68 + i * 12);
    }
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/ui/TrackBrowserScreen.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Wire into `main.ts`**

Add an import:

```typescript
import { TrackBrowserScreen } from './ui/TrackBrowserScreen.js';
```

Construct it near `editor` (reuses the same config-compat guard as `EditorScreen`'s `onTrackChange`):

```typescript
const trackBrowser = new TrackBrowserScreen(atlas, (t) => {
  if (t.file.segmentLength !== DEFAULT_TRACK_CONFIG.segmentLength || t.file.roadWidth !== DEFAULT_TRACK_CONFIG.roadWidth) {
    return false;
  }
  track.rebuild(t);
  return true;
});
```

Add F4 routing in the keydown handler, alongside F3 (Task 4):

```typescript
  if (e.code === 'F4') { trackBrowser.toggle(); return; }
  if (trackBrowser.handleKey(e.code)) return;
```

Extend `screenOpen`, the preventDefault check, and the driving-pause gate to include `trackBrowser.open` (same three spots as Task 4's `leaderboard.open`):

```typescript
const screenOpen = remap.open || editor.open || leaderboard.open || trackBrowser.open;
// ...
if (e.code === 'Tab' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4' || input.isBound(e.code)) e.preventDefault();
// ...
if (remap.open || editor.open || leaderboard.open || trackBrowser.open) {
```

Render it alongside the other screens:

```typescript
    trackBrowser.render(backend);
```

- [ ] **Step 10: Typecheck and build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/net/tracks.ts src/net/tracks.test.ts src/ui/TrackBrowserScreen.ts src/ui/TrackBrowserScreen.test.ts src/main.ts
git commit -m "feat(ui): community track browse + F4 track browser screen"
```

---

### Task 7: Anonymous → account upgrade (`net/account.ts` + `AccountScreen`, F5)

**Files:**
- Create: `src/net/account.ts`
- Test: `src/net/account.test.ts`
- Create: `src/ui/AccountScreen.ts`
- Test: `src/ui/AccountScreen.test.ts`
- Modify: `src/main.ts` (import, construction, key routing, render, driving-pause gate)

**Interfaces:**
- Consumes: `supabase` (`src/net/supabase.ts`).
- Produces: `export type LinkEmailResult = 'ok' | 'no-backend' | 'error'`; `export async function linkEmail(email: string): Promise<LinkEmailResult>`; `export async function setPassword(password: string): Promise<LinkEmailResult>`; `export async function isAccountLinked(): Promise<boolean>`; `export class AccountScreen` with `open`/`handleKey`/`render`.

Per Supabase's documented anonymous-user-upgrade flow (`auth.updateUser({ email })` then, after the user verifies, `auth.updateUser({ password })`), converting an anonymous user requires **"manual linking" enabled** in the Supabase dashboard (Authentication → Settings) — this is a manual step, same category as the Phase 8 schema-exposure step already done. Flag it in the task's final note; it is not something code can toggle.

- [ ] **Step 1: Write the failing tests for `net/account.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase.js', () => ({ supabase: { auth: { updateUser: vi.fn(), getUser: vi.fn() } } }));

describe('linkEmail / setPassword / isAccountLinked', () => {
  beforeEach(() => vi.resetModules());

  it('linkEmail calls updateUser with the email and returns ok', async () => {
    const { supabase } = await import('./supabase.js');
    vi.mocked(supabase!.auth.updateUser).mockResolvedValue({ error: null } as any);
    const { linkEmail } = await import('./account.js');
    await expect(linkEmail('a@b.com')).resolves.toBe('ok');
    expect(supabase!.auth.updateUser).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('linkEmail returns "error" when Supabase rejects it', async () => {
    const { supabase } = await import('./supabase.js');
    vi.mocked(supabase!.auth.updateUser).mockResolvedValue({ error: { message: 'bad' } } as any);
    const { linkEmail } = await import('./account.js');
    await expect(linkEmail('a@b.com')).resolves.toBe('error');
  });

  it('linkEmail returns "no-backend" when supabase is unconfigured', async () => {
    vi.doMock('./supabase.js', () => ({ supabase: null }));
    const { linkEmail } = await import('./account.js');
    await expect(linkEmail('a@b.com')).resolves.toBe('no-backend');
  });

  it('isAccountLinked reflects is_anonymous on the current user', async () => {
    const { supabase } = await import('./supabase.js');
    vi.mocked(supabase!.auth.getUser).mockResolvedValue({ data: { user: { is_anonymous: false } } } as any);
    const { isAccountLinked } = await import('./account.js');
    await expect(isAccountLinked()).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/net/account.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `net/account.ts`**

```typescript
import { supabase } from './supabase.js';

export type LinkEmailResult = 'ok' | 'no-backend' | 'error';

/** Step 1 of anonymous->permanent upgrade (Supabase docs: "Convert an
 * anonymous user to a permanent user"). Sends a confirmation email/OTP; the
 * user stays anonymous until they verify it. Requires "manual linking" to be
 * enabled in the Supabase dashboard (Authentication -> Settings) — a manual
 * step, same category as the Phase 8 schema-exposure step. */
export async function linkEmail(email: string): Promise<LinkEmailResult> {
  if (!supabase) return 'no-backend';
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    console.error('[account] link email failed:', error.message);
    return 'error';
  }
  return 'ok';
}

/** Step 2, after the user has verified the email: set a password so they can
 * sign back in without the magic link/OTP. */
export async function setPassword(password: string): Promise<LinkEmailResult> {
  if (!supabase) return 'no-backend';
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('[account] set password failed:', error.message);
    return 'error';
  }
  return 'ok';
}

/** True once the current session's identity is no longer anonymous. */
export async function isAccountLinked(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  return data.user ? !data.user.is_anonymous : false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/net/account.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing tests for `AccountScreen`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';

vi.mock('../net/account.js', () => ({ linkEmail: vi.fn(), setPassword: vi.fn(), isAccountLinked: vi.fn() }));

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);

describe('AccountScreen', () => {
  let promptSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { promptSpy = vi.spyOn(window, 'prompt'); });
  afterEach(() => { promptSpy.mockRestore(); });

  it('toggle opens/closes and checks link status on open', async () => {
    const { isAccountLinked } = await import('../net/account.js');
    vi.mocked(isAccountLinked).mockResolvedValue(false);
    const { AccountScreen } = await import('./AccountScreen.js');
    const screen = new AccountScreen(atlas);
    expect(screen.open).toBe(false);
    screen.toggle();
    expect(screen.open).toBe(true);
    await screen.lastAction;
  });

  it('KeyE prompts for an email and calls linkEmail', async () => {
    const { linkEmail, isAccountLinked } = await import('../net/account.js');
    vi.mocked(isAccountLinked).mockResolvedValue(false);
    vi.mocked(linkEmail).mockResolvedValue('ok');
    promptSpy.mockReturnValue('a@b.com');
    const { AccountScreen } = await import('./AccountScreen.js');
    const screen = new AccountScreen(atlas);
    screen.toggle();
    await screen.lastAction;
    screen.handleKey('KeyE');
    await screen.lastAction;
    expect(linkEmail).toHaveBeenCalledWith('a@b.com');
  });

  it('closes on F5 or Escape; passes other keys through when closed', () => {
    const screen = new (require('./AccountScreen.js').AccountScreen)(atlas);
    expect(screen.handleKey('KeyW')).toBe(false);
    screen.toggle();
    expect(screen.handleKey('F5')).toBe(true);
    expect(screen.open).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/ui/AccountScreen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write `ui/AccountScreen.ts`**

```typescript
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { drawText } from './text.js';
import { linkEmail, setPassword, isAccountLinked } from '../net/account.js';

/**
 * F5 overlay: anonymous -> permanent account upgrade. Email/password entry
 * uses window.prompt — the bitmap font (a-z, 0-9, `:`, `-`) has no `@` glyph,
 * so an on-canvas field can't render an email address; this is the one
 * screen that deliberately steps outside the canvas for input.
 */
export class AccountScreen {
  private isOpen = false;
  private statusLine = '';
  private linked = false;
  lastAction: Promise<void> = Promise.resolve();

  constructor(private readonly atlas: SpriteAtlas) {}

  get open(): boolean { return this.isOpen; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) return;
    this.statusLine = '';
    this.lastAction = isAccountLinked().then((linked) => { this.linked = linked; });
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F5' || code === 'Escape') { this.isOpen = false; return true; }
    if (code === 'KeyE' && !this.linked) this.promptEmail();
    else if (code === 'KeyP' && !this.linked) this.promptPassword();
    return true;
  }

  private promptEmail(): void {
    const email = window.prompt('Email to link this save to:');
    if (!email) return;
    this.statusLine = 'sending confirmation...';
    this.lastAction = linkEmail(email).then((result) => {
      this.statusLine = result === 'ok'
        ? 'check your email, then press p to set a password'
        : `link failed (${result})`;
    });
  }

  private promptPassword(): void {
    const password = window.prompt('Set a password (after confirming your email):');
    if (!password) return;
    this.statusLine = 'saving password...';
    this.lastAction = setPassword(password).then((result) => {
      this.statusLine = result === 'ok' ? 'account linked' : `save failed (${result})`;
      if (result === 'ok') this.linked = true;
    });
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 60, 120, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 60, 120, '#101018');
    drawText(backend, this.atlas, 'account  f5 close', 60, 68);
    if (this.linked) {
      drawText(backend, this.atlas, 'this save is linked to an account', 60, 84);
    } else {
      drawText(backend, this.atlas, 'e link email   p set password', 60, 84);
    }
    if (this.statusLine) drawText(backend, this.atlas, this.statusLine, 60, 100);
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/ui/AccountScreen.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Wire into `main.ts`**

Add an import:

```typescript
import { AccountScreen } from './ui/AccountScreen.js';
```

Construct it near the other screens:

```typescript
const account = new AccountScreen(atlas);
```

Add F5 routing in the keydown handler, alongside F3/F4:

```typescript
  if (e.code === 'F5') { account.toggle(); return; }
  if (account.handleKey(e.code)) return;
```

Extend `screenOpen`, the preventDefault check, and the driving-pause gate one more time to include `account.open` (final form of all three, folding in Tasks 4/6/7):

```typescript
const screenOpen = remap.open || editor.open || leaderboard.open || trackBrowser.open || account.open;
// ...
if (e.code === 'Tab' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4' || e.code === 'F5' || input.isBound(e.code)) e.preventDefault();
// ...
if (remap.open || editor.open || leaderboard.open || trackBrowser.open || account.open) {
```

Render it alongside the other screens:

```typescript
    account.render(backend);
```

- [ ] **Step 10: Typecheck and build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/net/account.ts src/net/account.test.ts src/ui/AccountScreen.ts src/ui/AccountScreen.test.ts src/main.ts
git commit -m "feat(ui): anonymous-to-account upgrade + F5 account screen"
```

---

### Task 8: Full-suite gate, manual smoke, and plan wrap-up

**Files:**
- Modify: `active-plan.md` (Phase 8 section of "What's left")
- Modify: `supabase/migrations/0001_init.sql` — **no code change expected**; this step only checks whether a new migration is needed (it should not be, since Task 1–7 use only the existing schema).

- [ ] **Step 1: Run the full automated gate**

Run: `npm test && npm run build`
Expected: every test file green (new: `SupabaseBackend`, `saveBackend`, `raceResults`, `route` (extended), `leaderboard`, `LeaderboardScreen`, `tracks`, `TrackBrowserScreen`, `account`, `AccountScreen`, `EditorScreen` (extended)); `npm run build` clean.

- [ ] **Step 2: One real `npm run dev` session — manual smoke pass**

This is the same category of gap Spec D's visual gate left open (`active-plan.md` "Blocking, and cheap" §1) — automated coverage is real but a human needs to drive it once:

1. `npm run dev`, open the app with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set (Netlify already has them; copy into a local `.env` for `npm run dev`, or test against the deployed Netlify build).
2. Confirm no console errors on boot (anonymous session establishes silently).
3. Play through the route to the ending screen; confirm no console error from `recordRaceResult`.
4. Reload the page; press F3 at the same route; confirm the just-finished time appears in the leaderboard list.
5. Press F2, `KeyG` to generate a track, `KeyP` to publish it; confirm the status line reads `published <id>` (not `publish failed`).
6. Press F4; confirm the published track appears in the list; press Enter to load it; confirm the world rebuilds (or "not activated: config mismatch" if segment/road width differ — expected for a mismatched config, not a bug).
7. Press F5, `KeyE`, enter a real email at the prompt; confirm the status line reads "check your email…". (Full verification requires clicking the confirmation link and needs **"manual linking" enabled** in Supabase dashboard → Authentication → Settings — flag to the user if this step errors, since it's a dashboard toggle, not something this plan's code can set.)

- [ ] **Step 3: Update `active-plan.md`**

Replace the "Phase 8 — Supabase persistence" bullet under "What's left — read this first in a new session" with a completion note listing what Task 1–7 built, and move any remaining gap (e.g., the manual-linking dashboard toggle, if not yet enabled) into a new bullet — mirroring how prior phases recorded their state in this file.

- [ ] **Step 4: Commit**

```bash
git add active-plan.md
git commit -m "docs(plan): record Phase 8 Supabase persistence completion"
```

---

## Self-Review Notes

- **Spec coverage:** all six plan.md §10 Phase 8 deliverables have a task — `SupabaseBackend` (Task 1), save sync (Tasks 1–2), `race_results` insert (Task 3), `leaderboard_best`/leaderboard reads (Task 4 — implemented against `race_results` directly rather than the `leaderboard_best` view, since that view is `distinct on (track_id)` and returns only the single best row per track, not a top-N ranking a "leaderboard" screen needs; `leaderboard_best` remains available for a future single-best-time-per-track summary if wanted), track publish (Task 5), track browse (Task 6), anonymous→account upgrade (Task 7).
- **Type consistency:** `RouteState.baseSeed`/`routeIdentity` (Task 3) is consumed unchanged by `LeaderboardScreen.toggle(trackId)` (Task 4) and `recordRaceResult`'s `trackId` field. `EditorScreen`'s `publish` param signature (Task 5) matches `publishTrack`'s exported signature exactly. `TrackBrowserScreen`'s `onTrackChange: (track: ParsedTrack) => boolean` (Task 6) matches `EditorScreen`'s existing contract, so `main.ts`'s wiring closure is copy-paste identical by design.
- **No placeholders:** every step has runnable code, not a description of code.
