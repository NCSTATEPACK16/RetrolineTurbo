# Phase 11 — UI Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No subagent
> dispatch on this plan** — execute inline, one task at a time, in this session.

**Goal:** Build the DOM-based `src/ui-shell/` menu system from
`docs/superpowers/specs/2026-08-12-phase-11-ui-shell-design.md`: Hub, Guide, Garage &
Marketplace, Settings (4 tabs), Post-Race Summary, and a Pause overlay, wired into `main.ts`
as an additive overlay above the untouched game canvas.

**Architecture:** Plain TypeScript, zero runtime deps, one-way dependency (`ui-shell` →
game modules, never back). A pure `ShellRouter` state machine and a pure `ShellBridge`
facade carry all the vitest-testable logic; DOM screens are thin renderers over them,
manually verified via `npm run dev` (no jsdom in this repo's vitest — `environment: 'node'`
per `vite.config.ts` — so anything that touches `document`/`HTMLElement` is out of unit-test
reach by construction, same boundary `CrtEffect`/`SoundEngine` already draw against
WebGL2/AudioContext).

**Tech Stack:** TypeScript strict, Vite, Vitest, native DOM APIs, CSS custom properties.

## Global Constraints

- Zero external runtime dependencies in `ui-shell` (CLAUDE.md hard rule 5); no framework.
- `engine/`, `physics/`, `economy/` never import from `ui-shell` — dependency is one-way.
- The game `<canvas>`, `RenderBackend`, `Canvas2DBackend`, `Renderer` stay untouched;
  `HUD.ts`/`RouteMap.ts` stay canvas-rendered.
- Single dark theme (no light/dark toggle) — Midnight Synth tokens from
  `docs/figma_design_system_prompt.md` (spec §7): bg `#0B0C10`→`#1A1A2E`, surface `#1F2833`
  @60% + 16px blur, accents cyan `#00FFFF` / gold `#FFD700` / magenta `#FF00FF` / red
  `#FF3333`, text `#F2F4F8`/`#9AA3B2`/`#5C6472`.
- Real CSS flex/grid, verified at 1440 desktop / 834×1194 iPad / 390×844 iPhone (spec §8).
- `npm run build` (`tsc --noEmit` + Vite build) and `npm test` stay green after every task.
- **Font deviation from spec:** spec §7 calls for self-hosted Space Grotesk/Outfit/Inter.
  No font files exist in this repo and sourcing/licensing binary assets is out of scope for
  this plan — use a `system-ui` stack (`-apple-system, "Segoe UI", Roboto, sans-serif`) with
  a monospace fallback for numerics. This keeps the "no network dependency" requirement the
  spec cares about (Phase 12 WKWebView) and is a one-line token swap later if fonts land.
- Out of scope (per spec §2): Track Editor / full Leaderboard screens, Transmission/
  Suspension/Wheels tabs as distinct designs (Engine tab layout is reused, data-driven),
  PWA shell, texture atlases, capped canvas resolution, WKWebView memory pass, profiling,
  Phase 12 itself.

---

## File structure

```
src/ui-shell/
  ShellRouter.ts        — state machine (hub/guide/garage/settings/playing/paused)
  ShellRouter.test.ts
  ShellBridge.ts         — facade over GarageState/InputManager/SoundEngine/CrtEffect/account
  ShellBridge.test.ts
  tokens.css              — Midnight Synth custom properties
  shell.css                — layout + shared component styles
  components/
    card.ts                 — glass card builder
    tabBar.ts                — tab-bar builder
    toggle.ts                 — pill+knob toggle builder
    slider.ts                  — track+thumb slider builder
    navbar.ts                   — shared Dashboard/Gameplay/Garage/Guide/Retro FX nav
  screens/
    HubScreen.ts
    GuideScreen.ts
    GarageScreen.ts
    SettingsScreen.ts
    SummaryScreen.ts
    PauseOverlay.ts
src/audio/SoundEngine.ts   — MODIFY: add getVolume/setVolume
src/ui/CrtEffect.ts         — MODIFY: add getSettings/setSettings
index.html                   — MODIFY: add #ui-shell mount div
src/main.ts                   — MODIFY: wire ShellRouter/ShellBridge/screens, retire canvas
                                 GarageScreen/SummaryScreen/RemapScreen/AccountScreen wiring
```

---

### Task 1: `SoundEngine` volume getters/setters

**Files:**
- Modify: `src/audio/SoundEngine.ts`
- Test: `src/audio/SoundEngine.test.ts`

**Interfaces:**
- Produces: `SoundEngine.getVolume(bus: 'engine' | 'music'): number`,
  `SoundEngine.setVolume(bus: 'engine' | 'music', value: number): void`. `'engine'` maps to
  the existing `sfxBus` (it carries engine tone + squeal + collision cue — there is no
  separate bus for those today, confirmed by reading `buildGraph`); `'music'` maps to
  `musicBus`. Values are stored in instance fields regardless of whether an `AudioContext`
  exists, so the getters/setters work identically with or without Web Audio support.

- [ ] **Step 1: Write the failing tests**

Add to `src/audio/SoundEngine.test.ts`:

```ts
describe('SoundEngine volume controls (no Web Audio support)', () => {
  it('defaults to the constant bus gains', () => {
    const engine = new SoundEngine();
    expect(engine.getVolume('music')).toBeCloseTo(0.6);
    expect(engine.getVolume('engine')).toBeCloseTo(0.8);
  });

  it('setVolume updates the stored value and clamps to 0..1', () => {
    const engine = new SoundEngine();
    engine.setVolume('music', 0.25);
    expect(engine.getVolume('music')).toBeCloseTo(0.25);
    engine.setVolume('engine', 5);
    expect(engine.getVolume('engine')).toBe(1);
    engine.setVolume('engine', -5);
    expect(engine.getVolume('engine')).toBe(0);
  });

  it('never throws with no AudioContext backing the buses', () => {
    const engine = new SoundEngine();
    expect(() => engine.setVolume('music', 0.5)).not.toThrow();
    expect(() => engine.setVolume('engine', 0.5)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/audio/SoundEngine.test.ts`
Expected: FAIL — `getVolume`/`setVolume` not defined on `SoundEngine`.

- [ ] **Step 3: Implement**

In `src/audio/SoundEngine.ts`, add a `musicBus` field alongside the existing `sfxBus` one
(currently `musicBus` is a local variable in `buildGraph` that's never stored), plus two
volume fields and the two methods:

```ts
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicVolume = MUSIC_BUS_GAIN;
  private sfxVolume = SFX_BUS_GAIN;
  // ...existing fields unchanged...
```

In `buildGraph`, store the bus: change `const musicBus = ctx.createGain();` to keep the
local name but add `this.musicBus = musicBus;` right after `musicBus.connect(ctx.destination);`.

Add after `resume()`:

```ts
  /** 'engine' addresses the sfxBus (engine tone + squeal + collision cue all route
   * through it today — there is no separate engine-only bus); 'music' addresses
   * musicBus. Works identically with or without a live AudioContext. */
  getVolume(bus: 'engine' | 'music'): number {
    return bus === 'music' ? this.musicVolume : this.sfxVolume;
  }

  setVolume(bus: 'engine' | 'music', value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    if (bus === 'music') {
      this.musicVolume = clamped;
      if (this.musicBus) this.musicBus.gain.value = clamped;
    } else {
      this.sfxVolume = clamped;
      if (this.sfxBus) this.sfxBus.gain.value = clamped;
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/audio/SoundEngine.test.ts`
Expected: PASS, all prior tests in the file still green.

- [ ] **Step 5: Commit**

```bash
git add src/audio/SoundEngine.ts src/audio/SoundEngine.test.ts
git commit -m "feat(audio): expose bus volume getters/setters on SoundEngine"
```

---

### Task 2: `CrtEffect` mutable display settings

**Files:**
- Modify: `src/ui/CrtEffect.ts`
- Test: `src/ui/CrtEffect.test.ts`

**Interfaces:**
- Produces: `CrtEffect.getSettings(): { scanline: boolean; aberration: boolean; bloom: number }`,
  `CrtEffect.setSettings(next: Partial<{ scanline: boolean; aberration: boolean; bloom: number }>): void`.
  `scanline`/`aberration` toggle the scanline-intensity/barrel-distortion uniforms between
  their constant default and 0; `bloom` is a 0..1 slider driving `uBloomStrength` directly
  (default equal to `CRT_BLOOM_STRENGTH`). `render()` reads these instead of the raw
  constants directly.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/CrtEffect.test.ts`:

```ts
describe('CrtEffect display settings', () => {
  it('defaults on, matching the shipped constants', () => {
    const crt = new CrtEffect(fakeCanvas(() => null)); // unsupported path is fine here
    const s = crt.getSettings();
    expect(s.scanline).toBe(true);
    expect(s.aberration).toBe(true);
    expect(s.bloom).toBeCloseTo(0.35);
  });

  it('setSettings merges partial updates and clamps bloom to 0..1', () => {
    const crt = new CrtEffect(fakeCanvas(() => null));
    crt.setSettings({ scanline: false });
    expect(crt.getSettings()).toEqual({ scanline: false, aberration: true, bloom: 0.35 });
    crt.setSettings({ bloom: 5 });
    expect(crt.getSettings().bloom).toBe(1);
    crt.setSettings({ bloom: -1 });
    expect(crt.getSettings().bloom).toBe(0);
  });

  it('never throws when settings change on an unsupported instance', () => {
    const crt = new CrtEffect(fakeCanvas(() => null));
    expect(() => crt.setSettings({ scanline: false, aberration: false, bloom: 0.1 })).not.toThrow();
    expect(() => crt.render({} as CanvasImageSource)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/CrtEffect.test.ts`
Expected: FAIL — `getSettings`/`setSettings` not defined.

- [ ] **Step 3: Implement**

In `src/ui/CrtEffect.ts`, add a settings field and the two methods, and read from it in
`render()` instead of the bare constants:

```ts
interface CrtSettings {
  scanline: boolean;
  aberration: boolean;
  bloom: number;
}

export class CrtEffect {
  // ...existing fields...
  private settings: CrtSettings = { scanline: true, aberration: true, bloom: CRT_BLOOM_STRENGTH };

  // ...constructor/supported/resize unchanged...

  getSettings(): CrtSettings {
    return { ...this.settings };
  }

  setSettings(next: Partial<CrtSettings>): void {
    if (next.scanline !== undefined) this.settings.scanline = next.scanline;
    if (next.aberration !== undefined) this.settings.aberration = next.aberration;
    if (next.bloom !== undefined) this.settings.bloom = Math.max(0, Math.min(1, next.bloom));
  }

  render(source: CanvasImageSource): void {
    const gl = this.gl;
    if (!this.ok || !gl || !this.program || !this.uniforms) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.uFrame, 0);
    gl.uniform1f(this.uniforms.uScanlineIntensity, this.settings.scanline ? CRT_SCANLINE_INTENSITY : 0);
    gl.uniform1f(this.uniforms.uDistortion, this.settings.aberration ? CRT_DISTORTION : 0);
    gl.uniform1f(this.uniforms.uBloomThreshold, CRT_BLOOM_THRESHOLD);
    gl.uniform1f(this.uniforms.uBloomStrength, this.settings.bloom);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/CrtEffect.test.ts`
Expected: PASS, all prior tests in the file still green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/CrtEffect.ts src/ui/CrtEffect.test.ts
git commit -m "feat(ui): expose mutable scanline/aberration/bloom settings on CrtEffect"
```

---

### Task 3: `ShellRouter` state machine

**Files:**
- Create: `src/ui-shell/ShellRouter.ts`
- Test: `src/ui-shell/ShellRouter.test.ts`

**Interfaces:**
- Consumes: nothing (pure state machine, no game-module deps).
- Produces:
  ```ts
  export type ScreenState = 'hub' | 'guide' | 'garage' | 'settings' | 'playing' | 'paused';
  export type SettingsOpener = 'hub' | 'guide' | 'garage';
  export type SettingsTab = 'controls' | 'audio' | 'display' | 'account';
  export class ShellRouter {
    get state(): ScreenState;
    get settingsOpener(): SettingsOpener;
    get settingsTab(): SettingsTab;
    goHub(): void;
    goGuide(): void;
    goGarage(): void;
    openSettings(tab?: SettingsTab): void; // opener = whatever `state` was before the call
    setSettingsTab(tab: SettingsTab): void;
    closeSettings(): void; // returns to settingsOpener
    startPlaying(): void;
    pause(): void;
    resume(): void;
    quitToHub(): void;
    toggleEsc(): void; // playing<->paused, no-op elsewhere
  }
  ```
  Later tasks (screens, `main.ts`) drive navigation exclusively through these methods.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { ShellRouter } from './ShellRouter.js';

describe('ShellRouter', () => {
  it('starts on hub', () => {
    expect(new ShellRouter().state).toBe('hub');
  });

  it('every non-playing screen can reach hub in one call', () => {
    for (const enter of [
      (r: ShellRouter) => r.goGuide(),
      (r: ShellRouter) => r.goGarage(),
      (r: ShellRouter) => r.openSettings(),
    ]) {
      const router = new ShellRouter();
      enter(router);
      router.goHub();
      expect(router.state).toBe('hub');
    }
  });

  it('settings always returns to whichever screen opened it', () => {
    const fromHub = new ShellRouter();
    fromHub.openSettings();
    expect(fromHub.settingsOpener).toBe('hub');
    fromHub.closeSettings();
    expect(fromHub.state).toBe('hub');

    const fromGarage = new ShellRouter();
    fromGarage.goGarage();
    fromGarage.openSettings();
    expect(fromGarage.settingsOpener).toBe('garage');
    fromGarage.closeSettings();
    expect(fromGarage.state).toBe('garage');

    const fromGuide = new ShellRouter();
    fromGuide.goGuide();
    fromGuide.openSettings();
    expect(fromGuide.settingsOpener).toBe('guide');
    fromGuide.closeSettings();
    expect(fromGuide.state).toBe('guide');
  });

  it('openSettings defaults to the display tab, and setSettingsTab swaps without navigating', () => {
    const router = new ShellRouter();
    router.openSettings();
    expect(router.settingsTab).toBe('display');
    router.setSettingsTab('controls');
    expect(router.state).toBe('settings');
    expect(router.settingsTab).toBe('controls');
  });

  it('playing <-> paused toggles on Esc, and is a no-op everywhere else', () => {
    const router = new ShellRouter();
    router.startPlaying();
    expect(router.state).toBe('playing');
    router.toggleEsc();
    expect(router.state).toBe('paused');
    router.toggleEsc();
    expect(router.state).toBe('playing');

    router.goHub();
    router.toggleEsc();
    expect(router.state).toBe('hub'); // Esc does nothing outside playing/paused
  });

  it('quitToHub returns to hub from paused', () => {
    const router = new ShellRouter();
    router.startPlaying();
    router.pause();
    router.quitToHub();
    expect(router.state).toBe('hub');
  });

  it('resume from paused returns to playing', () => {
    const router = new ShellRouter();
    router.startPlaying();
    router.pause();
    router.resume();
    expect(router.state).toBe('playing');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui-shell/ShellRouter.test.ts`
Expected: FAIL — module `./ShellRouter.js` does not exist.

- [ ] **Step 3: Implement**

```ts
export type ScreenState = 'hub' | 'guide' | 'garage' | 'settings' | 'playing' | 'paused';
export type SettingsOpener = 'hub' | 'guide' | 'garage';
export type SettingsTab = 'controls' | 'audio' | 'display' | 'account';

/** Pure navigation state machine for the DOM UI shell (spec §3/§5). No DOM,
 * no game-module deps — main.ts and every screen drive navigation only
 * through this class's methods, never by mutating state directly. */
export class ShellRouter {
  private current: ScreenState = 'hub';
  private opener: SettingsOpener = 'hub';
  private tab: SettingsTab = 'display';

  get state(): ScreenState { return this.current; }
  get settingsOpener(): SettingsOpener { return this.opener; }
  get settingsTab(): SettingsTab { return this.tab; }

  goHub(): void { this.current = 'hub'; }
  goGuide(): void { this.current = 'guide'; }
  goGarage(): void { this.current = 'garage'; }

  openSettings(tab: SettingsTab = 'display'): void {
    if (this.current === 'hub' || this.current === 'guide' || this.current === 'garage') {
      this.opener = this.current;
    }
    this.tab = tab;
    this.current = 'settings';
  }

  setSettingsTab(tab: SettingsTab): void {
    this.tab = tab;
  }

  closeSettings(): void {
    this.current = this.opener;
  }

  startPlaying(): void { this.current = 'playing'; }
  pause(): void { if (this.current === 'playing') this.current = 'paused'; }
  resume(): void { if (this.current === 'paused') this.current = 'playing'; }
  quitToHub(): void { this.current = 'hub'; }

  toggleEsc(): void {
    if (this.current === 'playing') this.current = 'paused';
    else if (this.current === 'paused') this.current = 'playing';
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui-shell/ShellRouter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui-shell/ShellRouter.ts src/ui-shell/ShellRouter.test.ts
git commit -m "feat(ui-shell): add ShellRouter navigation state machine"
```

---

### Task 4: `ShellBridge` facade

**Files:**
- Create: `src/ui-shell/ShellBridge.ts`
- Test: `src/ui-shell/ShellBridge.test.ts`

**Interfaces:**
- Consumes: `GarageState` (Task-independent, existing `src/economy/GarageState.ts`),
  `InputManager` (existing `src/input/InputManager.ts`, exports `Action`, `Bindings`,
  `ACTIONS`), `SoundEngine.getVolume/setVolume` (Task 1), `CrtEffect.getSettings/setSettings`
  (Task 2), `net/account.ts`'s `linkEmail`/`setPassword`/`isAccountLinked`, `PART_CATALOG`
  from `economy/partCurves.ts`, `resolveMetrics`/`metricsToParams` from `economy/Garage.ts`,
  `Part`/`PartCategory`/`CarMetrics` from `types/inventory.ts`.
- Produces:
  ```ts
  export interface StatDiff { speed: number; accel: number; handling: number; grip: number }
  export interface CrtSettings { scanline: boolean; aberration: boolean; bloom: number }
  export interface Identity { displayName: string; linked: boolean }

  export class ShellBridge {
    constructor(deps: {
      garage: GarageState;
      input: InputManager;
      sound: SoundEngine;
      crt: CrtEffect;
      onGarageChange: () => void; // persist + rebuild vehicle, supplied by main.ts
    });
    getCredits(): number;
    getCatalog(category: PartCategory): Part[];
    getPartState(part: Part): PartState;
    buyAndEquip(part: Part): boolean;
    getStatDiff(part: Part): StatDiff;
    getBindings(): Bindings;
    rebind(action: Action, code: string): void;
    getVolume(bus: 'engine' | 'music'): number;
    setVolume(bus: 'engine' | 'music', value: number): void;
    getCrtSettings(): CrtSettings;
    setCrtSettings(next: Partial<CrtSettings>): void;
    getIdentity(): Promise<Identity>;
    linkEmail(email: string): Promise<'ok' | 'no-backend' | 'error'>;
    setPassword(password: string): Promise<'ok' | 'no-backend' | 'error'>;
  }
  ```
  Deviation from spec §6: `getIdentity`/`linkEmail`/`setPassword` are `Promise`-returning
  (the spec's pseudo-interface shows `getIdentity` as sync, but the underlying
  `net/account.ts` functions are all `async` against Supabase — no way to make this sync
  without caching stale state).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ShellBridge } from './ShellBridge.js';
import { GarageState } from '../economy/GarageState.js';
import { InputManager, DEFAULT_BINDINGS } from '../input/InputManager.js';
import { SoundEngine } from '../audio/SoundEngine.js';
import { CrtEffect } from '../ui/CrtEffect.js';
import { PART_CATALOG } from '../economy/partCurves.js';

function makeBridge() {
  const garage = new GarageState();
  const input = new InputManager();
  const sound = new SoundEngine();
  const crt = new CrtEffect({ getContext: () => null } as unknown as HTMLCanvasElement);
  const onGarageChange = vi.fn();
  const bridge = new ShellBridge({ garage, input, sound, crt, onGarageChange });
  return { bridge, garage, input, sound, crt, onGarageChange };
}

describe('ShellBridge — garage', () => {
  it('reads credits and catalog straight through', () => {
    const { bridge, garage } = makeBridge();
    garage.award(1000);
    expect(bridge.getCredits()).toBe(1000);
    expect(bridge.getCatalog('engine')).toEqual(PART_CATALOG.filter((p) => p.category === 'engine'));
  });

  it('buyAndEquip buys then equips an affordable part and calls onGarageChange once', () => {
    const { bridge, garage, onGarageChange } = makeBridge();
    const part = PART_CATALOG.find((p) => p.category === 'engine')!;
    garage.award(part.cost);
    expect(bridge.buyAndEquip(part)).toBe(true);
    expect(garage.owns(part.id)).toBe(true);
    expect(garage.equipped.engine).toBe(part.id);
    expect(onGarageChange).toHaveBeenCalledTimes(1);
  });

  it('buyAndEquip returns false and does not call onGarageChange when unaffordable', () => {
    const { bridge, onGarageChange } = makeBridge();
    const part = PART_CATALOG.find((p) => p.category === 'engine')!;
    expect(bridge.buyAndEquip(part)).toBe(false);
    expect(onGarageChange).not.toHaveBeenCalled();
  });

  it('getStatDiff reports the delta between a candidate and the currently equipped part', () => {
    const { bridge } = makeBridge();
    const part = PART_CATALOG.find((p) => p.category === 'engine')!;
    const diff = bridge.getStatDiff(part);
    expect(diff.speed).toBeCloseTo(part.speedMod);
    expect(diff.accel).toBeCloseTo(part.accelMod);
  });
});

describe('ShellBridge — controls', () => {
  it('getBindings/rebind pass through to InputManager', () => {
    const { bridge, input } = makeBridge();
    expect(bridge.getBindings()).toEqual(DEFAULT_BINDINGS);
    bridge.rebind('throttle', 'KeyZ');
    expect(input.bindings.throttle).toContain('KeyZ');
  });
});

describe('ShellBridge — audio', () => {
  it('getVolume/setVolume pass through to SoundEngine', () => {
    const { bridge } = makeBridge();
    bridge.setVolume('music', 0.4);
    expect(bridge.getVolume('music')).toBeCloseTo(0.4);
  });
});

describe('ShellBridge — display', () => {
  it('getCrtSettings/setCrtSettings pass through to CrtEffect', () => {
    const { bridge } = makeBridge();
    bridge.setCrtSettings({ scanline: false });
    expect(bridge.getCrtSettings().scanline).toBe(false);
  });
});

describe('ShellBridge — account', () => {
  it('getIdentity resolves unlinked with no Supabase backend configured', async () => {
    const { bridge } = makeBridge();
    const identity = await bridge.getIdentity();
    expect(identity.linked).toBe(false);
  });

  it('linkEmail/setPassword report no-backend with no Supabase client configured', async () => {
    const { bridge } = makeBridge();
    expect(await bridge.linkEmail('a@b.com')).toBe('no-backend');
    expect(await bridge.setPassword('hunter2')).toBe('no-backend');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui-shell/ShellBridge.test.ts`
Expected: FAIL — module `./ShellBridge.js` does not exist.

- [ ] **Step 3: Implement**

```ts
import type { GarageState, PartState } from '../economy/GarageState.js';
import { resolveMetrics, metricsToParams } from '../economy/Garage.js';
import { PART_CATALOG } from '../economy/partCurves.js';
import type { Part, PartCategory, CarMetrics } from '../types/inventory.js';
import type { InputManager, Action, Bindings } from '../input/InputManager.js';
import type { SoundEngine } from '../audio/SoundEngine.js';
import type { CrtEffect } from '../ui/CrtEffect.js';
import { linkEmail as linkEmailReal, setPassword as setPasswordReal, isAccountLinked } from '../net/account.js';

export interface StatDiff { speed: number; accel: number; handling: number; grip: number }
export interface CrtSettings { scanline: boolean; aberration: boolean; bloom: number }
export interface Identity { displayName: string; linked: boolean }

export interface ShellBridgeDeps {
  garage: GarageState;
  input: InputManager;
  sound: SoundEngine;
  crt: CrtEffect;
  onGarageChange: () => void;
}

/** Thin facade so ui-shell code never touches game-module internals directly
 * (spec §6). Every method is a one-line pass-through — this is the seam
 * vitest targets; screens themselves are not unit-tested (no jsdom here). */
export class ShellBridge {
  constructor(private readonly deps: ShellBridgeDeps) {}

  getCredits(): number {
    return this.deps.garage.credits;
  }

  getCatalog(category: PartCategory): Part[] {
    return PART_CATALOG.filter((p) => p.category === category);
  }

  getPartState(part: Part): PartState {
    return this.deps.garage.partState(part);
  }

  buyAndEquip(part: Part): boolean {
    const { garage, onGarageChange } = this.deps;
    if (garage.partState(part) === 'owned') {
      const ok = garage.equip(part);
      if (ok) onGarageChange();
      return ok;
    }
    if (!garage.buy(part)) return false;
    garage.equip(part);
    onGarageChange();
    return true;
  }

  /** Delta between `part`'s resolved metrics and the currently-equipped loadout's. */
  getStatDiff(part: Part): StatDiff {
    const equipped = this.deps.garage.equipped;
    const current = resolveMetrics(equipped);
    const candidateLoadout = { ...equipped, [part.category]: part.id };
    const candidate = resolveMetrics(candidateLoadout);
    return {
      speed: candidate.speed - current.speed,
      accel: candidate.accel - current.accel,
      handling: candidate.handling - current.handling,
      grip: candidate.grip - current.grip,
    };
  }

  getBindings(): Bindings {
    return this.deps.input.bindings;
  }

  rebind(action: Action, code: string): void {
    const { input } = this.deps;
    input.setBindings({ ...input.bindings, [action]: [code] });
  }

  getVolume(bus: 'engine' | 'music'): number {
    return this.deps.sound.getVolume(bus);
  }

  setVolume(bus: 'engine' | 'music', value: number): void {
    this.deps.sound.setVolume(bus, value);
  }

  getCrtSettings(): CrtSettings {
    return this.deps.crt.getSettings();
  }

  setCrtSettings(next: Partial<CrtSettings>): void {
    this.deps.crt.setSettings(next);
  }

  async getIdentity(): Promise<Identity> {
    const linked = await isAccountLinked();
    return { displayName: linked ? 'Driver' : 'Guest Driver', linked };
  }

  async linkEmail(email: string): Promise<'ok' | 'no-backend' | 'error'> {
    return linkEmailReal(email);
  }

  async setPassword(password: string): Promise<'ok' | 'no-backend' | 'error'> {
    return setPasswordReal(password);
  }
}
```

Note: `metricsToParams` is imported for downstream screens/tests that may need it re-exported
later; if `tsc --noEmit` flags it as unused in this file, drop the import — it is not
actually called by `ShellBridge` itself (rebuilding the `Vehicle` stays `main.ts`'s job via
`onGarageChange`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui-shell/ShellBridge.test.ts`
Expected: PASS. Then run `npx tsc --noEmit` to confirm no unused-import errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui-shell/ShellBridge.ts src/ui-shell/ShellBridge.test.ts
git commit -m "feat(ui-shell): add ShellBridge facade over garage/input/audio/display/account"
```

---

### Task 5: Design tokens + shared shell stylesheet

**Files:**
- Create: `src/ui-shell/tokens.css`
- Create: `src/ui-shell/shell.css`

No test — pure CSS, verified visually in Task 12's manual QA pass. This task's deliverable
is "the tokens and shared classes every screen in Tasks 6–11 will use exist and are wired
into the page," checked by confirming the file loads with no console errors once Task 6
imports it.

- [ ] **Step 1: Write `tokens.css`**

```css
:root {
  --rt-bg-top: #0B0C10;
  --rt-bg-bottom: #1A1A2E;
  --rt-surface: rgba(31, 40, 51, 0.6);
  --rt-surface-border: rgba(255, 255, 255, 0.1);
  --rt-blur: 16px;

  --rt-cyan: #00FFFF;
  --rt-gold: #FFD700;
  --rt-magenta: #FF00FF;
  --rt-red: #FF3333;

  --rt-text: #F2F4F8;
  --rt-text-muted: #9AA3B2;
  --rt-text-dim: #5C6472;
  --rt-nav-inactive: rgba(255, 255, 255, 0.65);

  --rt-font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --rt-font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --rt-font-mono: ui-monospace, "SF Mono", Consolas, monospace;

  --rt-radius: 8px;
}
```

- [ ] **Step 2: Write `shell.css`**

```css
@import './tokens.css';

#ui-shell {
  position: fixed;
  inset: 0;
  z-index: 10;
  font-family: var(--rt-font-body);
  color: var(--rt-text);
  background: linear-gradient(180deg, var(--rt-bg-top), var(--rt-bg-bottom));
  overflow-y: auto;
}

#ui-shell[data-hidden="true"] {
  display: none;
}

#ui-shell .rt-screen {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px clamp(16px, 4vw, 48px);
  gap: 24px;
  box-sizing: border-box;
}

#ui-shell .rt-card {
  background: var(--rt-surface);
  border: 1px solid var(--rt-surface-border);
  border-radius: 16px;
  backdrop-filter: blur(var(--rt-blur));
  -webkit-backdrop-filter: blur(var(--rt-blur));
  padding: 20px;
}

#ui-shell .rt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

#ui-shell .rt-navbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

#ui-shell .rt-navbar button {
  background: transparent;
  border: none;
  color: var(--rt-nav-inactive);
  font-family: var(--rt-font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: var(--rt-radius);
  cursor: pointer;
}

#ui-shell .rt-navbar button[aria-current="true"] {
  color: var(--rt-cyan);
  box-shadow: inset 0 -2px 0 var(--rt-cyan);
}

#ui-shell .rt-btn {
  border-radius: var(--rt-radius);
  border: none;
  padding: 10px 20px;
  font-family: var(--rt-font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 13px;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

#ui-shell .rt-btn-primary {
  background: var(--rt-cyan);
  color: #0B0C10;
}

#ui-shell .rt-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 16px var(--rt-cyan);
}

#ui-shell .rt-btn-ghost {
  background: transparent;
  color: var(--rt-text);
  border: 1px solid var(--rt-surface-border);
}

#ui-shell .rt-tabbar {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--rt-surface-border);
}

#ui-shell .rt-tabbar button {
  background: transparent;
  border: none;
  color: var(--rt-text-muted);
  padding: 10px 16px;
  cursor: pointer;
  font-family: var(--rt-font-display);
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
}

#ui-shell .rt-tabbar button[aria-selected="true"] {
  color: var(--rt-cyan);
  box-shadow: inset 0 -2px 0 var(--rt-cyan);
}

#ui-shell .rt-toggle {
  --rt-toggle-w: 40px;
  width: var(--rt-toggle-w);
  height: 22px;
  border-radius: 11px;
  background: var(--rt-text-dim);
  border: none;
  position: relative;
  cursor: pointer;
}

#ui-shell .rt-toggle[aria-checked="true"] {
  background: var(--rt-cyan);
}

#ui-shell .rt-toggle::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--rt-text);
  transition: left 120ms ease;
}

#ui-shell .rt-toggle[aria-checked="true"]::after {
  left: calc(var(--rt-toggle-w) - 20px);
}

#ui-shell .rt-slider {
  width: 100%;
  accent-color: var(--rt-cyan);
}

#ui-shell .rt-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

#ui-shell .rt-modal {
  width: min(720px, 92vw);
  max-height: 86vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

#ui-shell .rt-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

#ui-shell .rt-stat-bar-track {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

#ui-shell .rt-stat-bar-fill {
  height: 100%;
}

#ui-shell .rt-stat-bar-fill[data-sign="positive"] {
  background: var(--rt-cyan);
}

#ui-shell .rt-stat-bar-fill[data-sign="negative"] {
  background: var(--rt-red);
}

#ui-shell .rt-pause-overlay {
  position: fixed;
  inset: 0;
  background: rgba(11, 12, 16, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 15;
}

@media (max-width: 760px) {
  #ui-shell .rt-garage-layout {
    flex-direction: column;
  }
}
```

- [ ] **Step 3: No automated check — this task is complete once Task 6 imports the file and
  `npm run dev` shows no 404/console errors for it.**

- [ ] **Step 4: Commit**

```bash
git add src/ui-shell/tokens.css src/ui-shell/shell.css
git commit -m "feat(ui-shell): add Midnight Synth design tokens and shared shell stylesheet"
```

---

### Task 6: Shared DOM components (navbar, card, tab-bar, toggle, slider, modal)

**Files:**
- Create: `src/ui-shell/components/navbar.ts`
- Create: `src/ui-shell/components/card.ts`
- Create: `src/ui-shell/components/tabBar.ts`
- Create: `src/ui-shell/components/toggle.ts`
- Create: `src/ui-shell/components/slider.ts`
- Create: `src/ui-shell/components/modal.ts`

No unit tests (DOM-only, no jsdom in this repo). Verified in Task 12's manual QA pass.

**Interfaces:**
- Produces:
  ```ts
  // navbar.ts
  export type NavTarget = 'hub' | 'garage' | 'guide' | 'settings';
  export function buildNavbar(active: NavTarget | null, onNavigate: (t: NavTarget) => void): HTMLElement;

  // card.ts
  export function buildCard(children: HTMLElement[], extraClass?: string): HTMLElement;

  // tabBar.ts
  export function buildTabBar<T extends string>(
    tabs: readonly { id: T; label: string }[],
    active: T,
    onSelect: (id: T) => void,
  ): HTMLElement;

  // toggle.ts
  export function buildToggle(checked: boolean, onChange: (next: boolean) => void): HTMLButtonElement;

  // slider.ts
  export function buildSlider(value: number, min: number, max: number, step: number, onInput: (v: number) => void): HTMLInputElement;

  // modal.ts
  export function buildModal(body: HTMLElement, footer: HTMLElement, onClose: () => void): HTMLElement; // returns the backdrop element, appended/removed by the caller
  ```

- [ ] **Step 1: `components/navbar.ts`**

```ts
export type NavTarget = 'hub' | 'garage' | 'guide' | 'settings';

const LABELS: Record<NavTarget, string> = {
  hub: 'Dashboard',
  garage: 'Garage',
  guide: 'Guide',
  settings: 'Retro FX',
};

/** Shared nav present on every non-playing/paused screen (spec §3): a
 * one-click path back to the hub from anywhere. `active` is null on screens
 * (like Settings) that render as an overlay rather than owning a nav slot. */
export function buildNavbar(active: NavTarget | null, onNavigate: (target: NavTarget) => void): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'rt-navbar';
  (['hub', 'garage', 'guide', 'settings'] as const).forEach((target) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = LABELS[target];
    btn.setAttribute('aria-current', String(target === active));
    btn.addEventListener('click', () => onNavigate(target));
    nav.appendChild(btn);
  });
  return nav;
}
```

- [ ] **Step 2: `components/card.ts`**

```ts
export function buildCard(children: HTMLElement[], extraClass = ''): HTMLElement {
  const card = document.createElement('div');
  card.className = extraClass ? `rt-card ${extraClass}` : 'rt-card';
  for (const child of children) card.appendChild(child);
  return card;
}
```

- [ ] **Step 3: `components/tabBar.ts`**

```ts
export function buildTabBar<T extends string>(
  tabs: readonly { id: T; label: string }[],
  active: T,
  onSelect: (id: T) => void,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'rt-tabbar';
  bar.setAttribute('role', 'tablist');
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = tab.label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(tab.id === active));
    btn.addEventListener('click', () => onSelect(tab.id));
    bar.appendChild(btn);
  }
  return bar;
}
```

- [ ] **Step 4: `components/toggle.ts`**

```ts
export function buildToggle(checked: boolean, onChange: (next: boolean) => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rt-toggle';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', String(checked));
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return btn;
}
```

- [ ] **Step 5: `components/slider.ts`**

```ts
export function buildSlider(
  value: number, min: number, max: number, step: number, onInput: (v: number) => void,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'rt-slider';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value)));
  return input;
}
```

- [ ] **Step 6: `components/modal.ts`**

```ts
export function buildModal(body: HTMLElement, footer: HTMLElement, onClose: () => void): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'rt-modal-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) onClose();
  });

  const modal = document.createElement('div');
  modal.className = 'rt-modal rt-card';
  modal.appendChild(body);

  const footerRow = document.createElement('div');
  footerRow.className = 'rt-modal-footer';
  footerRow.appendChild(footer);
  modal.appendChild(footerRow);

  backdrop.appendChild(modal);
  return backdrop;
}
```

- [ ] **Step 7: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/ui-shell/components/
git commit -m "feat(ui-shell): add shared navbar/card/tab-bar/toggle/slider/modal builders"
```

---

### Task 7: `HubScreen` and `GuideScreen`

**Files:**
- Create: `src/ui-shell/screens/HubScreen.ts`
- Create: `src/ui-shell/screens/GuideScreen.ts`

**Interfaces:**
- Consumes: `buildNavbar` (Task 6), `buildCard` (Task 6), `ShellRouter` (Task 3), `ShellBridge`
  (Task 4, for the credits preview on the Garage card).
- Produces:
  ```ts
  // HubScreen.ts
  export function renderHub(router: ShellRouter, bridge: ShellBridge, onRace: () => void): HTMLElement;
  // GuideScreen.ts
  export function renderGuide(router: ShellRouter): HTMLElement;
  ```
  Both are pure "build a fresh subtree" functions — the caller (Task 11's `ShellApp`/mount
  point) replaces `#ui-shell`'s content with the returned element on every navigation. No
  internal state; re-render-from-scratch keeps these screens trivially correct at the cost
  of losing scroll position across navigations, an acceptable trade for a menu shell.

- [ ] **Step 1: `screens/HubScreen.ts`**

```ts
import { buildNavbar } from '../components/navbar.js';
import { buildCard } from '../components/card.js';
import type { ShellRouter } from '../ShellRouter.js';
import type { ShellBridge } from '../ShellBridge.js';

/** net-new Dashboard/Hub (spec §4): hero Race Route CTA, Garage preview card,
 * Leaderboard preview card (links out — full leaderboard screen is a canvas
 * F3 overlay, out of scope for this spec per §2), and three subcards. */
export function renderHub(router: ShellRouter, bridge: ShellBridge, onRace: () => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen';

  root.appendChild(buildNavbar('hub', (target) => {
    if (target === 'hub') router.goHub();
    else if (target === 'garage') router.goGarage();
    else if (target === 'guide') router.goGuide();
    else router.openSettings();
  }));

  const hero = document.createElement('div');
  hero.className = 'rt-card';
  const heroTitle = document.createElement('h1');
  heroTitle.textContent = 'Retroline Turbo';
  const raceBtn = document.createElement('button');
  raceBtn.type = 'button';
  raceBtn.className = 'rt-btn rt-btn-primary';
  raceBtn.textContent = 'Race Route';
  raceBtn.addEventListener('click', onRace);
  hero.append(heroTitle, raceBtn);
  root.appendChild(hero);

  const grid = document.createElement('div');
  grid.className = 'rt-grid';

  const garageTitle = document.createElement('h3');
  garageTitle.textContent = 'Garage';
  const garageCredits = document.createElement('p');
  garageCredits.textContent = `${bridge.getCredits()}c`;
  const garageBtn = document.createElement('button');
  garageBtn.type = 'button';
  garageBtn.className = 'rt-btn rt-btn-ghost';
  garageBtn.textContent = 'Open Garage';
  garageBtn.addEventListener('click', () => router.goGarage());
  grid.appendChild(buildCard([garageTitle, garageCredits, garageBtn]));

  const guideTitle = document.createElement('h3');
  guideTitle.textContent = 'How to Play';
  const guideBtn = document.createElement('button');
  guideBtn.type = 'button';
  guideBtn.className = 'rt-btn rt-btn-ghost';
  guideBtn.textContent = "Driver's Guide";
  guideBtn.addEventListener('click', () => router.goGuide());
  grid.appendChild(buildCard([guideTitle, guideBtn]));

  const settingsTitle = document.createElement('h3');
  settingsTitle.textContent = 'Settings & Retro FX';
  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'rt-btn rt-btn-ghost';
  settingsBtn.textContent = 'Open Settings';
  settingsBtn.addEventListener('click', () => router.openSettings());
  grid.appendChild(buildCard([settingsTitle, settingsBtn]));

  const editorTitle = document.createElement('h3');
  editorTitle.textContent = 'Track Editor';
  const editorBadge = document.createElement('span');
  editorBadge.textContent = 'BETA';
  const editorNote = document.createElement('p');
  editorNote.textContent = 'Press Tab in-game to open the track editor.';
  grid.appendChild(buildCard([editorTitle, editorBadge, editorNote]));

  root.appendChild(grid);
  return root;
}
```

- [ ] **Step 2: `screens/GuideScreen.ts`**

```ts
import { buildNavbar } from '../components/navbar.js';
import { buildCard } from '../components/card.js';
import type { ShellRouter } from '../ShellRouter.js';

/** net-new Driver's Guide (spec §4): static driving-mechanics + route-pyramid
 * explainer content. No backing code — this screen is prose. */
export function renderGuide(router: ShellRouter): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen';
  root.appendChild(buildNavbar('guide', (target) => {
    if (target === 'hub') router.goHub();
    else if (target === 'garage') router.goGarage();
    else if (target === 'guide') router.goGuide();
    else router.openSettings();
  }));

  const title = document.createElement('h1');
  title.textContent = "Driver's Guide";

  const controlsCard = buildCard([
    Object.assign(document.createElement('h3'), { textContent: 'Controls' }),
    Object.assign(document.createElement('p'), {
      textContent: 'WASD or Arrow Keys to drive. Space for handbrake. Mouse (click to lock) '
        + 'or a gamepad also steer. Rebind anything from Settings > Controls.',
    }),
  ]);

  const routeCard = buildCard([
    Object.assign(document.createElement('h3'), { textContent: 'The Route Pyramid' }),
    Object.assign(document.createElement('p'), {
      textContent: 'Five stages, each ending in a fork. Steer left or right of the median '
        + 'through a split to choose your next scene — 25 possible routes to five different endings.',
    }),
  ]);

  const economyCard = buildCard([
    Object.assign(document.createElement('h3'), { textContent: 'Earning & Upgrades' }),
    Object.assign(document.createElement('p'), {
      textContent: 'Clearing stages, banking time, and passing traffic all earn credits at the '
        + "finish. Spend them in the Garage on Engine, Transmission, Suspension, and Wheels parts "
        + '— every part is a trade-off, not a strict upgrade.',
    }),
  ]);

  root.append(title, controlsCard, routeCard, economyCard);
  return root;
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui-shell/screens/HubScreen.ts src/ui-shell/screens/GuideScreen.ts
git commit -m "feat(ui-shell): add Hub and Driver's Guide screens"
```

---

### Task 8: `GarageScreen` (DOM) — carousel, catalog, stat-diff

**Files:**
- Create: `src/ui-shell/screens/GarageScreen.ts`

**Interfaces:**
- Consumes: `PART_CATEGORIES` (`types/inventory.ts`), `ShellBridge` (Task 4), `buildNavbar`/
  `buildCard` (Task 6).
- Produces: `export function renderGarage(router: ShellRouter, bridge: ShellBridge): HTMLElement;`

- [ ] **Step 1: Implement**

```ts
import { buildNavbar } from '../components/navbar.js';
import { PART_CATEGORIES, type PartCategory, type Part } from '../../types/inventory.js';
import type { ShellRouter } from '../ShellRouter.js';
import type { ShellBridge } from '../ShellBridge.js';

const CATEGORY_LABEL: Record<PartCategory, string> = {
  engine: 'Engine', transmission: 'Transmission', suspension: 'Suspension', wheels: 'Wheels',
};

function statBar(label: string, delta: number): HTMLElement {
  const row = document.createElement('div');
  const cap = document.createElement('span');
  cap.textContent = `${label} ${delta >= 0 ? '+' : ''}${delta}`;
  const track = document.createElement('div');
  track.className = 'rt-stat-bar-track';
  const fill = document.createElement('div');
  fill.className = 'rt-stat-bar-fill';
  fill.dataset.sign = delta >= 0 ? 'positive' : 'negative';
  fill.style.width = `${Math.min(100, Math.abs(delta) * 5)}%`;
  track.appendChild(fill);
  row.append(cap, track);
  return row;
}

function partRow(part: Part, bridge: ShellBridge, onChange: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'rt-card';
  const name = document.createElement('span');
  name.textContent = part.name;
  const state = bridge.getPartState(part);
  const stateLabel = document.createElement('span');
  stateLabel.textContent = state === 'unaffordable' ? `${part.cost}c (need more)`
    : state === 'purchasable' ? `${part.cost}c` : state;
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'rt-btn rt-btn-primary';
  action.textContent = state === 'equipped' ? 'Fitted' : state === 'owned' ? 'Fit' : 'Buy & Fit';
  action.disabled = state === 'equipped' || state === 'locked' || state === 'unaffordable';
  action.addEventListener('click', () => {
    if (bridge.buyAndEquip(part)) onChange();
  });

  const diff = bridge.getStatDiff(part);
  const diffBox = document.createElement('div');
  diffBox.append(
    statBar('Speed', diff.speed), statBar('Accel', diff.accel),
    statBar('Handling', diff.handling), statBar('Grip', diff.grip),
  );

  row.append(name, stateLabel, action, diffBox);
  return row;
}

/** Garage & Marketplace (spec §4): a category carousel + per-part rows with a
 * stat-diff readout. The Engine tab's layout is reused unchanged for the
 * other three categories, data-driven off `getCatalog` — not a separate
 * design per spec §2. */
export function renderGarage(router: ShellRouter, bridge: ShellBridge): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen rt-garage-layout';
  root.appendChild(buildNavbar('garage', (target) => {
    if (target === 'hub') router.goHub();
    else if (target === 'garage') router.goGarage();
    else if (target === 'guide') router.goGuide();
    else router.openSettings();
  }));

  const header = document.createElement('div');
  const credits = document.createElement('span');
  credits.textContent = `${bridge.getCredits()}c`;
  header.appendChild(credits);
  root.appendChild(header);

  let activeCategory: PartCategory = 'engine';
  const listWrap = document.createElement('div');

  function renderList(): void {
    listWrap.innerHTML = '';
    for (const part of bridge.getCatalog(activeCategory)) {
      listWrap.appendChild(partRow(part, bridge, () => {
        credits.textContent = `${bridge.getCredits()}c`;
        renderList();
      }));
    }
  }

  const carousel = document.createElement('div');
  carousel.className = 'rt-tabbar';
  for (const category of PART_CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = CATEGORY_LABEL[category];
    btn.setAttribute('aria-selected', String(category === activeCategory));
    btn.addEventListener('click', () => {
      activeCategory = category;
      for (const sibling of Array.from(carousel.children)) {
        sibling.setAttribute('aria-selected', String(sibling === btn));
      }
      renderList();
    });
    carousel.appendChild(btn);
  }
  root.append(carousel, listWrap);
  renderList();

  return root;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui-shell/screens/GarageScreen.ts
git commit -m "feat(ui-shell): add DOM Garage & Marketplace screen"
```

---

### Task 9: `SettingsScreen` — controls / audio / display / account tabs

**Files:**
- Create: `src/ui-shell/screens/SettingsScreen.ts`

**Interfaces:**
- Consumes: `buildTabBar`, `buildToggle`, `buildSlider`, `buildModal` (Task 6), `ACTIONS`
  from `input/InputManager.ts`, `ShellRouter`/`ShellBridge`.
- Produces: `export function renderSettings(router: ShellRouter, bridge: ShellBridge): HTMLElement;`

- [ ] **Step 1: Implement**

```ts
import { buildTabBar } from '../components/tabBar.js';
import { buildToggle } from '../components/toggle.js';
import { buildSlider } from '../components/slider.js';
import { buildModal } from '../components/modal.js';
import { ACTIONS, type Action } from '../../input/InputManager.js';
import type { ShellRouter, SettingsTab } from '../ShellRouter.js';
import type { ShellBridge } from '../ShellBridge.js';

const ACTION_LABEL: Record<Action, string> = {
  throttle: 'Throttle', brake: 'Brake', steerLeft: 'Steer Left', steerRight: 'Steer Right',
  handbrake: 'Handbrake', gearUp: 'Gear Up', gearDown: 'Gear Down', nitro: 'Nitro',
};

const TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'audio', label: 'Audio' },
  { id: 'display', label: 'Display & Retro FX' },
  { id: 'account', label: 'Driver Account' },
];

function renderControlsTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  const bindings = bridge.getBindings();
  for (const action of ACTIONS) {
    const row = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = ACTION_LABEL[action];
    const current = document.createElement('span');
    current.textContent = bindings[action].join(' / ');
    const rebindBtn = document.createElement('button');
    rebindBtn.type = 'button';
    rebindBtn.className = 'rt-btn rt-btn-ghost';
    rebindBtn.textContent = 'Rebind';
    rebindBtn.addEventListener('click', () => {
      rebindBtn.textContent = 'Press a key…';
      const onKey = (e: KeyboardEvent): void => {
        bridge.rebind(action, e.code);
        current.textContent = bridge.getBindings()[action].join(' / ');
        rebindBtn.textContent = 'Rebind';
        window.removeEventListener('keydown', onKey);
      };
      window.addEventListener('keydown', onKey, { once: true });
    });
    row.append(label, current, rebindBtn);
    wrap.appendChild(row);
  }
  return wrap;
}

function renderAudioTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  const engineRow = document.createElement('div');
  const engineLabel = document.createElement('span');
  engineLabel.textContent = 'Engine & SFX';
  const engineSlider = buildSlider(bridge.getVolume('engine'), 0, 1, 0.05, (v) => bridge.setVolume('engine', v));
  engineRow.append(engineLabel, engineSlider);

  const musicRow = document.createElement('div');
  const musicLabel = document.createElement('span');
  musicLabel.textContent = 'Soundtrack';
  const musicSlider = buildSlider(bridge.getVolume('music'), 0, 1, 0.05, (v) => bridge.setVolume('music', v));
  musicRow.append(musicLabel, musicSlider);

  wrap.append(engineRow, musicRow);
  return wrap;
}

function renderDisplayTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  const settings = bridge.getCrtSettings();

  const scanRow = document.createElement('div');
  scanRow.append(
    Object.assign(document.createElement('span'), { textContent: 'Scanlines' }),
    buildToggle(settings.scanline, (v) => bridge.setCrtSettings({ scanline: v })),
  );

  const aberrationRow = document.createElement('div');
  aberrationRow.append(
    Object.assign(document.createElement('span'), { textContent: 'Screen Curvature' }),
    buildToggle(settings.aberration, (v) => bridge.setCrtSettings({ aberration: v })),
  );

  const bloomRow = document.createElement('div');
  bloomRow.append(
    Object.assign(document.createElement('span'), { textContent: 'Bloom' }),
    buildSlider(settings.bloom, 0, 1, 0.05, (v) => bridge.setCrtSettings({ bloom: v })),
  );

  wrap.append(scanRow, aberrationRow, bloomRow);
  return wrap;
}

function renderAccountTab(bridge: ShellBridge): HTMLElement {
  const wrap = document.createElement('div');
  const status = document.createElement('p');
  status.textContent = 'Checking account status…';
  void bridge.getIdentity().then((identity) => {
    status.textContent = identity.linked ? `Signed in as ${identity.displayName}` : 'Guest Driver (progress is local to this browser)';
  });

  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'rt-btn rt-btn-primary';
  linkBtn.textContent = 'Link Email';
  linkBtn.addEventListener('click', () => {
    const email = window.prompt('Email address:');
    if (!email) return;
    void bridge.linkEmail(email).then((result) => {
      status.textContent = result === 'ok' ? 'Check your email to confirm.' : `Link failed (${result}).`;
    });
  });

  const passBtn = document.createElement('button');
  passBtn.type = 'button';
  passBtn.className = 'rt-btn rt-btn-ghost';
  passBtn.textContent = 'Set Password';
  passBtn.addEventListener('click', () => {
    const password = window.prompt('New password:');
    if (!password) return;
    void bridge.setPassword(password).then((result) => {
      status.textContent = result === 'ok' ? 'Password set.' : `Failed (${result}).`;
    });
  });

  wrap.append(status, linkBtn, passBtn);
  return wrap;
}

function renderTab(tab: SettingsTab, bridge: ShellBridge): HTMLElement {
  if (tab === 'controls') return renderControlsTab(bridge);
  if (tab === 'audio') return renderAudioTab(bridge);
  if (tab === 'display') return renderDisplayTab(bridge);
  return renderAccountTab(bridge);
}

/** Settings overlay (spec §4): 4 tabs, opens on Display by default, closes
 * back to whichever screen opened it (ShellRouter.closeSettings). Rendered
 * as a modal — the caller (Task 11) composes this over whatever screen is
 * "underneath" per ShellRouter.settingsOpener. */
export function renderSettings(router: ShellRouter, bridge: ShellBridge): HTMLElement {
  const body = document.createElement('div');
  const tabBar = buildTabBar(TABS, router.settingsTab, (tab) => {
    router.setSettingsTab(tab);
    rerenderTabBody();
  });
  const tabBody = document.createElement('div');
  function rerenderTabBody(): void {
    tabBody.innerHTML = '';
    tabBody.appendChild(renderTab(router.settingsTab, bridge));
  }
  rerenderTabBody();
  body.append(tabBar, tabBody);

  const footer = document.createElement('div');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rt-btn rt-btn-primary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => router.closeSettings());
  footer.appendChild(closeBtn);

  return buildModal(body, footer, () => router.closeSettings());
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui-shell/screens/SettingsScreen.ts
git commit -m "feat(ui-shell): add Settings overlay with controls/audio/display/account tabs"
```

---

### Task 10: `SummaryScreen` (DOM) and `PauseOverlay`

**Files:**
- Create: `src/ui-shell/screens/SummaryScreen.ts`
- Create: `src/ui-shell/screens/PauseOverlay.ts`

**Interfaces:**
- Consumes: `PayoutLedger` from `economy/payout.ts`, `buildCard` (Task 6), `ShellRouter`.
- Produces:
  ```ts
  export function renderSummary(
    title: string, ledger: PayoutLedger, balance: number,
    onRaceAgain: () => void, onGarage: () => void, onHub: () => void,
  ): HTMLElement;
  export function renderPauseOverlay(onResume: () => void, onSettings: () => void, onQuit: () => void): HTMLElement;
  ```

- [ ] **Step 1: `screens/SummaryScreen.ts`**

```ts
import type { PayoutLedger } from '../../economy/payout.js';

/** Post-Race Summary (spec §4): replaces the canvas SummaryScreen. Pure
 * ledger renderer — payout.ts math is reused unchanged; this only formats it. */
export function renderSummary(
  title: string, ledger: PayoutLedger, balance: number,
  onRaceAgain: () => void, onGarage: () => void, onHub: () => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'rt-screen';

  const card = document.createElement('div');
  card.className = 'rt-card';
  const heading = document.createElement('h1');
  heading.textContent = title;
  card.appendChild(heading);

  for (const line of ledger.lines) {
    const row = document.createElement('div');
    row.textContent = `${line.label}: ${line.credits}c`;
    card.appendChild(row);
  }
  if (ledger.cleanMultiplier > 1) {
    const bonus = document.createElement('div');
    bonus.textContent = `clean race bonus: x${ledger.cleanMultiplier}`;
    card.appendChild(bonus);
  }
  const total = document.createElement('div');
  total.textContent = `Total: ${ledger.total}c (balance ${balance}c)`;
  card.appendChild(total);

  const actions = document.createElement('div');
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'rt-btn rt-btn-primary';
  again.textContent = 'Race Again';
  again.addEventListener('click', onRaceAgain);
  const garage = document.createElement('button');
  garage.type = 'button';
  garage.className = 'rt-btn rt-btn-ghost';
  garage.textContent = 'Upgrade in Garage';
  garage.addEventListener('click', onGarage);
  const hub = document.createElement('button');
  hub.type = 'button';
  hub.className = 'rt-btn rt-btn-ghost';
  hub.textContent = 'Return to Hub';
  hub.addEventListener('click', onHub);
  actions.append(again, garage, hub);
  card.appendChild(actions);

  root.appendChild(card);
  return root;
}
```

- [ ] **Step 2: `screens/PauseOverlay.ts`**

```ts
/** Minimal pause overlay (spec §3/§4): Resume / Settings / Quit only, not
 * the full navbar — pausing mid-race should not tempt a full menu detour. */
export function renderPauseOverlay(onResume: () => void, onSettings: () => void, onQuit: () => void): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'rt-pause-overlay';

  const card = document.createElement('div');
  card.className = 'rt-card';
  const title = document.createElement('h2');
  title.textContent = 'Paused';

  const resume = document.createElement('button');
  resume.type = 'button';
  resume.className = 'rt-btn rt-btn-primary';
  resume.textContent = 'Resume';
  resume.addEventListener('click', onResume);

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'rt-btn rt-btn-ghost';
  settings.textContent = 'Settings';
  settings.addEventListener('click', onSettings);

  const quit = document.createElement('button');
  quit.type = 'button';
  quit.className = 'rt-btn rt-btn-ghost';
  quit.textContent = 'Quit to Hub';
  quit.addEventListener('click', onQuit);

  card.append(title, resume, settings, quit);
  backdrop.appendChild(card);
  return backdrop;
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui-shell/screens/SummaryScreen.ts src/ui-shell/screens/PauseOverlay.ts
git commit -m "feat(ui-shell): add DOM Post-Race Summary and Pause overlay"
```

---

### Task 11: Mount point — `index.html` + `main.ts` wiring

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–10.
- Produces: the shell is live in the running game. `#ui-shell` div added to `index.html`
  above the `#stage` grid (sibling, not inside it — the shell needs full-viewport layout
  independent of the canvas letterbox). `main.ts` gains a `ShellRouter` + `ShellBridge`
  instance and a `renderShell()` function that swaps `#ui-shell`'s content based on
  `router.state`, called after every navigation.

- [ ] **Step 1: `index.html` — add the mount point**

Add `<div id="ui-shell"></div>` as a sibling of `<div id="stage">`, and a stylesheet link,
inside `<body>`:

```html
  <body>
    <div id="stage">
      <canvas id="game" width="480" height="270"></canvas>
      <canvas id="crt" width="480" height="270"></canvas>
    </div>
    <div id="ui-shell"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
```

Add the stylesheet import in `<head>`, after the existing `<style>` block:

```html
    <link rel="stylesheet" href="/src/ui-shell/shell.css" />
```

- [ ] **Step 2: `main.ts` — instantiate router/bridge and mount rendering**

Add imports near the top, alongside the other `ui/*`/`net/*` imports:

```ts
import { ShellRouter } from './ui-shell/ShellRouter.js';
import { ShellBridge } from './ui-shell/ShellBridge.js';
import { renderHub } from './ui-shell/screens/HubScreen.js';
import { renderGuide } from './ui-shell/screens/GuideScreen.js';
import { renderGarage as renderGarageShell } from './ui-shell/screens/GarageScreen.js';
import { renderSettings } from './ui-shell/screens/SettingsScreen.js';
import { renderSummary as renderSummaryShell } from './ui-shell/screens/SummaryScreen.js';
import { renderPauseOverlay } from './ui-shell/screens/PauseOverlay.js';
```

After the existing `const shop = new GarageScreen(...)` block and its `void loadGarage(save)...`
call (so `garage`/`save`/`rebuildVehicle` all already exist), add:

```ts
// --- Phase 11: DOM UI shell ---------------------------------------------
const shellEl = document.getElementById('ui-shell');
if (!(shellEl instanceof HTMLElement)) {
  throw new Error('main: #ui-shell not found');
}
const router = new ShellRouter();
const bridge = new ShellBridge({
  garage, input, sound, crt,
  onGarageChange: () => {
    void persistGarage(save, garage);
    rebuildVehicle();
  },
});

let pendingRaceStart = false; // set by the Hub's Race Route CTA, consumed in the loop below

function renderShell(): void {
  shellEl.innerHTML = '';
  shellEl.setAttribute('data-hidden', String(router.state === 'playing'));
  if (router.state === 'hub') {
    shellEl.appendChild(renderHub(router, bridge, () => { pendingRaceStart = true; renderShell(); }));
  } else if (router.state === 'guide') {
    shellEl.appendChild(renderGuide(router));
  } else if (router.state === 'garage') {
    shellEl.appendChild(renderGarageShell(router, bridge));
  } else if (router.state === 'settings') {
    // Settings renders as an overlay on top of whatever's underneath.
    const under = router.settingsOpener === 'garage' ? renderGarageShell(router, bridge)
      : router.settingsOpener === 'guide' ? renderGuide(router) : renderHub(router, bridge, () => {});
    shellEl.append(under, renderSettings(router, bridge));
  } else if (router.state === 'paused') {
    shellEl.appendChild(renderPauseOverlay(
      () => { router.resume(); renderShell(); },
      () => { router.openSettings(); renderShell(); },
      () => { router.quitToHub(); renderShell(); },
    ));
  }
  // 'playing': shellEl stays empty and hidden — the canvas owns the screen.
}
renderShell();

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && (router.state === 'playing' || router.state === 'paused')) {
    router.toggleEsc();
    renderShell();
  }
});
```

- [ ] **Step 3: Wire the race-finish path into the shell Summary screen**

In the `update`/finish-payout block (the existing `if (!payoutDone && (route.finished ||
route.expired)) { ... summary.show(...); ... }`), leave `summary.show(...)` (the canvas
version) as-is for now — do not delete it yet, Task 12 verifies the shell path end-to-end
before retiring it. Instead, immediately after the existing `summary.show(...)` call, add:

```ts
      router.startPlaying(); // ensure we're leaving `playing` deliberately, not mid-drive
```

Wait — that line is wrong placement; the run just finished while still `playing`, so instead
add nothing here yet. Task 12 replaces `summary.show(...)`'s canvas rendering with a router
transition once manual QA confirms the shell screens work; doing that swap in the same task
as first-mount risks debugging two new things at once.

- [ ] **Step 4: Verify the build compiles and the existing suite is green**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new type errors; all existing tests still pass (nothing in this task touches
tested logic, only DOM wiring `vitest`'s `node` environment never executes).

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat(ui-shell): mount ShellRouter/ShellBridge and render the DOM shell over the canvas"
```

---

### Task 12: Manual QA pass, retire canvas screens, final wiring

**Files:**
- Modify: `src/main.ts`

No new automated tests — this task is the spec's own required manual QA (§9): "No automated
visual testing — manual QA via `npm run dev` at the three breakpoints... plus a pass
confirming CRT/audio/account settings actually round-trip through their real backing
modules."

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` (background), open the printed local URL.

- [ ] **Step 2: Manual checklist — record actual results, don't assume**

- [ ] Hub renders on load; Race Route CTA starts a run and hides the shell (canvas visible).
- [ ] From the Hub: Garage card and nav both open the DOM Garage screen; a part purchase
      updates the credit balance shown on-screen and survives a reload (persisted via
      `persistGarage`).
- [ ] From the Hub: "Driver's Guide" nav opens the Guide screen; Dashboard nav returns to Hub.
- [ ] Settings opens on the Display tab from the Hub's Settings card; all 4 tabs are
      reachable; a Controls rebind actually changes what key drives the car in a subsequent
      run; an Audio slider audibly changes engine tone/collision cue volume; a Display
      toggle visibly changes the CRT effect (requires `KeyV`'s CRT to be enabled — see
      `crtDefaultEnabled`); Close returns to whichever screen opened Settings (test from
      Hub, Garage, and Guide separately).
- [ ] While driving: Esc pauses (canvas frozen, pause overlay shown); Resume continues;
      Quit to Hub returns to the Hub with the shell visible again.
- [ ] Resize the window to 1440, 834×1194, and 390×844 (devtools device toolbar) — confirm
      no horizontal scroll/overlap on Hub, Garage, and Settings; the Garage stat-diff panel
      collapses under ~760px per the `rt-garage-layout` media query in `shell.css`.
- [ ] Check the browser console for errors on every screen transition above.

- [ ] **Step 3: Fix whatever the checklist surfaces**

This step has no prescribed diff — fix exactly what Step 2 found. Common likely misses
given this plan's scope: z-index conflicts between `#ui-shell` and `#crt`/`#game` (both
Task 11's `shell.css` `z-index: 10` and `index.html`'s existing grid need checking against
each other), and the Settings-overlay-under-Garage re-render path in `renderShell()`
double-instantiating DOM event listeners on the "under" layer — if the Garage's buy buttons
double-fire after opening/closing Settings once, rebuild `renderShell()`'s settings branch
to reuse the already-rendered "under" tree rather than calling `renderGarageShell` again.

- [ ] **Step 4: Retire the canvas `GarageScreen`/`SummaryScreen`/`RemapScreen`/`AccountScreen`
  from `main.ts`'s render/input wiring**

Once Step 2's checklist is fully green, in `src/main.ts`:
- Remove the `F5`/`F6` key handlers that toggle `account.toggle()`/`shop.toggle()` (the DOM
  Settings account tab and Garage screen now own this) — replace `F6` with
  `router.goGarage()` and drop `F5` (Account is reachable via Settings > Driver Account).
- Remove `shop.render(backend)`/`account.render(backend)`/`remap.render(backend)`/
  `summary.render(backend)` calls from the `render` callback.
- Replace the `screenOpen` check's `remap.open || ... || account.open || shop.open` clause
  with `router.state !== 'playing'` (the shell now owns "is a menu open" — driving input
  should be zeroed whenever the shell is showing anything but the game).
- Replace `summary.show(...)` in the payout block with a call that stores the ledger and
  calls `router.startPlaying()` → actually **does not** apply, since summary should show
  instead of gameplay: call a new local `showSummary(ledger)` that sets `shellEl`'s content
  to `renderSummaryShell(...)` directly (bypassing `router.state`, since Summary isn't one
  of `ShellRouter`'s states per spec §3's table — it's reached only via the finish event,
  not navigation) and sets `shellEl.setAttribute('data-hidden', 'false')`.
- Delete the now-unused `RemapScreen`/`AccountScreen`/`GarageScreen` (canvas)/`SummaryScreen`
  (canvas) imports and instances (`remap`, `account`, `shop`, `summary`) — keep
  `loadBindings`/`GarageState`/`loadGarage`/`persistGarage`/`resolveMetrics`/`metricsToParams`
  which the shell still depends on through `bridge`/`rebuildVehicle`.
- Keep `LeaderboardScreen`/`TrackBrowserScreen`/`EditorScreen` and their `F3`/`F4`/`Tab` key
  handlers exactly as they are — explicitly out of scope per spec §2.

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 6: Re-run Step 2's manual checklist once more** against the now-simplified
  `main.ts`, since this step deleted real wiring.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "refactor(ui-shell): retire canvas Garage/Summary/Remap/Account screens in favour of the DOM shell"
```

---

## Gate for the phase slice

- [ ] `npm test` green, `npm run build` clean.
- [ ] Every screen in spec §4's inventory exists and is reachable per spec §5's nav flow.
- [ ] Hard rules 1–5 held: canvas/`RenderBackend`/`Renderer` untouched; `ui-shell` has zero
  runtime deps; `engine/`/`physics/`/`economy/` have no new imports from `ui-shell`.
- [ ] Manual QA checklist (Task 12, Step 2) fully checked off, re-run once after Step 4's
  wiring changes.

## Done-when

The DOM shell is the sole way to reach Garage, Settings, the Driver's Guide, and the
Post-Race Summary; every one of those screens can reach the Hub in one click; Esc pauses/
resumes gameplay through a minimal overlay; Controls/Audio/Display settings changes are
live against the real `InputManager`/`SoundEngine`/`CrtEffect` instances the game loop
already runs on.
