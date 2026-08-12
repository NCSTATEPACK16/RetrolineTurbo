# Master Figma & UI Design Prompt: Retroline Turbo

> **Document:** `docs/figma_design_system_prompt.md`  
> **Purpose:** Master prompt for Figma AI, Relume, Claude, ChatGPT, or UI designers to generate a complete, high-polish modern-retro UI/UX design system for *Retroline Turbo*.  
> **Design Philosophy (Senior UX/UI):** The "Web Shell" must be a sleek, premium, highly accessible modern web application (React/Netlify standard). It acts as a high-end display case for the "Game Canvas", which retains the raw 1983 Tatsumi *TX-1* arcade aesthetic. We use modern web layout patterns (Bento grids, glassmorphism, geometric typography) accented by retro neon colors, rather than forcing the entire website to look like an 8-bit screen.

---

## Copy-Pasteable Master Figma AI / Designer Prompt

```text
Design a complete, high-fidelity UI/UX design system and desktop/mobile web app screen suite for "Retroline Turbo", a modern retro pseudo-3D arcade racing game hosted on Netlify.

DESIGN PHILOSOPHY: "The Premium Arcade Cabinet". The surrounding web application (the "Shell") must feel like a sleek, modern, premium e-sports hub or high-end indie game site. It should use modern web layout patterns (Bento Grids, Glassmorphism, accessible contrast). The actual game canvas inside it will look like a 1983 arcade game, but the menus, settings, and website structure must be polished, responsive, and native to the modern web.

---

### GLOBAL DESIGN SYSTEM & TOKENS

1. COLOR PALETTE (The "Midnight Synth" Theme):
   - Global Background: Midnight Slate (#0B0C10) to Deep Indigo (#1A1A2E) gradient. (Do not use harsh pure black or bright blue for the web background).
   - Primary Accent (Buttons/Links): Cyber Cyan (#00FFFF) with a subtle outer glow.
   - Secondary Accent (Warnings/Alerts): Arcade Red (#FF3333).
   - Tertiary Accent (Badges/Scores): Trophy Gold (#FFD700) and Synth Magenta (#FF00FF).
   - UI Surfaces (Cards/Modals): Elevated Glassmorphism. Dark slate (#1F2833) with 60% opacity, 16px background blur, and a 1px solid border of rgba(255, 255, 255, 0.1).

2. TYPOGRAPHY HIERARCHY (Strict Separation):
   - Brand/Game Canvas ONLY: Heavy retro pixel font ("Press Start 2P" or "VT323") - strictly reserved for the main game logo and the in-game HUD.
   - Web UI/Headers: "Space Grotesk" or "Outfit" (Bold/Black) - For modern, tech-forward section headers, modal titles, and primary buttons.
   - Body/Paragraphs: "Inter" or "Roboto" (Regular/Medium, 16px base) - For maximum legibility in settings, how-to guides, and leaderboards.

3. COMPONENT ARCHITECTURE:
   - Buttons: Modern rounded rectangles (8px radius). Primary buttons have a solid Cyber Cyan background with deep slate text. Hover state: slight Y-axis lift (-2px) and increased box-shadow glow.
   - Cards: Bento-box style grid layouts. Cards have glassmorphic surfaces, subtle hover scaling (1.02x), and cyan accent borders on hover.

---

### REQUIRED SCREENS & LAYOUTS

#### SCREEN 1: HOME PAGE / MAIN MENU ("The Bento Hub")
- Global Header (Navbar): Sleek transparent navbar. Left: "Retroline Turbo" logo. Right: Sound toggle icon, User Profile Avatar/Login button (Supabase auth).
- Hero Section (Bento Grid Layout):
  - Main Card (Spans 2 columns, 2 rows): The "PLAY NOW" hero card. Features a high-quality 3D render or crisp pixel art of the red F1 car. A large, pulsing Cyber Cyan primary button: "RACE ROUTE".
  - Side Card Top: "GARAGE / UPGRADES" - Displays a silhouette of the current car and a progress bar.
  - Side Card Bottom: "LEADERBOARDS" - A quick preview of the top 3 global times.
  - Bottom Row Cards: "TRACK EDITOR", "SETTINGS", "HOW TO PLAY".
- Footer: Minimalist modern footer with version number, copyright, and GitHub/social links.

#### SCREEN 2: THE GAMEPLAY VIEW (The Canvas Wrapper)
- Layout: Full-width dark immersive mode. The web shell fades to near-black (#050508).
- The Game Canvas Container: A perfectly centered 16:9 box holding the game. It should have a subtle CRT-style bezel effect or a thin glowing cyan border to separate it from the web page.
- In-Game HUD (Inside the Canvas): 
  - Top Arcade Header Banner: Solid #000088 background.
  - Top-Left: "MAP" - Live 5-stage Branching Tree Diagram.
  - Readouts (Pixel Font): "YOUR SCORE" (Magenta label) + Cyan score. "STAGE" (Blue label). "TIME" (Red digits, blinks). "SPEED" (Cyan). "PASSED CARS" (Gold stars).

#### SCREEN 3: SETTINGS MODAL (Modern Tabbed Interface)
- Structure: A centered glassmorphic modal overlaying the blurred home page.
- Top Tabs: [ Controls ] [ Audio Controls ] [ Display & Retro FX ] [ Driver Account ]
- Controls Tab — a rebind list for exactly these 8 actions (matches `InputManager.ts`):
  Throttle, Brake, Steer Left, Steer Right, Handbrake, Gear Up, Gear Down, Nitro. Each
  row shows the action name, its current key(s) as keycap chips (defaults: WASD + full
  arrow-key mirror, Space = handbrake), and a "Rebind" action that enters a "press a
  key" capture state. Below the list: a Mouse Steering toggle with sensitivity and
  deadzone sliders, and a read-only Gamepad connection indicator — the game supports
  all three input paths simultaneously.
- Audio Controls Tab — two independent sliders, each with its own mute toggle: "Engine
  & SFX" (procedural engine tone, tire squeal, collision cues) and "Soundtrack (FM
  Synth)". Verify exact bus names against `SoundEngine.buildGraph()` before finalizing
  copy — do not collapse this back into a single slider.
- Display & Retro FX Tab (Interactive Toggles + a slider) — toggles for "CRT Scanline
  emulation" and "Chromatic aberration"; a **slider** (not a toggle) for "Bloom / Glow
  intensity" since `CrtEffect`'s fragment shader exposes a real bloom uniform. Do not
  include a "Pixelated Upscaling" toggle — nearest-neighbor upscale is a fixed, always-
  on part of the render pipeline (`Canvas2DBackend`), not a user-facing setting. Note
  in the design that CRT effects default OFF under a mobile-width viewport
  (`crtDefaultEnabled`) — reflect that as the default toggle state on narrow frames.
- Driver Account Tab — anonymous pilot identity (avatar + generated name, e.g.
  "PILOT_83") with a "Anonymous Session" tag; a display-name field (feeds the
  leaderboard name shown elsewhere); two account-linking actions, "Link Email" and
  "Set Password" (upgrades the anonymous save without losing progress, per
  `net/account.ts`); a "Sign Out" action available once linked.

#### SCREEN 4: HOW TO PLAY / DRIVER'S GUIDE
- Layout: A clean, scrollable article format or a multi-step carousel (like a modern SaaS onboarding flow).
- Content Blocks:
  - "The Mechanics": Use clean vector diagrams alongside the text to explain Throttle, Brake, and the 2-Speed Gearbox.
  - "The Pyramid": A beautiful, modern infographic representation of the 5-Stage Route Tree showing the forks and 5 endings, styled with the geometric UI font, not pixel fonts.

#### SCREEN 5: POST-RACE SUMMARY (The Reward Screen)
- Animation Intro: A glassmorphic card slides up from the bottom.
- Header: "ROUTE COMPLETE" (Space Grotesk, Gold gradient text).
- Ledger Table: Clean, right-aligned monetary values.
  - Placement: 1,000c
  - Fastest Lap: +500c
  - Clean Race: 1.1x Multiplier
  - Total: 1,650c (Emphasized with a glowing border).
- Action Row: Primary button "RACE AGAIN". Secondary buttons "GARAGE" and "MAIN MENU".
  The "GARAGE" button routes to Screen 6 below — it did not previously have a
  destination.

#### SCREEN 6: GARAGE & MARKETPLACE (One Merged Screen — the real gap)
This was previously only a small preview card on the Dashboard with no real
destination. `GarageState`/`GarageScreen` in code already merge "browse the parts
catalog," "buy," and "equip" into one flow across 80 parts (4 categories × 20 tiers:
Engine, Transmission, Suspension, Wheels/Tires) — design ONE screen, not a separate
Garage + a separate Marketplace.
- Add "GARAGE" as a primary top-nav item (between GAMEPLAY and GUIDE) — this is now a
  full destination, not just a dashboard card.
- Header band: current credits balance rendered large and prominent (Trophy Gold,
  tabular numerals) next to the active vehicle name/archetype.
- Vehicle preview: reuse the Dashboard Garage card's preview treatment, scaled up as
  the hero element.
- Category selector: 4 segments (Engine / Transmission / Suspension / Wheels & Tires)
  using the same tab visual language as the Settings modal's tab bar.
- Part list: rows ordered by tier — name, tier, cost, and a state badge using exactly
  these five states (the real states `GarageState.partState()` tracks): **Locked**
  (show "Unlocks at Stage N," not just disabled), **Need Credits** (show the exact
  shortfall, e.g. "Need 4,320c more"), **Buy** ("Buy & Equip"), **Owned** ("Equip"),
  **Fitted** (visually distinct — gold accent, not the generic cyan action color,
  since it signals "your active choice" rather than "you can do this").
- Stat-diff panel: four horizontal bars — Top Speed, Acceleration, Handling, Grip —
  comparing the hovered/selected part against whatever's currently equipped in that
  category, red (worse) / cyan (better) deltas off a shared baseline. This is the
  signature mechanic (`GarageScreen.renderDiff`) and should be a hero UI moment, not
  an afterthought. On narrow widths, collapse this into a bottom sheet that opens on
  part selection.
- Primary action: one contextual button whose label tracks state (Buy & Equip / Equip
  / Need Xc more / Unlocks at Stage N).
- Tie the credits display and ledger styling back to Screen 5's reward ledger so
  credits visually flow from "just earned" to "about to spend."
```

---

## How to Use This Prompt

1. **Figma AI / Relume / v0 by Vercel**: Paste the text block directly into the AI prompt window. The use of terms like "Bento Grid", "Glassmorphism", "Navbar", and "Hero Section" will trigger the AI to use modern, responsive web components rather than generating an unusable, flat image of an arcade cabinet.
2. **Human UI Designer**: Send this spec to a UI/UX designer. It clarifies the boundary between the *game* (which is retro) and the *website* (which is modern and accessible).
3. **Figma import (Screens 3 & 6 specifically)**: most Figma AI chat inputs cap around 2,000 characters, too short for the Screen 3/6 detail above. `docs/design/retroline-figma-import.html` is a real, styled HTML mockup of all 4 Settings tabs plus the new Garage & Marketplace screen, built to the tokens/fonts/components in this doc — import it directly with an HTML-to-Figma plugin (e.g. `html.to.design`) instead of pasting text.

## Existing Figma file

Live file: `https://www.figma.com/design/oURI7m56fOQQGbpjfAc4Ub/Retroline-Turbo` — a first pass from this prompt already exists (home hub, gameplay mockup, settings modal, driver's guide, post-race summary). It's missing Screen 6 (Garage & Marketplace) and the Settings tab corrections above; `retroline-figma-import.html` fills both gaps in the same visual language rather than introducing a new one.
