# Retroline Turbo — Art Direction & Asset Pipeline Specification (Phases 7.5–9)

## TL;DR
- **"SNES made in 2026" = SNES sprite discipline (a tight ~40–48 colour master palette, chunky readable silhouettes, flat colour ramps) executed with modern luxuries the hardware never had: rock-solid sub-pixel-scrolled 60fps, alpha blending, dozens of pre-baked scale steps per sprite, and unlimited animation frames.** Author art on a virtual 2×2 pixel grid inside the 480×270 framebuffer — that, not the raw resolution, is what makes it read as retro.
- **Vehicles: go 3D-pre-rendered, not hand-drawn.** Use CC0 low-poly car models (Kenney Car Kit and RGS_Dev "Free Low Poly Vehicles Pack" — both CC0, both with separated wheels) rendered in Blender with a flat/unlit toon setup and palette clamp, baked into a **discrete scale-step ladder (~12 steps)** to kill nearest-neighbour shimmer. This is exactly what OutRun did (per the Reassembler disassembly, "five copies of each sprite, manually tweaked to look as good as possible at different zoom levels").
- **The 80-part upgrade economy is mostly invisible at speed** — only wheels/tyres and ride height read from a rear chase cam at 480×270. Put the money into the **garage screen** (big hero render + stat-diff bars) and into non-visual feedback (HUD, engine note, exhaust flame, chassis squat). Use **pre-baked colour variants** (the existing font precedent), not per-frame `globalCompositeOperation` tinting, which is documented as slow.

---

## TASK 1 — Art Direction Lock

### 1a. Palette

**How much SNES discipline to keep:** Keep the *philosophy* (a small, deliberately harmonised master palette; flat colour ramps; hand-placed highlights) and drop the *hardware ceilings*. Per the Wikibooks "Super NES Programming / SNES Specs," the SNES palette is "256 entries; 15-Bit color (BGR555) for a total of 32,768 colors"; and per Mega Cat Studios' "SNES Sprite Engine Design Guidelines," "Each SNES sprite can have 16 colors and a palette slot out of 8 total palette slots… The 0th entry of each palette slot is transparent" — i.e. 15 visible colours + transparency per 4bpp sprite. Those per-sprite sub-palette limits were a VRAM/CGRAM constraint. Enforcing them in 2026 is pointless self-punishment because Canvas 2D draws from full 24-bit PNGs with an 8-bit alpha channel and has no CGRAM. **What is worth keeping is a global master palette of roughly 40–48 colours** so every asset (the three existing plates included) shares one coherent "film stock." That is small enough to force discipline and coherence, large enough that you never fight the hardware.

This matches how the reference era actually looked: the SNES displayed 256 simultaneous colours from 32,768, and authentic 16-bit art leaned on carefully hand-placed highlights/shadows and colour ramps that transition across curved surfaces.

**Proposed master palette** (hex, grouped by role; harmonised to sit beside night / coastal_sunset / desert_canyon plates). Treat as an engineering starting point — sample the three plates' quantised palettes first and nudge these to match:

- **Road surface (2 alternating bands + shoulder):** `#4a4a55` / `#42424c` (near-identical greys, alternating), shoulder `#5a5a66`
- **Kerb / rumble:** `#d02020` (red) / `#f0f0f0` (white) — *keep the current pair; they are correct high-contrast arcade kerb colours*
- **Lane line:** `#e8e8d0` (warm off-white, dashed)
- **Sky gradient (coastal-sunset family):** `#f8b06a` → `#f07850` → `#c04870` → `#5a3a80` (4-step dusk ramp)
- **Sky gradient (day/desert family):** `#5ab0e0` → `#a0d8f0` → `#e8f0f0`
- **Sky gradient (night family):** `#101038` → `#282858` → `#4a4a80`
- **Foliage / palms:** `#2a7a3a` / `#3d9a4d` / `#58b85a` (3-step green ramp), trunk `#6a4a2a`
- **Chrome / metal (neutral ramp, shared):** `#2a2a32` → `#5a5a6a` → `#9a9ab0` → `#d8d8e8` → `#ffffff` (5 steps; the top white is the specular hit)
- **Car body ramps (per hue, 5 steps each):** e.g. red `#4a0a10`→`#8a1a20`→`#c02a30`→`#e85a55`→`#ffb0a0`; blue `#0a1a4a`→`#1a3a8a`→`#2a5ac0`→`#5a8ae8`→`#b0d0ff` (add yellow, silver, etc. on the same 5-step pattern)
- **UI accent (TX-1 family):** header blue `#000088` (fixed), plus font colours already baked: white `#ffffff`, magenta `#e030c0`, cyan `#30d0e0`, red `#e02020`, gold `#f0c020`, blue `#3050e0`

**Ramp steps for a car body to read as curved metal:** **5 steps** is the sweet spot at Task-3 sizes — a shadow tone, base, mid, highlight, and a small specular hit. The 5-step ramp is a widely-taught pixel-art convention: the Spritory Color Ramp Generator notes that "keeping your ramp to 5 colors (highlight ×2, highlight, base, shadow, shadow ×2) lets you shade a character sprite… without blowing up your palette," and Pedro Medeiros (Pixel Grimoire) frames the distinction that flat faces "have a uniform color" while curved shapes "can have color ramps." At a 120px hero car you can afford 5–6; at ~24px and below the ramp collapses to effectively 3 (shadow/base/highlight) as steps merge under downscaling — which is fine, and is why the scale-step ladder (1b/3b) is baked at authoring time rather than computed live.

### 1b. Pixel Density — the key answer

**Author at a coarser virtual grid, not at native framebuffer resolution.** The framebuffer is 480×270; true SNES was 256×224. At 1:1 pixel-perfect for 480×270 the chunk size is too fine and stops reading as SNES; at true-SNES chunk it reads fussy and small. **The right point: enforce a 2×2 pixel-cluster grid in the art** so the *effective* art resolution is ~240×135 while the framebuffer stays 480×270. That gives you SNES-scale chunk while leaving the extra resolution for (a) sub-pixel road scroll, (b) clean small text, and (c) crisp sprite edges that don't stairstep as badly. This is a discipline enforced *in the art*, not in the engine.

**What Horizon Chase Turbo and Slipstream actually did — and they did opposite things:**
- **Horizon Chase Turbo did NOT use pixel art at all.** Aquiris Game Studio's Technical Art Director **Amilton Diesel** explicitly rejected it (per Kill Screen, "Where Horizon Chase got its retro-futurism"): "'I'm not a big fan of pixels,' Diesel said… 'Modern devices call for something better, like polygons with pure and vibrant colors.'" HCT is **crisp low-poly 3D** that *communicates* a retro sensibility (wide skies, striped ground, roadside signs flickering by) while rendering true 3D objects. Notably, Diesel also confirms it's fundamentally a 2D-style game: "Horizon Chase is essentially a 2D game. It may look like a 3D game, but if we try to rotate the camera a few degrees, everything breaks." Its scenery was tuned so objects are "recognizable at 200 mph… more important than being realistic or detailed." **Takeaway for Retroline: silhouette + palette carry the retro read, not dot-fidelity.**
- **Slipstream IS genuine pixel art** and is the closer model for Retroline. Built by solo Brazilian developer **Sandro Luiz de Paula (alias Ansdor)**, it runs a **custom sprite-scaling engine at a low internal resolution, upscaled to modern displays at 60fps**, with optional Pixelated/CRT/NTSC filters. Its one concession to modernity: the **road itself is a polygonal construction** rather than pure scanline trickery, so scenery is visible much farther away — and MoeGamer (2018) notes that on hi-res displays "the pin-sharp polygonal road stands out immensely against the deliberately pixelated spritework for everything else." **Takeaway: Retroline is doing the more purist thing (scanline segments + pixel sprites); keep the road-surface banding disciplined (1d) so the road doesn't out-sharpen the sprites the way Slipstream's does.**

### 1c. What "2026" Buys (and what it must not)

**Do (things 1992 SNES hardware could not):**
- **Sub-pixel road scrolling.** Accumulate fractional scroll offset and use it to select banding phase; the segment projection `S = d_screen/z` runs in floats. This is the single biggest "modern" tell — buttery 60fps scroll with no line jitter.
- **Alpha blending / true transparency.** Canvas 2D `globalAlpha` and PNG alpha give you soft sprite edges, additive-style speed streaks, headlight glows, and dust — the SNES had only 1-bit sprite transparency and a single fixed colour-math layer.
- **Unlimited scale steps per sprite.** OutRun shipped only five hand-tweaked zoom copies; you can ship 12 (3b) essentially for free in atlas terms.
- **High animation frame counts.** Generous steering/skid/roll frames, multi-frame exhaust flame, wheel-spin — no OAM or ROM ceiling.
- **Colour count above 256 on screen** — but *voluntarily* capped to your 40–48 master for coherence.
- **Selective dithering** for sky-gradient banding only (ordered/Bayer for large flat sky areas), NOT on small sprites.

**Do NOT (breaks the illusion):**
- **No gradient fills or `shadowBlur`** — explicitly listed budget-eroders; they also instantly read as "modern vector," not 16-bit. Bake gradients into the pre-rendered plates/ramps instead.
- **No dithering on sprites below ~16px** — there is no room for a pattern to read at that size, so it just adds noise; modern pixel styles use clean flats.
- **No sub-pixel sprite positioning that produces non-integer nearest-neighbour sampling mid-sprite** (causes the shimmer 3b addresses). Snap sprite blits to whole framebuffer pixels.
- **No free-rotation / affine transforms** on sprites (that is the Mode-7 look you are explicitly avoiding, and per Diesel's quote it's exactly what "breaks" this style). Body roll is separate frames or a vertical-offset trick (3c), never a live rotate.
- **No high-frequency detail** that can't survive the 2×2 grid.

### 1d. Road Surface

**Banding frequency is a function of world-space segment distance, quantised into rumble groups — NOT raw screen-space distance, and NOT one-colour-per-segment.** The canonical technique (Jake Gordon's OutRun-style tutorial, following Lou Gorenfeld's Pseudo-3D Page) builds many short segments for smooth curves/hills but colours them in **groups of N segments** (a `rumbleLength`) so a whole rumble strip is one colour. The tutorial is explicit: "The reason we maintain a separate rumbleLength is so that we can have fine detailed curves and hills but still have long rumble strips. If each alternating segment was a different color it would create a bad strobe effect."

So:
- **Kerbs/rumble strips (`#d02020`/`#f0f0f0`):** alternate every `rumbleLength` group of segments (start at ~2–3 segments per band). Because segments compress toward the horizon, near the horizon many bands fall within one scanline and naturally blur to a solid — that's correct and matches OutRun.
- **Road surface:** two near-identical greys (`#4a4a55`/`#42424c`) alternating on the *same* rumble-group cadence, giving the subtle "speed" flicker without strobing. Keep the two greys close in value so it reads as texture, not stripes.
- **Lane lines:** dashed centre line phased on the same world-Z cadence (so dashes appear to flow toward you), not screen-space.
- **Road-edge shoulder:** a 1–2px band (`#5a5a66`) between kerb and grass to stop the kerb red from vibrating against green foliage.
- **Anti-strobe rule:** tie band phase to the **accumulated world-Z scroll (sub-pixel)**, and never let band period drop below ~2 framebuffer rows in screen space near the player. If a band would be <1 row, merge it (this is the natural horizon blur).

---

## TASK 2 — Asset Shortlist (CC0 / CC-BY / MIT / OFL only)

**Licensing gate applied.** All shippable entries below are CC0, CC-BY, or OFL (fonts). **Rejected:** any CC-BY-NC / CC-BY-SA / unclear. Specific rejections noted inline. Important caveat from research: **individual poly.pizza model pages for Quaternius sometimes display CC-BY 3.0 even though the bundle page says CC0** — download Quaternius via the itch/OpenGameArt CC0 listing or the bundle, and verify the per-file licence. **Also rejected: "KenPixel" via FontStruct / onlinewebfonts mirrors**, which are served as CC-BY-SA (a copyleft licence you reject) — use the CC0 Kenney Fonts package from kenney.nl instead.

### 2a. Low-poly 3D CAR MODELS (primary vehicle path)

| Asset | Direct URL | Licence | Attribution required? | Native resolution / format | Fits Task 1 spec? | Notes |
|---|---|---|---|---|---|---|
| Kenney **Car Kit** (45 assets) | https://kenney.nl/assets/car-kit | CC0 | No | .OBJ/.FBX/.glTF; ~45 models | Yes — clean flat-shaded low-poly, ideal to toon-render | **Wheels separate: YES** — pack includes "8 separate wheel models… plus debris." Poly count not published (measure in Blender). Sedan/van/ambulance/police = GT/tourer silhouettes. No F1 single-seater. |
| Kenney **Racing Kit** (110 assets) | https://kenney.nl/assets/racing-kit | CC0 | No | .OBJ/.FBX/.glTF | Yes | Track props + vehicles; closest CC0 route to an **open-wheel/formula** silhouette (a Kenney-derived "Mini Car Kit" references a formula-car variant). Verify the single-seater is present before committing. |
| RGS_Dev **Free Low Poly Vehicles Pack** (~22 vehicles) | https://rgsdev.itch.io/free-low-poly-vehicles-pack | CC0 (Creative Commons Zero v1.0) | No ("Credit is not needed") | .FBX etc; 1.3MB zip | Yes | **Wheels separate: YES, explicit** — "vehicles pack with separated wheels… colors separated by materials." Perfect for the Task-4 wheel-swap + tint requirement. Muscle/sports/roadster/sedan = good GT/tourer set. No F1. "No generative AI was used." |
| Quaternius **Cars Bundle** (7–8 models) | https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk | CC0 (bundle page) | No | .FBX/.GLB (+ .Blend on itch) | Yes | ~2,500–3,000 tris/car (poly.pizza shows ~2.9k). **Wheels-separate NOT confirmed by any source — verify in Blender.** ⚠️ Some individual poly.pizza pages show CC-BY 3.0; use the itch/OGA CC0 listing (https://opengameart.org/content/lowpoly-cars) to be safe. Road cars only, no F1. |

**Recommendation:** Primary = **Kenney Car Kit** (separated wheels, unambiguous CC0, wide silhouette range) + **RGS_Dev pack** (separated wheels + material-separated colours, ideal for the upgrade/tint work). Treat Quaternius as secondary. For the open-wheel F1 silhouette, plan to adapt Kenney Racing Kit's formula variant or model one simple single-seater yourself (a low-poly formula body is a weekend job). **Recolour work:** all need palette-clamping into the Task-1 palette at *render time* (via the toon/emission material + limited palette in 3d) — essentially free since you're rendering them anyway. No manual pixel recolour needed.

### 2b. 2D rear-view car sprite sheets (fallback)

| Asset | Direct URL | Licence | Attribution? | Native res | Fits? | Notes |
|---|---|---|---|---|---|---|
| The Spriters Resource — Top Gear / Top Gear 2 rips | https://www.spriters-resource.com/snes/topgear/ | ⚠️ **REJECT for shipping** | — | 256×224-era | Reference only | **Rip of copyrighted Kemco/Gremlin art — NOT a free licence.** Use ONLY as visual reference for proportions/steering-angle counts, never in the build. |
| Kenney **Racing Pack** (2D, 420 assets) | https://kenney.nl/assets/racing-pack | CC0 | No | Top-down 2D mostly | Partial | Top-down, not rear-view — usable for menu/map icons, not the race cam. |

**Verdict:** There is no strong CC0 *rear-view multi-angle* 2D car sheet worth shipping; this confirms the pre-render-from-3D path (2a → Task 3) is the right primary, with 2D as a genuine fallback only.

### 2c. Roadside props

| Asset | Direct URL | Licence | Attribution? | Native res | Fits? | Notes |
|---|---|---|---|---|---|---|
| Kenney **Racing Kit** (billboards, fences, tents, flags, signs) | https://kenney.nl/assets/racing-kit | CC0 | No | 3D (render to sprites) | Yes | Grandstands/tents/billboards/signs — pre-render each to a few scale steps. |
| Kenney **Background Elements Redux** | https://kenney.nl/assets/background-elements-redux | CC0 | No | 2D vector/PNG | Yes (silhouettes) | Trees/hills silhouettes; recolour to foliage ramp. |
| Quaternius **Ultimate Nature** (150+ models) | https://quaternius.itch.io/150-lowpoly-nature-models | CC0 | No | 3D .Blend/.FBX/.OBJ | Yes | Trees/palms to pre-render; recolour via render palette. |
| OGA **Background Clouds & Mountains Parallax** | https://opengameart.org/content/background-clouds-and-mountains-parallax | CC0 | No | Pixel art PNG | Yes | Ready-made pixel clouds/mountains; light recolour. |

**Recolour:** props rendered from 3D get the palette clamp for free; 2D pixel props (OGA) need a modest recolour pass into the foliage/sky ramps (~1–2 hrs per set).

### 2d. Tiling horizon / parallax strips (behind or in front of existing plates)

| Asset | Direct URL | Licence | Attribution? | Native res | Fits? | Notes |
|---|---|---|---|---|---|---|
| OGA **Parallax Mountain Background** (+ fog, clouds PNGs) | https://opengameart.org/content/parallax-mountain-background | CC0 | No | 2D PNG (mountain 164KB, clouds 16.9KB) | Yes | Designed for rolling parallax; sits as a far layer behind the plates. |
| OGA **Background Clouds & Mountains Parallax** | https://opengameart.org/content/background-clouds-and-mountains-parallax | CC0 | No | Pixel PNG + GIMP source w/ layers | Yes | Two mountain variants + clouds, layered source included — ideal for a near-parallax band in front of the plate. |
| Kenney **Background Elements Redux** | https://kenney.nl/assets/background-elements-redux | CC0 | No | 2D | Yes | Extra hill/tree silhouette layers. |

**Recolour:** all need quantising to each plate's palette — feed them through the existing `scripts/prep_backgrounds.py` (chroma-key → crop → downscale → **palette quantise** → mirror) so they auto-match. Low effort because the tool already exists.

### 2e. Permissive pixel fonts (uppercase + digits, ≤8px, arcade)

| Asset | Direct URL | Licence | Attribution? | Native res | Fits? | Notes |
|---|---|---|---|---|---|---|
| **Press Start 2P** | https://fonts.google.com/specimen/Press+Start+2P | **OFL (SIL Open Font License 1.1)** | No (redistribute w/ licence) | 8px multiples | Yes — Namco-arcade forms, uppercase+digits | Gold-standard arcade font; free commercial use, modification, distribution. Bitmap-crisp at 8/16px. |
| **m3x6 / m5x7** by Daniel Linssen | https://managore.itch.io/m5x7 | Free w/ attribution (author terms) | **Yes (author asks credit)** | 3×6 / 5×7 px | Yes | Tiny, clean; m3x6 is ≤6px for cramped HUD readouts. Attribution required — acceptable but note it. |
| Kenney **Fonts** (KenPixel etc.) | https://kenney.nl/assets/kenney-fonts | **CC0** (per kenney.nl) | No | Pixel + vector | Yes | ⚠️ Only the **kenney.nl download is CC0**; third-party FontStruct/onlinewebfonts mirrors of "KenPixel" are served as **CC-BY-SA — REJECT those mirrors.** Take it from kenney.nl only. |

**Recommendation:** Ship **Press Start 2P** (OFL, no attribution burden) as the primary, baked into the atlas the same way the current HUD font is — one full glyph set per colour (white/magenta/cyan/red/gold/blue). Keep m5x7 only if you need a smaller face and are willing to carry the attribution line. **Recolour:** each colour = a full pre-baked glyph set (existing precedent; see 4c for why this trade is still correct).

---

## TASK 3 — Vehicle Sprite Specification (for `scripts/render_car_sprites.py`)

### 3a. Frame size

The premise is essentially right. Top Gear's player car occupies roughly a quarter of screen width; at 480 wide that is ~120px. **Confirm ~120px source frame width for the player car**, but author with padding:

- **Player car source frame: 128×80px** (visible car ~112–120px wide, centered, with transparent margin for lean/roll frames and edge-bleed padding).
- **Traffic car largest scale step: 120×72px**, receding down the ladder to ~10×7px.

Reasoning: 128 is a clean power-of-two width that eases atlas packing (5b), and the extra 8px over the visible 120 absorbs body-roll horizontal shift and the 1px edge-bleed guard.

### 3b. Scale steps — the mip-ladder (least-sure part, resolved)

**Correct fix: pre-baked discrete scale steps (a sprite "mip chain") baked into the atlas at authoring time, with the runtime scale factor QUANTISED to that fixed ladder.** Do not nearest-neighbour-downscale one detailed frame live — that is exactly what produces the shimmer/pixel-crawl you describe as `z` changes at 60fps. This is precisely what the arcade hardware did: per the Reassembler OutRun-disassembly blog, "OutRun actually has five copies of each sprite, manually tweaked to look as good as possible at different zoom levels," and the same source notes the Dreamcast/console port used the same technique. You have far more atlas budget than 1986 Sega, so use more steps.

**Ladder: 12 steps**, geometric (each ~0.8× the previous) from 120px down to ~10px:
`120, 96, 76, 60, 48, 38, 30, 24, 19, 15, 12, 10` (px width; height ∝ ~0.6×).

- Runtime: compute ideal screen width from `S = d_screen/z`, then **snap to the nearest ladder step** (never interpolate between steps). The car "pops" between sizes, but at 60fps over 12 steps the pops are sub-perceptual and — critically — each step is a *clean, hand-quantised* image with no crawling pixels. This is the standard modern-pixel-racer approach and the OutRun approach.
- Between-step motion is carried by the road/parallax, not by scaling the car, so the pop is masked.
- **Atlas cost (one car, one steering angle):** sum of the 12 step areas ≈ 120×72 + 96×58 + … ≈ **~14,500 px²**, i.e. roughly **1.7× the area of the single largest frame** (the geometric tail is cheap — the 10px frame is ~70px²). For the full player car (5 effective steering states via 3 angles + flip, plus skid + brake — see 3c) that's on the order of **~100k px²**, comfortably a 512×256 region. Traffic cars, sharing fewer frames, cost less.

Note the documented OutRun "sprite zoom bug," which was "only noticeable when driving at low speeds" — a caution that stepping artifacts show up at low speed. Your fixed-ladder + road-motion-masking avoids that low-speed tell.

### 3c. Steering angles

**Drop to 3 base angles + horizontal flip, not 5.** At a rear view at this resolution and at race speed, the difference between 15° and 30° yaw on a ~120px rear-facing sprite is a few pixels of wheel/tail offset. Ship:
- **3 authored angles: 0°, 15°, 30°** (turning one way), **horizontally flipped at runtime for the other 3** (−15°, −30°). Canvas 2D flips via negative-scale `drawImage` or a pre-flipped baked copy. This halves the authored angle art vs 5 distinct angles.
- **Caveat/inference:** a horizontal flip is *identical* to a hand-authored mirror only if the car livery/body is symmetric. Since these are pre-rendered from 3D with symmetric bodies, the flip reads identically to a player at 200km/h — reasonable, flagged as inference.
- **Skid and brake:** add as separate frames (brake = lit brake-light overlay; skid = larger yaw + smoke overlay). Brake lights are better as a **cheap overlay quad** (4b) than a whole extra body set.
- **Body roll on hard cornering:** use the **vertical-offset trick** — do NOT author separate roll frames and do NOT rotate. Nudge the sprite up/down 1–2px and swap to the 30° frame; optionally use a single pre-baked "leaned" variant for the player car only. Rotation is banned (1c). Keeps the atlas small and avoids the affine/Mode-7 look.

### 3d. Blender render settings (concrete)

Target: clean SNES-style flats, palette-clamped, matching the segment-projection rear chase perspective. Settings (Blender 3.6+; inference-based starting values, tune against the plates):

- **Engine:** Eevee (fast, fine for flat toon).
- **Camera:** keep a mild perspective to match pseudo-3D. **Perspective, focal length ~50–65mm (FOV ~30–38°)** — a longish lens flattens the car the way a distant chase cam does and matches the low-distortion feel of scaled sprites.
- **Camera height:** ~1.2–1.5× car roof height (rear-quarter-high chase). **Distance:** far enough that the car fills ~80% of frame at the 120px render. **Pitch:** angled down ~8–12° onto the rear deck (matches the horizon sitting above the car in the 5a layout).
- **Render resolution:** render each scale step at **2× its target, then area/box-downscale** to the ladder size (e.g. render the 120px frame at 240px, downscale). Area downscale (not nearest) at bake time gives clean edges; then **palette-quantise to the master palette** as the final step (reuse the `prep_backgrounds.py` quantise stage).
- **Shading:** **flat/unlit or 2-step toon.** Simplest robust route: set materials to **Emission** (pure colour, no lighting) OR Principled BSDF with the view transform set to **Standard** (not Filmic/AgX) so colours don't desaturate. For a touch of form, use **Shader-to-RGB → Color Ramp with 2–3 hard stops** (toon) driven by a single key light, giving exactly the shadow/mid/highlight ramp from 1a. Avoid smooth specular — glossy gradients fight the palette and read modern.
- **Outline:** thin **Freestyle line, ~1px** at render scale, dark (`#101018`), on outer silhouette + major panel breaks only — mark Freestyle edges manually to avoid noise. Gives the crisp 16-bit read.
- **Lighting:** one sun key from upper-front-left, low strength; world/ambient flat mid-grey so shadows never go muddy. Since you're clamping to a palette, lighting's only job is to pick which of the 5 ramp steps a face lands on.
- **Wheels as separate objects:** render the body and the wheels on **separate render layers/passes** (or separate renders with alpha) so wheel overlays (4b) register independently. Kenney Car Kit and RGS_Dev packs already have separate wheels; keep them parented but on their own collection for a wheels-only pass.

---

## TASK 4 — Make the Upgrade Parts Look Cool (80 parts, no 80 cars)

### 4a. Be honest about visibility (rear chase cam, 480×270)

Your suspicion is correct. Ranked by what actually registers:

- **Wheels / Tyres (→centrifugal): CLEARLY VISIBLE.** The rear cam looks straight at the rear wheels/tyres. Fat tyres, rim colour, stance all read. **Spend real pixels here.** This is also the one category with a genuine separate-object precedent in the source models (2a/3d).
- **Engine (→maxSpeed): PARTLY VISIBLE via proxies.** The block is invisible, but **exhaust tips, a hood scoop/intake above the rear deck, and exhaust flame on shift** read. Feedback belongs on those proxies + engine note + HUD speed.
- **Suspension (→maxSteer): BARELY VISIBLE via ride height only.** A lowered stance/rake is a 1–2px vertical change — detectable on the *player's own* car over a race, invisible on traffic. Feedback belongs mostly in **handling feel + chassis squat under accel/brake** (a 1px body offset), not a drawn part.
- **Transmission (→accel): NOT VISIBLE AT ALL.** There is nothing to draw. Feedback belongs entirely in **non-visual channels: the HUD (gear/accel stat bar), engine-note pitch on shift, and the launch/squat animation.** Do not waste art on it.

**Where invisible feedback goes:** HUD stat readout in the TX-1 header; engine-note synthesis (pitch/timbre shift per Engine/Transmission tier); an exhaust-flame sprite on gear-shift (Engine); 1px chassis squat under acceleration (Transmission/Suspension); ride-height offset (Suspension); and the **garage screen** (4e) where everything is legible.

### 4b. Layering & anchor scheme

**Base chassis frame + separately-anchored overlay quads.** Each body frame carries a small **anchor table** in the atlas manifest: named 2D points in the body frame's local coords. Overlays (wheels, exhaust, spoiler, intake, brake-light) draw at `bodyScreenPos + anchor * stepScale`.

Anchor scheme (the part that usually breaks):
- Store anchors **normalised 0..1 in the source (largest) frame**, then multiply by each step's width/height. This keeps registration correct across all 12 scale steps **without a hand table per step** — one normalised anchor per overlay per steering angle (3 angles × ~4 overlays ≈ 12 anchor points per car).
- **Flip handling:** for horizontally-flipped angles (3c), mirror the anchor's x (`x → 1−x`) automatically. This is the one line usually forgotten that causes overlays to detach on left turns — bake it into the RenderBackend overlay call.
- Overlays are pre-baked at the **same 12 scale steps** as the body so a wheel is never live-scaled (same anti-shimmer rule as 3b).
- Because game code never touches `ctx` (engine rule 2), expose `drawSpriteAnchored(bodyId, overlayId, angle, step, x, y)` on the RenderBackend; it does the anchor lookup with primitive args only.

**Draw-call cost vs budget:** worst case, the player car = 1 body + 4 wheels + exhaust + spoiler + intake + 2 brake-lights ≈ **~10 quads**. Traffic cars are far simpler — most render as **1 body + 2 rear wheels = 3 quads**, many as just 1 (distant cars below a threshold step draw body only, overlays culled). Budget check on mobile (60 on-screen sprites, <150 quads soft / 250 hard): player 10 + say 8 near traffic × 3 (24) + 51 distant × 1 (51) ≈ **~85 quads for all cars**, leaving ~65 for road/props/HUD within the 150 soft budget. **Rule: cull overlays below scale step ~6 (≤30px)** — nobody sees an exhaust tip on a 24px car. That keeps you safely under budget.

### 4c. Colour variation — ranked, with a pick

Ranking for a 60fps loop with **no per-frame allocation**:

1. **✅ PICK: Pre-baked colour variants in the atlas** (the existing font precedent). One `drawSprite` per car, zero per-frame allocation, zero compositing cost, deterministic, and works in the headless Vitest path (no Image/canvas needed at test time). Same trade already accepted for the HUD font; still correct.
2. **One-time offscreen tint cache built at load** — acceptable second choice (build N tinted copies into an offscreen canvas once at boot), but it touches canvas/`createImageBitmap` and so must degrade gracefully to a procedural fallback in tests (engine rule 4). Use only if atlas size becomes a problem.
3. **`globalCompositeOperation` tinting per frame** — **rejected.** Non-`source-over` composite ops have a documented history of being slow: Mozilla Bugzilla #762973 records that "All Canvas2d globalCompositeOperations except 'source-over' are very slow," attributed to Direct2D not exposing blend control, so "any non-source-atop blend operation requires an expensive Direct3D fallback." Even the recommended `source-atop` path requires drawing the sprite twice (fill + composite) per car per frame → per-frame work you can't afford at 60 cars. Reject.
4. **Per-pixel ImageData manipulation per frame** — **rejected outright.** `getImageData`/`putImageData` are the slowest canvas path and allocate; forbidden by the no-per-frame-alloc rule.

**Atlas cost of the pre-baked option:** for the **player car** you likely want ~**8 body colours**. Full player set per colour ≈ 100k px² (from 3b). 8 colours ≈ **800k px²** — fits in roughly a **1024×768** or one **1024×1024** region. **Key saving:** only the **body ramp** needs recolouring — wheels/exhaust/spoiler overlays are colour-neutral (chrome/black) and shared across all body colours, so you are NOT multiplying the whole car by 8, only the body. That cuts the pre-baked cost dramatically and is the reason layering (4b) pays for itself twice. Traffic cars need fewer colours (e.g. 6 shared) and fewer frames.

### 4d. Readability at speed

- **Player car (seen whole race):** worth 5-step ramps, visible rim colour, spoiler silhouette, exhaust flame, brake lights, ride-height. This is where detail pays off.
- **Traffic car (seen ~2 seconds, mostly small):** silhouette + one or two colours + rear tyres is all that registers. **Spend pixels on:** a bold readable silhouette and high body/road contrast (so the player can judge closing speed), and brake-light state (gameplay-critical for overtaking). **Don't** author per-part detail on traffic cars — they should be a handful of shared bodies in a few colours on the shared scale ladder.
- General rule, taken literally from HCT's own art direction: make things "recognizable at 200 mph, through color and silhouette, more important than being realistic or detailed."

### 4e. The garage screen (sells the parts)

Since most part detail is invisible at speed, the garage is where upgrades *feel* meaningful. What to build:

- **Big hero render, front-3/4 or rotating showcase.** Render the current car large (e.g. 240–320px) in the garage using a dedicated Blender garage render per car/colour (you already have the pipeline). A slow auto-rotate (8–16 pre-baked yaw frames) reads as "showcase" without real 3D. Gran Turismo-style garages lean entirely on hero-car presentation; the car is the product.
- **Stat-diff bars are essential** because the physics changes are the real payload and are invisible on the body. Show the four metrics (maxSpeed/accel/maxSteer/centrifugal) as **before→after bars with a coloured delta** when a part is highlighted — green for the gain, red for the trade-off (a V8 twin-turbo: +top-speed bar, −handling bar). This makes the *specialisation-with-trade-off* design legible, which is the whole point of Phase 9.
- **Part icons** for the 80-part catalogue: 16×16 icon per part, grouped by the four categories, showing tier + the stat moved. 80 icons at 16×16 = 20,480 px² — trivial atlas cost.
- **Visible parts get a live overlay on the hero render** (new wheels/spoiler/exhaust actually appear on the big car); invisible parts (transmission) get an **icon + stat bar + flavour line + engine-note preview** so they still feel like an acquisition. Both 80's Overdrive and Horizon Chase sell upgrades primarily through **buy/upgrade menus with clear stat feedback and a prominent car image**, not in-race visuals — follow that. (Note: the exact HCT garage layout could not be fully verified from primary sources within budget; the hero-render + stat-bar pattern is well-attested across the genre and is the safe recommendation.)

---

## TASK 5 — Layout

### 5a. Screen composition (480×270)

**A top-heavy TX-1 header works at 16:9 *if it's shallow* (~40px) and the rest of the HUD lives in the corners the way OutRun and Top Gear did.** A deep top band eats the sky and cramps the road; keep the solid-blue (`#000088`) header thin and push speed/score to corners. Vertical budget:

- **HUD header (TX-1 blue):** y=0–40 (40px, ~15% of height). Carries the 5-stage branching route tree (center), stage + timer + gold-star CARS gauge.
- **Sky / horizon plates:** horizon line at **y≈118** (just above vertical center). Sky occupies ~y=40–118 (~78px visible below the header). Matches the existing plates' heights (night 119, coastal 112, desert 99) — the plate bottom sits on the horizon line.
- **Road:** y≈118–270 (~152px, the bottom ~56%). Road gets the majority of the screen — correct for a racer.
- **Player car:** centered horizontally (x≈240), baseline at **y≈232**, top ~y≈200 (car ~120px wide, ~40–52px tall in the lower third with ~38px of road below it so the player sees what they're about to hit).
- **Safe margins:** keep critical HUD ≥6px from all edges (`viewport-fit=cover` is set for mobile Safari notch; corners are safest).

```
(0,0)                                                             (480,0)
 +--------------------------------------------------------------------+
 |  TX-1 BLUE HEADER  #000088                        y0–40 (40px)     |
 | STAGE 3   [route tree: o-o-O-o-o]        TIME 1:23     ★★★☆☆ CARS  |
 +--------------------------------------------------------------------+  y=40
 |                          SKY / HORIZON PLATE                        |
 |   (parallax mountains/clouds behind; plate mirrored-wrap)          |
 |............................ HORIZON y=118 ........................ |  y=118
 |                          ROAD (segment projection)                 |
 |                 kerb #d02020/#f0f0f0 alternating                   |
 |  SCORE 0042100                                     SPEED 287 km/h  |  <- corners y≈248
 |                        ___                                          |
 |                       /   \   player car  base y=232               |
 |                      |_____|  x-center 240                         |  y=232
 |                       O   O                                         |
 +--------------------------------------------------------------------+
(0,270)                                                          (480,270)
  Corner HUD: SCORE bottom-left (~x8,y248), SPEED bottom-right (~x400,y248),
  both ≥6px from edges. Route tree + timer + gold-star CARS gauge in blue header.
```

Rationale: OutRun and Top Gear kept score/time/speed in the top or bottom corners and left the center clear for road and car. The TX-1 blue header is a distinctive identity element, so keep it — just shallow, and move the fast-changing readouts (speed, score) to the bottom corners where the eye catches them without leaving the road.

### 5b. Atlas layout

**Several atlases, split by domain and lifecycle, not one mega-atlas:**
1. **`cars.png`** — all car bodies (all colours) + wheel/exhaust/spoiler/intake overlays, all 12 scale steps. Largest atlas.
2. **`props.png`** — trees, palms, signs, billboards, kerb tiles, grandstands, at their scale steps.
3. **`ui.png`** — HUD font glyph sets (per colour), route-tree pieces, gold star, part icons, stat-bar pieces.
4. **`effects.png`** — exhaust flame, smoke, dust, speed streaks (the alpha-blended 2026 extras).

Why split: different memory lifecycles (UI always resident; effects optional on low-end), parallel async loading (Phase 7.5 open item), and each stays well under mobile texture limits.

**Frame ordering (cache-adjacency):** within `cars.png`, store each car's **12 scale steps contiguously, largest→smallest, then next steering angle, then next colour** — so frames touched together in one draw (a car's current step across recent frames) are physically adjacent, improving texture-cache locality. A car's overlays immediately follow its bodies.

**Padding & edge-bleed (critical for nearest-neighbour):** pad every frame with a **≥2px transparent gutter** AND a **1px edge-bleed** (duplicate the outermost opaque row/column outward) so nearest-neighbour sampling at fractional scale can't pull in a neighbour's pixels. Because you quantise scale to a fixed ladder (3b) and snap blits to integer framebuffer pixels (1c), sampling error is already minimised; the bleed+gutter is belt-and-suspenders and standard practice.

**Power-of-two vs tight packing:** use the existing `packAtlas.ts` bin-packer for **tight packing inside a power-of-two atlas canvas** (e.g. 1024×1024 or 2048×1024). POT outer dimensions are safest across GPUs and make scaling predictable; tight interior packing saves memory. Frames themselves need not be POT.

**Max atlas dimensions — safe across mobile Safari and Chrome (cited):**
- **iOS Safari: hard cap 4096×4096.** MDN's `<canvas>` page states: "notably iOS devices limit the canvas size to only 4,096 x 4,096 pixels," and "Exceeding the maximum dimensions or area renders the canvas unusable — drawing commands will not work." (This also governs Chrome on iOS, which uses WebKit.) iOS 18+ raised the cap to 8192×8192 (per Lion Puro's testing), but **target 4096 to support older iOS.**
- **Chrome desktop:** historically 32,767px per side (the Chromium issue titled "Canvas maximum size >32767px"); newer Chrome allows up to **65,535px in a single dimension** (jhildenbiddle/canvas-size issue #2: "it seems that Chrome allows canvas of size 65535x1 nowadays… [maxWidth] still returns 32767x1"). A commonly-cited area cap of ~268,435,456px circulates via secondary sources (e.g. TutorialsPoint) — treat as approximate, not vendor-confirmed.
- **Firefox:** commonly cited 32,767px per side, ~472,907,776px max area (secondary source; not vendor-confirmed).
- **Safari also has a total canvas *memory* budget** (~384MB on iOS Safari 15, per pqina's testing); many resident canvases can trip "Total canvas memory use exceeds the maximum limit" even when each is small. Release offscreen build canvases after baking the atlas.

**Verdict: cap every shipped atlas at 2048×2048 (comfortably under the 4096 iOS floor), power-of-two, one context, released after bake.** Safe on every current mobile Safari and Chrome.

**JSON manifest schema** (modelled on the existing `public/assets/backgrounds/manifest.json` shape — `id/file/width/height/skyColor` per entry — extended for atlases):

```json
{
  "id": "cars",
  "file": "cars.png",
  "width": 2048,
  "height": 1024,
  "frames": [
    {
      "id": "gt_red_a0_s0",
      "x": 0, "y": 0, "w": 120, "h": 72,
      "car": "gt", "color": "red", "angle": 0, "step": 0,
      "anchors": {
        "wheelBL": [0.18, 0.92], "wheelBR": [0.82, 0.92],
        "exhaust": [0.50, 0.98], "spoiler": [0.50, 0.10]
      }
    }
  ]
}
```

Anchors normalised 0..1 (per 4b) so they survive every scale step; `angle`/`step`/`color` are primitive keys the RenderBackend uses for frame lookup, mirroring the plates' flat metadata style.

---

## Recommendations (staged, with thresholds)

**Stage 1 — Lock direction (now, Phase 7.5).** Adopt the 40–48 colour master palette (1a) by sampling the three existing plates first, then filling roles. Enforce the **2×2 virtual-grid** rule (1b) in all new art. Keep kerbs `#d02020`/`#f0f0f0` and implement rumble-group banding tied to sub-pixel world-Z scroll (1d). *Threshold to revisit:* if the road strobes at any speed, increase `rumbleLength` (segments per band) until it stops.

**Stage 2 — Vehicle pipeline.** Download **Kenney Car Kit + RGS_Dev pack** (both CC0, both separated wheels). Build `render_car_sprites.py` around: 128×80 source frames, **12-step scale ladder**, **3 steering angles + runtime flip**, flat/emission-or-2-step-toon + Freestyle 1px outline + palette clamp (3d). *Threshold:* if between-step "pops" are visible at low speed, add steps 13–16 at the large end (cheap) before considering live interpolation (which you should not do).

**Stage 3 — Layering & colour (into Phase 9).** Implement anchored overlays (4b) with normalised anchors + auto-mirror on flip. Use **pre-baked body-colour variants** (4c), recolouring only the body ramp (wheels/overlays shared). *Threshold:* if `cars.png` approaches 2048×2048, switch body colours from pre-baked to a **load-time offscreen tint cache** (option 2), never to per-frame compositing.

**Stage 4 — Garage & feedback.** Build the garage as hero-render + stat-diff bars + 16×16 part icons (4e). Route all invisible-part feedback (Transmission entirely; most of Suspension) to HUD + engine note + squat animation (4a). *Threshold:* playtest — if players can't tell an upgrade did anything, strengthen the stat-diff animation and engine-note delta before adding any in-race visual.

**Stage 5 — Atlas & limits.** Split into cars/props/ui/effects atlases, ≤2048×2048 POT each, 2px gutter + 1px bleed, released after bake. *Hard threshold:* never ship an atlas >4096 on any dimension (iOS breaks).

## Caveats
- **Palette hex values (1a), Blender camera/lens numbers (3d), and the 12-step ladder sizes (3b) are engineering starting points / inferences**, not sourced constants — tune them against the three existing plates and against on-device tests. Flagged as inference throughout.
- **Horizontal-flip = authored mirror (3c)** holds only for symmetric liveries; asymmetric decals would need real mirrored art. Inference.
- **Poly counts for Kenney Car Kit and RGS_Dev are unpublished** — measure in Blender; only Quaternius exposes ~2.5–3k tris/car via poly.pizza. **Quaternius licence is CC0 on the bundle page but some individual poly.pizza pages show CC-BY 3.0** — download via the itch/OpenGameArt CC0 listing and verify per file.
- **None of the vetted CC0 car packs include an open-wheel/F1 single-seater**; plan to adapt Kenney Racing Kit's formula variant or model one.
- **Canvas area caps (~268M Chrome / ~472M Firefox) come from a secondary tutorial source, not vendor docs.** The reliable, vendor-adjacent facts are the **iOS 4096×4096 cap (MDN)** and Chrome's 32,767→65,535 single-dimension figures (Chromium issue + canvas-size repo). The 2048×2048 recommendation is safe regardless. **A citeable exact Chrome-Android per-dimension number was not found** — treat mobile as GPU-limited and stay at 2048.
- **The exact Horizon Chase garage layout could not be fully verified** from primary sources within research budget; the hero-render + stat-bar recommendation is genre-standard and safe.
- **The Spriters Resource Top Gear rips are copyrighted** and are listed for reference proportions only — not shippable.