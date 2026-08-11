# Technical Spec: Sprite & Asset Pipeline for Retroline Turbo

> # ⚠️ SUPERSEDED — 2026-08-10
>
> **Do not implement from this document.** It is retained for its sourcing-method
> decision matrix (§2) and dataflow diagram (§3), which remain sound. Its concrete
> engineering decisions have been replaced by four sequenced specs:
>
> - `2026-08-10-a-art-direction-road-layout.md` — palette, road surface, screen layout
> - `2026-08-10-b-atlas-engine-v2.md` — scale ladder, anchored overlays, multi-atlas loading
> - `2026-08-10-c-vehicle-bake-pipeline.md` — Blender bake, packer, renderer consumption
> - `2026-08-10-d-props-parallax-effects.md` — props, parallax, effects, font
>
> Research basis: `docs/research/2026-08-10-art-direction-asset-pipeline-research.md`.
>
> **Three specific contradictions — the superseding decision wins in each case:**
>
> | This document says | Superseded by | Why |
> |---|---|---|
> | **5 steering angles** (§4.2, §4.4) — straight, ±15°, ±30° all authored | **3 authored angles + runtime horizontal flip** (Spec B §5, Spec C §4) | At a rear view on a ~120px sprite the difference is a few pixels; flipping halves the car atlas against a hard 2048×2048 cap. |
> | **Live sprite scaling** — one detailed frame scaled per frame (§4.1) | **Pre-baked 12-step scale ladder, runtime snaps to it** (Spec B §3) | Continuous scaling with `imageSmoothingEnabled = false` is exactly what causes pixel crawl. OutRun shipped five hand-tweaked zoom copies for this reason. |
> | **960×270 Gemini skylines** (§4.3) | **Already shipped differently** — 960×119 / 960×112 / 960×99 plates via `scripts/prep_backgrounds.py` | The plates exist, are on the CDN, and carry their own adaptive 48-colour palettes. Spec A §2 derives the master palette *from* them. |
>
> Also note: §4.2's frame names (`player_turn_l1`, `player_turn_l2`, …) are not the
> naming scheme in use. See Spec B §4 for the integer-indexed lookup that replaces
> per-frame string construction.

> **Document:** `docs/superpowers/specs/2026-08-06-sprite-asset-pipeline-spec.md`  
> **Goal:** Upgrade Retroline Turbo from primitive canvas rectangles (`ctx.fillRect`) to high-fidelity retro arcade PNG sprite sheets, 3D pre-rendered vehicle angles, and AI-assisted scenery.  
> **Target Aesthetic:** 16-bit / 32-bit Arcade Pseudo-3D (OutRun, TX-1, Slipstream, Horizon Chase)  
> **Date:** August 6, 2026  

---

## 1. Problem Statement & Visual Goal

Currently, `generateSprites.ts` bakes simple 34×20 pixel blocky rectangles (`ctx.fillRect`) into a boot canvas. While fast and deterministic for early unit testing, it makes the live web app look extremely basic.

To achieve the visual pop and polish of professional retro racers (e.g. *Slipstream*, *Horizon Chase*, *TX-1*), the asset pipeline needs:
1. **Multi-Angle Vehicle Sprites**: F1 & GT cars with steering angles (straight, light turn ±15°, hard turn ±30°, skid/drift tilt, brake lights active).
2. **Detailed Roadside Props & Scenery**: High-res trees, streetlights, billboards, distance markers, and multi-layered city skylines.
3. **High-Resolution PNG Sprite Atlas Support**: Engine support for loading crisp external PNG atlases (`HTMLImageElement` / `ImageBitmap`) with sub-pixel resolution and pixelated upscaling (`image-rendering: pixelated`).

---

## 2. Evaluation of Asset Sourcing & Generation Methods

| Sourcing Method | Best Used For | Pros | Cons / Gotchas | Recommendation |
|---|---|---|---|---|
| **A. Blender 3D Pre-Rendering (Blender MCP / Python)** | Vehicle Sprites, Opponents (NPCs), Upgrade Parts (Spoilers, Wheels, Exhausts) | **100% perfect perspective consistency** across all 5+ steering angles, roll/tilt, brake lights, and modular garage parts. | Requires low-poly 3D models (CC0 from Kenney/Sketchfab) & setup script. | **PRIMARY for Cars & Garage Parts** |
| **B. AI Image Generation (Gemini / Flux / PixelArt LMM)** | Roadside Scenery, Billboards, UI Icons, Horizon Skylines, Garage Shop Items | Rapid generation of rich, unique thematic assets (City nightscapes, Palm trees, Billboards, Part icons). | Hard to generate multi-angle cars with consistent proportions. | **PRIMARY for Scenery, Skylines & UI** |
| **C. CC0 Open-Source Packs (Kenney.nl / OpenGameArt)** | Baseline roadside props, trees, signs, UI elements | Instant plug-and-play availability; 100% legal CC0/MIT license. | May look generic if used without custom color tuning. | **QUICK-START Baseline** |

---

## 3. Recommended Asset Architecture & Pipeline Spec

```
                          [ SOURCING PIPELINE ]
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
[ Blender 3D Models ]     [ Gemini / LMM AI ]          [ CC0 Asset Packs ]
  - F1 & GT Car Models      - Horizon Skylines           - Trees, Rocks, Signs
  - Steering Angles (0,±15,±30) - Billboards, Props       - UI Badges
  - Garage Parts            - UI Part Icons
      │                            │                            │
      └────────────────────────────┼────────────────────────────┘
                                   ▼
                   [ Sprite Sheet Processor Script ]
                     - Background Chroma Removal
                     - Bounding-Box Trim & Frame Alignment
                     - PNG Atlas Packing + JSON Manifest
                                   ▼
                        [ public/assets/sprites/ ]
                        - cars_f1_atlas.png
                        - scenery_atlas.png
                        - skyline_city.png
                                   ▼
                        [ Retroline Turbo Engine ]
                     - SpriteAtlas.ts (PNG Loader)
                     - Renderer.ts (Multi-Angle Blitter)
```

---

## 4. Pipeline Phase Breakdown

### Phase 1: Engine PNG Sprite Atlas Loader Upgrade (`SpriteAtlas.ts`)
- Upgrade `SpriteAtlas` to load standard PNG images (`public/assets/sprites/atlas.png`) asynchronously alongside a JSON frame manifest.
- Support multi-frame sprite lookup: `atlas.frame('player_straight')`, `atlas.frame('player_turn_l1')`, `atlas.frame('player_skid')`.
- Keep backwards compatibility with procedural fallback canvas for Vitest headless unit testing.

### Phase 2: Blender 3D Vehicle Sprite Generator (NPCs & Player Cars)
- **Workflow**:
  1. Load low-poly F1 & GT 3D models (CC0 from Kenney / Sketchfab).
  2. Run automated Blender script (`scripts/render_car_sprites.py`) that sets camera at rear perspective height ($y=100, z=-250$).
  3. Rotate model across key angles:
     - Frame 0: Rear Straight ($0^\circ$)
     - Frame 1: Turn Left Light ($-15^\circ$)
     - Frame 2: Turn Left Hard ($-30^\circ$)
     - Frame 3: Turn Right Light ($+15^\circ$)
     - Frame 4: Turn Right Hard ($+30^\circ$)
     - Frame 5: Brake Lights Active
  4. Render at $128 \times 80$ with toon line shader / palette clamp into PNG sprite sheet.
- **Result**: Perfect F1 & GT vehicle sprites for Player and NPC traffic cars with zero visual distortion.

### Phase 3: AI-Generated Scenery & Horizon Skylines (Gemini / LMM)
- **Workflow**:
  1. Prompt Gemini / AI generator for seamless pixel-art horizon skylines (City Nightscape, Coastal Sunset, Desert Dunes) at $960 \times 270$ resolution.
  2. Generate high-res roadside billboards, retro arcade logos, and neon signage.
  3. Use Python script (`scripts/trim_alpha.py`) to remove solid backgrounds and pack into `scenery_atlas.png`.

### Phase 4: Dynamic Vehicle Steering & Overtake Animation (`Renderer.ts`)
- Update `Renderer.drawPlayerCar` and `Renderer.drawSprites` to dynamically pick vehicle frame based on player steering input & skid state:
  ```ts
  const frameName = player.isSkidding ? 'player_skid'
    : input.steer < -0.5 ? 'player_turn_l2'
    : input.steer < -0.1 ? 'player_turn_l1'
    : input.steer > 0.5 ? 'player_turn_r2'
    : input.steer > 0.1 ? 'player_turn_r1'
    : 'player_straight';
  ```

---

## 5. Verification & Acceptance Criteria

1. **Visual Quality**: Game visual quality matches retro 16-bit / 32-bit arcade standards (*Slipstream* / *TX-1*).
2. **Performance**: Asset atlases loaded efficiently; zero per-frame allocation; solid 60fps frame rate maintained on desktop & mobile web.
3. **Headless Safety**: `npm test` remains 100% green via fallback mock canvas when running outside browser DOM.
