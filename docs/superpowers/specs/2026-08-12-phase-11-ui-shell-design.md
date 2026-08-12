# Phase 11 — UI Shell Design

> Spec for the menu/flow-polish slice of `plan.md`'s Phase 11 ("Web polish & release").
> Covers the new HTML/CSS overlay UI and the screens designed in Figma; does not cover
> the other Phase 11 items (PWA/offline shell, texture atlases, capped canvas resolution,
> WKWebView memory profiling, performance pass) — those remain separate work under the
> same phase number.

## 1. Why this exists

The game currently has no menu shell beyond individually canvas-drawn screens
(`GarageScreen`, `RemapScreen`, `AccountScreen`, `SummaryScreen`, `LeaderboardScreen`,
`TrackBrowserScreen`) — each hand-rasterized to the same 480×270 logical framebuffer as
gameplay, using a bitmap font. That's correct and non-negotiable for the *game* (hard rule
#1 in `CLAUDE.md`), but it caps what the surrounding menus/marketing shell can look like:
no real typography, no smooth animation, no responsive layout — all things needed for a
"snappy, conversion-driving" web presence and for a good touch experience once Capacitor
wraps this for iOS (Phase 12).

Design work happened in Figma against the existing `Retroline-Turbo` file
(`https://www.figma.com/design/oURI7m56fOQQGbpjfAc4Ub/Retroline-Turbo`), which already had
a "Midnight Synth" design system (`docs/figma_design_system_prompt.md`) and five screens
(home dashboard, gameplay mockup, settings modal, driver's guide, post-race summary) from
an earlier one-shot pass. Two things were missing and got filled in during this round: a
real Garage & Marketplace screen (previously just a dashboard preview card), and settings
content that actually matches what the game code supports. Reference assets for
implementation:

- `docs/design/retroline-figma-import.html` — exact source for the Garage/Marketplace
  screen and all 4 Settings tab states (built by hand, then imported into Figma — this file
  *is* the spec for those five, more precise than any screenshot).
- `docs/design/{home-bento-hub,gameplay-view,settings-modal,drivers-guide,post-race-summary}.png`
  — reference for the five original, Figma-AI-generated screens.
- `docs/figma_design_system_prompt.md` — token/typography/component source of truth.

## 2. Scope

**In scope:** a new DOM-based UI shell; the Dashboard/Hub, Settings (4 tabs), Garage &
Marketplace, Driver's Guide, and Post-Race Summary screens; a pause overlay; navigation
between all of the above; replacing the canvas-drawn screens they supersede.

**Out of scope (explicitly deferred):**
- Track Editor and full Leaderboard screens — only dashboard preview cards were designed,
  no full-screen layout exists yet.
- Garage's Transmission/Suspension/Wheels tabs as *design* work — the Engine tab's layout
  is data-driven and reused as-is for the other three; this is an implementation detail,
  not a missing screen.
- Everything else `plan.md` bundles into Phase 11 (PWA shell, texture atlases, capped
  canvas resolution, WKWebView memory pass, profiling).
- Phase 12 (Capacitor/iOS) itself — this spec sets up responsive layout that Phase 12 will
  depend on, but doesn't implement the native shell.

## 3. Architecture

**New module: `src/ui-shell/`.** Plain TypeScript, DOM-based, zero external runtime
dependencies — consistent with hard rule #5 (`CLAUDE.md`) and with how every existing UI
class (`GarageScreen`, `RemapScreen`, ...) is already hand-rolled rather than
framework-based. The dependency direction is one-way: `ui-shell` imports game modules
(`GarageState`, `InputManager`, `SoundEngine`, `CrtEffect`, `net/account.ts`, `ScoreState`);
nothing in `engine/`, `physics/`, or `economy/` imports from `ui-shell`.

```
src/ui-shell/
  ShellRouter.ts       — state machine + history (hub/guide/garage/settings/playing/paused)
  ShellBridge.ts        — thin facade over real game modules (see §6)
  screens/
    HubScreen.ts
    GuideScreen.ts
    GarageScreen.ts      (new DOM version — canvas GarageScreen.ts is retired)
    SettingsScreen.ts     — 4 tabs: controls / audio / display / account
    SummaryScreen.ts      (new DOM version — canvas SummaryScreen.ts is retired)
    PauseOverlay.ts
  components/            — shared DOM component helpers: card, tab-bar, toggle, slider, modal
  tokens.css              — Midnight Synth custom properties (see §5)
  shell.css
```

`index.html` gains `<div id="ui-shell"></div>` mounted as a sibling to (above, z-index-wise)
the game `<canvas>`. The canvas, `RenderBackend`, `Canvas2DBackend`, and `Renderer` are
**untouched** — this is additive. `HUD.ts` and `RouteMap.ts` stay canvas-rendered; they're
part of the immersive driving view, not the shell.

**Router states:** `hub`, `guide`, `garage`, `settings` (rendered as an overlay on top of
whichever state opened it — `hub`, `garage`, or `guide` — never its own base state),
`playing` (shell hidden, `#ui-shell` display:none, canvas fullscreen), `paused` (small
overlay on top of the frozen canvas — Resume / Settings / Quit to Hub only, not the full
navbar). Esc toggles `playing` ↔ `paused`. Every non-`playing`/`paused` screen keeps the
shared navbar (Dashboard/Gameplay/Garage/Guide/Retro FX) so there's always a one-click path
back to the hub — confirmed present on all 5 original frames plus all 5 new ones.

## 4. Screen inventory

| Shell screen | Backing code | Status |
|---|---|---|
| Dashboard/Hub | — | **net new**; hero "Race Route" CTA, Garage/Active Vehicle preview card, Leaderboard preview card, 3 subcards (Track Editor/BETA — links out to nothing yet, Settings & Retro FX, How to Play) |
| Settings — Controls tab | `RemapScreen`, `InputManager` (8 actions: throttle/brake/steerLeft/steerRight/handbrake/gearUp/gearDown/nitro) | **replaces** `RemapScreen` |
| Settings — Audio Controls tab | `SoundEngine` gain nodes | **replaces** the audio portion of settings; needs the real bus names verified against `SoundEngine.buildGraph()` before final copy — currently split into "Engine & SFX" and "Soundtrack" as a design assumption |
| Settings — Display & Retro FX tab | `CrtEffect` (scanline/distortion/bloom uniforms), `crtDefaultEnabled()` | **replaces** the display portion; adds a Bloom slider the shader already supports but no UI previously exposed |
| Settings — Driver Account tab | `AccountScreen`, `net/account.ts` (linkEmail/setPassword/isAccountLinked) | **replaces** `AccountScreen` |
| Garage & Marketplace | `GarageScreen`, `GarageState`, `parts.json`, `Garage.ts` | **replaces** canvas `GarageScreen` rendering; `GarageState`/`Garage.ts` logic (buy/equip/partState/baseline+mod resolution) reused unchanged |
| Driver's Guide | — | **net new**; driving mechanics + route pyramid explainer, static content |
| Post-Race Summary | `SummaryScreen`, `economy/payout.ts` | **replaces** canvas `SummaryScreen`; `payout.ts` math reused unchanged |
| Pause overlay | — | **net new**, minimal (Resume/Settings/Quit) |

## 5. Navigation flow

```
Hub ──RACE ROUTE──────────────────────────────▶ playing (fullscreen canvas)
Hub ──Garage card / nav "GARAGE"───────────────▶ Garage & Marketplace
Hub ──How to Play card / nav "GUIDE"───────────▶ Driver's Guide
Hub ──Settings card / nav "RETRO FX" / profile─▶ Settings (overlay, opens on Display tab)
Garage, Guide, Settings ──nav "DASHBOARD"──────▶ Hub   (always available — back-to-hub guarantee)
Settings tabs ──click another tab─────────────▶ swap within the same overlay, no navigation
Settings ──close / Discard / Save─────────────▶ close overlay, return to whatever opened it
playing ──Esc──────────────────────────────────▶ paused (Resume / Settings / Quit to Hub)
paused ──Resume────────────────────────────────▶ playing
paused ──Quit to Hub────────────────────────────▶ Hub
Race finishes ─────────────────────────────────▶ Post-Race Summary
Summary ──RACE AGAIN───────────────────────────▶ playing
Summary ──UPGRADE IN GARAGE────────────────────▶ Garage & Marketplace
Summary ──RETURN TO HUB────────────────────────▶ Hub
```

Every screen reachable from the Hub can reach it again in exactly one click — this was the
explicit "know where it goes back to home hub" requirement, and it holds structurally
because every non-gameplay screen shares the same navbar component.

## 6. Data bridge

`ShellBridge` is a thin facade so `ui-shell` code never touches game module internals
directly and stays unit-testable independent of the DOM:

```ts
interface ShellBridge {
  // economy / garage
  getCredits(): number;
  getCatalog(category: PartCategory): Part[];
  getPartState(part: Part): PartState;
  buyAndEquip(part: Part): boolean;
  getStatDiff(part: Part): { speed: number; accel: number; handling: number; grip: number };

  // controls
  getBindings(): Bindings;
  rebind(action: Action, code: string): void;

  // audio
  getVolume(bus: 'engine' | 'music'): number;
  setVolume(bus: 'engine' | 'music', value: number): void;

  // display
  getCrtSettings(): { scanline: boolean; aberration: boolean; bloom: number };
  setCrtSettings(next: Partial<CrtSettings>): void;

  // account
  getIdentity(): { displayName: string; linked: boolean };
  linkEmail(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
}
```

Each method is a one-line pass-through to the corresponding real module
(`GarageState`, `InputManager`, `SoundEngine`, `CrtEffect`, `net/account.ts`). This is
the seam Vitest targets — the bridge's logic, not DOM rendering, gets unit coverage,
matching how physics/economy are already tested.

## 7. Visual system

Single dark theme — this is a deliberate, committed aesthetic (arcade/synthwave), not a
light/dark-mode toggle. Tokens as CSS custom properties in `tokens.css`, sourced from
`docs/figma_design_system_prompt.md`'s "Midnight Synth" system:

- Background: `#0B0C10` → `#1A1A2E` gradient
- Surface (glass cards): `#1F2833` @ 60% opacity, 16px backdrop-blur, `rgba(255,255,255,0.1)` border
- Accents: Cyber Cyan `#00FFFF` (primary/interactive), Trophy Gold `#FFD700` (equipped/featured — semantic, not general-purpose), Synth Magenta `#FF00FF` (section labels/badges), Arcade Red `#FF3333` (errors/locked/insufficient-funds)
- Text: `#F2F4F8` primary, `#9AA3B2` muted, `#5C6472` dim, `rgba(255,255,255,~0.65)` nav-inactive
- Type: Space Grotesk/Outfit (headers, nav, buttons, uppercase labels), Inter (body copy) — **self-hosted** (not a Google Fonts `<link>`), so the Phase 12 WKWebView shell doesn't depend on network access
- Buttons: 8px radius; primary = solid cyan bg, deep-slate text, glow + 2px lift on hover
- Shared components: card (glass), tab-bar (active = cyan underline/fill), toggle (pill + knob), slider (track + gradient fill + thumb), modal (centered, glass, close/discard/save footer)

## 8. Responsive requirements

Build every screen with real CSS flex/grid (not fixed 1440px absolute positioning) and
verify at minimum: desktop (1440), iPad portrait (834×1194), iPhone (390×844). Settings and
Garage & Marketplace are the highest-priority responsive targets — most interactive, most
likely to be touched first once Capacitor wraps this for iOS. The Garage's stat-diff panel
collapses to a bottom sheet under ~760px rather than a fixed side panel.

## 9. Testing & validation

- Vitest: `ShellBridge` methods (pure pass-through logic, easy to test against
  `GarageState`/`InputManager`/etc. directly), `ShellRouter` state transitions (every screen
  can reach `hub`; `playing`↔`paused` toggles correctly; `settings` always returns to its
  opener).
- No automated visual testing — manual QA via `npm run dev` at the three breakpoints above,
  plus a pass confirming CRT/audio/account settings actually round-trip through their real
  backing modules (not just visually toggle).
- `npm run build` must stay green (`tsc --noEmit` + Vite build) throughout.

## 10. Open risks / follow-ups

- Audio bus split (Engine & SFX vs. Music) is a design assumption — confirm against
  `SoundEngine.buildGraph()`'s actual gain node structure before finalizing the Audio tab's
  copy/behavior.
- Self-hosted Space Grotesk/Outfit/Inter font files need to be sourced and license-checked
  (all are open-source/SIL OFL, but confirm before vendoring).
- The `overlayPositionType`/`overlayBackground` Figma prototype settings on the 4 Settings
  frames were never manually configured (blocked by the Figma MCP rate limit) — doesn't
  block implementation since this spec's overlay behavior is defined independently in §3/§5,
  but the Figma file's own prototype preview won't demonstrate it correctly until someone
  sets that manually in Figma's UI.
