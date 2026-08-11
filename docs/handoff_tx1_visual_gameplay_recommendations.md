# Handoff: TX-1 Arcade Visuals & Gameplay Recommendations for Retroline Turbo

> **Handoff Document** for session continuation  
> **Reference File:** `/Users/johnbradner/Pictures/Photos Library.photoslibrary/resources/derivatives/D/D8A79879-2492-4993-8628-BBF8C5BFE996_1_105_c.jpeg`  
> **Game Target:** Tatsumi *TX-1* (1983) Arcade Triple-Screen Pseudo-3D Racing Game  
> **Plan Insertion:** Assigned as **Phase 7.5 — TX-1 Arcade Visuals, HUD & Overtake Juice** in `plan.md`  
> **Prompt Guides:** [docs/gemini_asset_prompts_guide.md](file:///Users/johnbradner/Documents/ClaudeWork/RetrolineTurbo/docs/gemini_asset_prompts_guide.md) \| [docs/figma_design_system_prompt.md](file:///Users/johnbradner/Documents/ClaudeWork/RetrolineTurbo/docs/figma_design_system_prompt.md)  
> **Date:** August 6, 2026  

---

## 1. Executive Summary & Reference Analysis

An analysis of the reference screenshot of Tatsumi's **TX-1** (1983) arcade cabinet screen highlights the key visual and mechanical elements that make the game feel iconic.

![TX-1 Reference Photo](file:///Users/johnbradner/Pictures/Photos%20Library.photoslibrary/resources/derivatives/D/D8A79879-2492-4993-8628-BBF8C5BFE996_1_105_c.jpeg)

### Key Visual & Gameplay Characteristics of TX-1:
1. **Full-Width Top Arcade HUD Bar**:
   - **Solid Deep Blue Header Banner**: Spans the entire top width of the screen (`#0000AA`).
   - **Interactive Route Map (Top Left)**: A live branching tree diagram showing routes `A..H` across 5 stages, highlighting current stage and node position.
   - **Score Counter**: Magenta `"YOUR SCORE"` label + 5-digit cyan/white score (`74290`).
   - **Stage Indicator**: Blue `"STAGE"` label + white ordinal text (`2ND`).
   - **Countdown Timer**: Blue `"TIME"` label + prominent red digits (`10`).
   - **Speedometer**: Blue `"SPEED"` label + cyan speed text (`280km/h`).
   - **Passed Cars Counter**: Magenta `"PASSED CARS"` label + row of gold star icons (`★★★★★★★★★★★★★★★★`) representing overtaken traffic cars.
2. **Open-Wheel Formula 1 Racing Cars**:
   - Player and opponent cars are **F1-style open-wheel racers** with wide rear tires, exposed rubber treads, red aerodynamic bodywork, central cockpit/driver helmet, and rear spoiler wings.
3. **Horizon City Nightscape & Parallax Backdrop**:
   - Horizon skyline featuring detailed pixel silhouettes of skyscrapers, illuminated yellow/red window pixels, and radio towers set against a dark blue evening sky.
4. **Highway Props & Road Details**:
   - Street lights / lamp posts lining the roadside extending into the horizon.
   - High-contrast **red-and-white striped kerbs / rumble strips** (`#D02020` & `#FFFFFF`).
   - Wide multi-lane asphalt surface with white dashed lane markers.

---

## 2. Codebase Audit vs. Reference Vision

| Feature Area | Current State (`RetrolineTurbo`) | TX-1 Reference Target | Priority |
|---|---|---|---|
| **HUD Header** | Minimal text overlaid directly on track; small white font; monochrome curve mini-map (`src/ui/HUD.ts`). | Solid blue header box spanning full width; stylized colored labels; live branching route map at top-left; large red time countdown. | **P1 (High)** |
| **Passed Cars Star Gauge** | Not implemented. | Row of gold stars (`★★★★★★★★★★`) tracking traffic overtakes with bonus points. | **P1 (High)** |
| **Car Sprites** | Generic rectangular box cars (`car0`..`car3`, `player` in `spriteManifest.ts`). | F1 open-wheel race cars with wide rear tires, wing spoilers, and color liveries (red, purple, blue, green). | **P2 (High)** |
| **Background / Skyline** | Flat solid color bands (`COLORS.sky`, `COLORS.groundDark`, `COLORS.groundLight` in `Background.ts`). | Detailed pixel-art city nightscape skyline with lit windows, radio towers, and stage-specific scenery (coast, desert, city). | **P2 (Medium)** |
| **Road & Side Props** | Basic gray road; red/white rumble strips present; no roadside lamp posts or warning signs. | Crisp high-contrast red/white kerbs, streetlights lining the track, warning billboards at forks, split median markers. | **P3 (Medium)** |
| **Audio & Juice** | Audio engine stubbed (Phase 10 scheduled). | Procedural F1 engine synth (Web Audio oscillator pitch shift by speed/gear), overtake chime, tire screech, checkpoint extend sound. | **P3 (Medium)** |

---

## 3. Concrete Recommendations & Action Plan

### Recommendation 1: Redesign `HUD.ts` to Match TX-1's Top Banner
- **Header Box**: Draw a solid rectangular banner (`height: 24px`, background: `#000088` / `#0a0a66`, bottom border: `#3333ff`) across the top of `LOGICAL_WIDTH` (480px).
- **Route Map (Top-Left)**: Re-render the 5-stage branching tree diagram inside a 60x18px box on the top-left of the HUD bar:
  - White node circles for stages 1 to 5 (`A,B`, `C,D`, `E,F`, `G,H`).
  - Yellow connecting lines.
  - Flashing bright red/cyan marker for current active node.
- **Color-Coded Text**:
  - `YOUR SCORE` (Magenta `#ff44cc` label, Cyan `#00ffff` score digits).
  - `STAGE` (Blue `#4488ff` label, White `#ffffff` text e.g., `1ST`, `2ND`, `3RD`).
  - `TIME` (Blue `#4488ff` label, Red `#ff3333` countdown; blinks red/yellow when `< 10s`).
  - `SPEED` (Blue `#4488ff` label, Cyan `#00ffff` `280km/h`).
- **PASSED CARS Star Counter**:
  - Track `player.passedCars` count.
  - Render a row of gold star glyphs (`★` `#ffcc00`) in the top-right section of the header.

### Recommendation 2: F1 Open-Wheel Car Sprites (`spriteManifest.ts`)
Update `SPRITE_MANIFEST` entries for `player` and `car0`..`car3`:
- **Player F1 Car**:
  - Chassis: Bright red (`#e02020`) with white accent stripes.
  - Rear tires: Exposed black rubber (`#18181c`) with dark gray tread highlights, 1.5× wider stance.
  - Rear Wing: Elevated rear spoiler (`#c01010`).
  - Cockpit: Dark opening with blue/yellow driver helmet pixel.
- **Opponent F1 Cars**:
  - `car0`: Purple F1 racer (`#8020a0`).
  - `car1`: Blue F1 racer (`#2060d0`).
  - `car2`: Green F1 racer (`#209040`).
  - `car3`: Yellow/Gold F1 racer (`#d09010`).
- **Skid & Steering Frames**: Add steering tilt frames (`player_left`, `player_right`) when turning sharply or counter-steering during a skid.

### Recommendation 3: Horizon City Nightscape Parallax (`Background.ts`)
Enhance `Background.ts` to support multi-layer visual scenery:
1. **Sky Layer**: Dark night sky blue gradient (`#050520` to `#101040`).
2. **City Horizon Layer**:
   - Silhouette of city skyline (skyscrapers, radio towers, suspension bridges).
   - Pixelated glowing windows in warm yellow (`#ffcc44`), orange, and cyan.
   - Horizontal parallax pan driven by camera pan and curve offset (`layerOffset`).
3. **Stage Theme Swapping**:
   - Stage 1: Night City Skyline (TX-1 default).
   - Stage 2: Coastal Palms & Ocean Horizon.
   - Stage 3: Desert Canyons & Sunset Sky.
   - Stage 4: Industrial Highway & Night Lights.
   - Stage 5: Neon Metropolis.

### Recommendation 4: Roadside Props & Kerb Visual Polish
- **Streetlight / Lamp Post Sprites**:
  - Add a `lamp_post` sprite entry (tall thin silver post with angled light head emitting a small yellow glow cone).
  - Place `lamp_post` sprites along track segments at regular intervals (`offset: -1.2` and `+1.2`).
- **Rumble Strips (Kerbs)**:
  - Update `COLORS.rumbleDark` to vibrant Red (`#d02020`) and `COLORS.rumbleLight` to Pure White (`#f0f0f0`).
- **Branch Split Median**:
  - Render dark gray asphalt median wedge with hazard stripes (`#d0a010` / `#101010`) at fork points.

### Recommendation 5: Overtake Mechanics & Score System
- **Traffic Overtake Detection**:
  - In `Traffic.ts` / `main.ts`, track when `car.z` falls behind `vehicle.z`.
  - Increment `passedCars` count and add +100 points per overtake to `score`.
  - Award a star in the HUD's `"PASSED CARS"` gauge.
- **Arcade Sound & Juice** (for Phase 10 integration):
  - High-pitched 2-stroke F1 engine audio synth.
  - Overtake chime sound when passing traffic.
  - Tire squeal noise on curves over skid threshold (`SKID_CURVE_THRESHOLD`).

---

## 4. Step-by-Step Handoff Guide for Next Session

### Step 1: Update Constants & Colors (`src/constants.ts`)
```ts
export const COLORS = {
  sky: '#0a0a24',
  skyBand: '#141440',
  groundLight: '#1b5e28',
  groundDark: '#12481d',
  road: '#484852',
  roadDark: '#3e3e46',
  rumbleLight: '#f0f0f0', // Crisp white kerbs (TX-1)
  rumbleDark: '#d02020',  // Vibrant red kerbs (TX-1)
  lane: '#e8e8f0',
  hudBg: '#080866',       // TX-1 deep blue header bar
  hudLabel: '#4488ff',
  hudScoreLabel: '#ff44cc',
  hudValueCyan: '#00ffff',
  hudValueRed: '#ff3333',
  hudStarGold: '#ffcc00',
} as const;
```

### Step 2: Implement TX-1 Header HUD in `src/ui/HUD.ts`
- Replace raw string layout with structured TX-1 layout.
- Draw top blue banner using `backend.drawQuad(0, 0, LOGICAL_WIDTH, 0, 24, LOGICAL_WIDTH, COLORS.hudBg)`.
- Position MAP box on left (0..70px), YOUR SCORE (75..170px), STAGE (175..230px), TIME (235..300px), SPEED (305..370px), PASSED CARS stars (375..475px).

### Step 3: Upgrade Car & Streetlight Sprites in `src/assets/spriteManifest.ts`
- Replace blocky `player` and `car0`..`car3` draw operations with open-wheel F1 designs (wide tires, rear wing, body cockpit).
- Add `lamp_post` sprite definition:
```ts
billboard('lamp_post', 10, 36, [
  { rx: 4, ry: 6, rw: 2, rh: 30, color: '#8a8a92' },   // silver pole
  { rx: 2, ry: 2, rw: 6, rh: 4, color: '#aaabb0' },    // light fixture
  { rx: 3, ry: 6, rw: 4, rh: 4, color: '#ffffaa' },    // light glow
])
```

### Step 4: Add City Skyline to `src/engine/Background.ts`
- Implement procedural silhouette skyscraper rendering or a pixel skyline band in `Background.render()`.
- Add window light dots using camera pan offset.

### Step 5: Verification & Vitest
- Run `npm test` to ensure all 194+ unit tests remain green.
- Run `npm run build` to confirm zero TypeScript compilation errors.
- Launch `npm run dev` to visually inspect the TX-1 arcade aesthetic at `http://localhost:5173`.

---

## 5. File Modification Checklist

- [ ] `src/constants.ts` — Add TX-1 color palette tokens.
- [ ] `src/ui/HUD.ts` — Build solid top blue header, color text, passed cars star gauge, and top-left mini branch tree.
- [ ] `src/assets/spriteManifest.ts` — Redesign F1 player/traffic cars & add lamp post sprites.
- [ ] `src/engine/Background.ts` — Add parallax night city skyline with lit building windows.
- [ ] `src/engine/Renderer.ts` — Tune red/white rumble quad rendering and lamp post sprite placement.
- [ ] `src/track/route.ts` & `src/main.ts` — Wire `passedCars` overtake counter into player state.
