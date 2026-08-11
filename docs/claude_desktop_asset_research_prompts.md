# Claude Desktop research prompt — art direction & asset sourcing

Single prompt for Claude Desktop with web search / research enabled.
Supersedes the earlier three-option draft: asset hosting is settled (everything lives in
`public/assets/` and ships on Netlify's CDN with the Vite build), so this prompt spends
its whole budget on art direction, sourcing, and how upgrade parts read on screen.

Paste the whole thing.

---

```
PROJECT: Retroline Turbo — a web-first pseudo-3D arcade racer.
Live at https://retrolineturbo.netlify.app/

THE LOOK I'M AFTER — read this first, it governs every answer below:
"An SNES racer, if one were made in 2026." Not a museum reproduction of 1992 hardware,
and not a modern game with a pixel filter slapped on. I want the chunky, readable,
high-saturation sprite discipline of the SNES era executed with 2026 production values:
rock-solid 60fps, clean sub-pixel road scrolling, generous animation frames, and a
coherent palette across every asset. The lineage is Top Gear (SNES, 1992) and
Lotus Turbo Challenge for the road and camera, OutRun and TX-1 for the arcade
presentation, and Horizon Chase Turbo / Slipstream / 80's Overdrive for what "made
today" should mean in practice.

Critically: my road is SCANLINE SEGMENT PROJECTION (sprite-scaling, similar triangles,
S = d_screen/z), the Top Gear / OutRun technique — NOT Mode 7. Do not give me Mode 7 or
F-Zero / Mario Kart advice; the affine-texture-plane approach does not apply here.

STACK (fixed, not up for debate):
- TypeScript strict · Vite · Vitest. Only runtime dep is @supabase/supabase-js
  (used for saves/leaderboards only — NOT for asset hosting).
- Rendering: HTML5 Canvas 2D behind a `RenderBackend` interface. NO WebGL, NO Three.js,
  NO Pixi, no real 3D geometry at runtime.
- Logical framebuffer is a fixed 480×270, nearest-neighbour upscaled to the viewport
  (`image-rendering: pixelated`). All art is authored for that framebuffer.
- Physics is a deterministic fixed 1/60s accumulator, decoupled from render.
- Hosting: Netlify, continuous deploy from `main`. Everything in `public/` is served by
  Netlify's CDN as part of the Vite build. ASSET HOSTING IS A SOLVED PROBLEM — do not
  spend any of this research on CDNs, buckets, or storage backends.

HARD ENGINE RULES (any recommendation that violates these is unusable):
1. Zero external dependencies in the engine core — native browser APIs only.
2. Game code never touches a `ctx` directly; drawing goes through `RenderBackend`,
   whose methods take primitive args.
3. No per-frame allocation inside `render()`. Sprite pools and vectors pre-allocated.
4. ~200 Vitest unit tests run headless in Node with no DOM. Anything touching `Image`,
   `fetch`, `createImageBitmap`, or `OffscreenCanvas` must degrade gracefully to a
   procedural fallback rather than throw.

PERFORMANCE BUDGETS (desktop web / mobile web / hard limit):
- 60fps / 60fps / 55fps floor
- <150 quads per frame, hard cap 250
- 80 on-screen sprites desktop, 60 mobile, hard cap 100
- Heap <40MB desktop, <30MB mobile · Initial JS <1.5MB
Known budget-eroders to avoid: gradient fills, shadow blur, per-frame allocation,
oversized textures.

CURRENT ASSET STATE (what exists on disk today):
- `public/assets/backgrounds/` — three pre-rendered horizon plates: `city_night.png`
  (960×119), `coastal_sunset.png` (960×112), `desert_canyon.png` (960×99), plus
  `manifest.json` with id/file/width/height/skyColor per plate. Produced by
  `scripts/prep_backgrounds.py`: chroma-key crop → horizon crop → area downscale →
  palette quantise → mirror for seamless wrap. 14.7 MB of source art → 152 KB shipped.
  These three plates are my de facto palette reference — new art must sit beside them.
- `src/engine/loadBackdrops.ts` — the only backdrop code touching fetch/Image. It NEVER
  rejects: missing manifest, failed decode, or headless env all resolve to whatever
  loaded, and the renderer falls back to flat colour bands.
- `src/engine/Backdrop.ts` — pure pan/wrap/curvature math, unit-tested.
- `src/assets/spriteManifest.ts` + `generateSprites.ts` — sprites are currently
  PROCEDURAL: arrays of `{rx, ry, rw, rh, color}` fillRect ops baked into a boot canvas.
  This is why the game looks like coloured blocks and is exactly what I'm replacing.
- `src/assets/packAtlas.ts` — bin-packs generated frames into one atlas.
- `src/engine/SpriteAtlas.ts` — holds `{ image: CanvasImageSource, frames: FrameTable }`,
  exposes `frame(name): SpriteFrame`. Pure lookup, no drawing.
- IMPORTANT PRECEDENT: the HUD font is palette-baked. Canvas 2D has no cheap per-draw
  tint, so each font colour (white/magenta/cyan/red/gold/blue) is stored as its own
  complete glyph set in the atlas, keeping text at one drawSprite per character. Assume
  I will make the same trade again unless you can show me something better.

MODULE MAP (src/):
  types/ math/ engine/ physics/ input/ economy/ net/ ui/ track/ assets/ · scripts/
  engine/ holds RenderBackend, Canvas2DBackend, Renderer, Background, Backdrop,
  loadBackdrops, SpriteAtlas, TrackManager, BranchRenderer, Traffic, Collision.

WHERE I AM: Phase 7.5 — TX-1 arcade visuals and the hybrid asset pipeline.
Done: TX-1 blue HUD header (#000088) with 5-stage branching route tree and gold star
"PASSED CARS" gauge, pre-rendered horizon plates with seam-free wrap, overtake scoring.
Open: async PNG atlas loading, multi-angle car sprites (I plan to pre-render these from
CC0 low-poly models in Blender via `scripts/render_car_sprites.py`), roadside props,
high-contrast red/white kerbs, steering-frame selection.

PHASE 9 (next) — the modular upgrade economy, and the reason Task 4 matters.
Four part categories × 20 parts each = 80 parts. Vehicles start at a median 50/100
baseline on four metrics mapping to real physics fields:
  Engine → maxSpeed | Transmission → accel | Suspension → maxSteer | Wheels/Tyres → centrifugal
Parts are specialisations with trade-offs, not a strict ladder (a V8 twin-turbo raises
top speed but costs handling). I want equipping a part to FEEL like something, and
ideally to LOOK like something.

================================================================================

ROLE: You are a technical game artist and graphics engineer. Web search is enabled —
use it, and cite a source URL for every claim about a licence, an API, or a browser
behaviour. Where you're inferring rather than citing, say so. Be direct: if a premise
of mine is wrong, lead with that rather than burying it.

Answer these five tasks in order.

--------------------------------------------------------------------------------
TASK 1 — LOCK THE ART DIRECTION (do this first; everything else depends on it)

Turn "SNES racer made in 2026" into a specification I can hand to an artist or a
generator. Research how the reference games above actually look, and give me:

  a. PALETTE. The SNES could show 256 colours from a 32,768 master, with 15 colours +
     transparency per 4bpp sprite palette. How much of that discipline is worth keeping
     in 2026, and how much is pointless self-punishment? Propose a concrete master
     palette (hex list, grouped by role: road surface, kerb, sky gradient, foliage,
     chrome/metal, car body ramps, UI accent) that harmonises with my three existing
     horizon plates. Tell me how many ramp steps a car body needs to read as curved
     metal at the sizes in Task 3.

  b. PIXEL DENSITY — this is the question I most need answered. SNES was 256×224.
     My framebuffer is 480×270, roughly double the horizontal pixel count in a 16:9
     frame. If I author art at true SNES chunk size it reads small and fussy; if I
     author at 1:1 pixel-perfect for 480×270 it stops reading as "SNES." Where's the
     right point? Should I be authoring at a coarser virtual grid (2×2 pixel clusters)
     and enforcing that in the art rather than the resolution? What did Horizon Chase
     Turbo and Slipstream actually do here — they both target modern resolutions while
     reading as retro, so how?

  c. WHAT "2026" BUYS ME. Name the specific things I should do that 1992 hardware
     couldn't, that will make this look modern-retro rather than merely old: alpha
     blending, sprite counts, animation frame counts, sub-pixel scrolling, colour
     count, dithering choices, anything else. And name the things I must NOT do because
     they'd break the illusion.

  d. ROAD SURFACE. Given segment projection, how should kerbs, rumble strips, lane
     lines, and road-edge shoulders be coloured and banded so they read at 60fps
     without strobing as segments scroll? My current kerbs are #d02020 / #f0f0f0.
     Is alternating-band frequency a function of segment length or of screen-space
     distance, and what did Top Gear / OutRun do?

--------------------------------------------------------------------------------
TASK 2 — ASSET SHORTLIST (licensing is a hard gate)

Search Kenney.nl, OpenGameArt.org, itch.io, GitHub, and anywhere else credible.
CC0, CC-BY, or MIT ONLY. Explicitly REJECT anything CC-BY-NC, CC-BY-SA, or with an
unclear licence — and name what you rejected and why, if it was otherwise a strong
match. Quality over quantity: a short defensible list beats a long one.

Return a markdown table: Asset | Direct URL | Licence | Attribution required? |
Native resolution | Fits the Task 1 spec? | Notes

Cover:
  a. CC0/CC-BY low-poly 3D CAR MODELS (.blend/.glb/.fbx) suitable for Blender
     pre-rendering — open-wheel F1-style and GT/tourer silhouettes. This is my primary
     path for vehicles, so weight it accordingly. Note poly count and whether wheels
     are separate objects (I need to swap them — see Task 4).
  b. 2D rear-view car sprite sheets as a fallback, especially any that ship multiple
     steering angles.
  c. Roadside props: trees, palms, streetlights, billboards, signs, distance markers,
     tyre stacks, grandstands.
  d. Tiling horizon / parallax strips — mountains, skylines, clouds — that could sit
     BEHIND or IN FRONT of my existing plates as additional depth layers.
  e. Permissive pixel fonts, uppercase + digits, ≤8px, arcade-styled.

For each, state whether it needs recolouring into the Task 1 palette, and roughly how
much work that is.

--------------------------------------------------------------------------------
TASK 3 — VEHICLE SPRITE SPECIFICATION

I need the exact numbers for `scripts/render_car_sprites.py`.

  a. FRAME SIZE. Top Gear's player car occupies roughly a quarter of the screen width.
     At 480 wide that suggests ~120px. Confirm or correct that, and give me the source
     frame dimensions for the player car and for traffic cars.

  b. SCALE STEPS — the part I'm least sure about. A traffic car recedes from ~120px to
     ~10px as z increases. Nearest-neighbour downscaling of one detailed source frame
     shimmers and drops pixels inconsistently as z changes, which will crawl visibly at
     60fps. What's the correct fix: pre-baked discrete scale steps (a sprite mip chain)
     baked into the atlas at authoring time, quantising the runtime scale factor to a
     fixed ladder, or something else? How many steps, at what sizes, and how much atlas
     area does that cost me? Cite what sprite-scaling arcade hardware and modern
     pixel-art racers actually do.

  c. STEERING ANGLES. My spec assumes 5 (0°, ±15°, ±30°) plus skid and brake frames.
     Is 5 right for a rear view at this resolution, or do 3 plus a horizontal flip read
     identically to a player at 200km/h while halving my atlas? What about body roll on
     hard cornering — separate frames, or a vertical-offset trick?

  d. BLENDER RENDER SETTINGS. Camera height/distance/FOV for a rear chase view that
     matches segment-projection perspective, plus the shader setup (toon/cel, palette
     clamp, outline) that gets me clean SNES-style flats rather than muddy gradients
     that fight the Task 1 palette. Give me settings, not just concepts.

--------------------------------------------------------------------------------
TASK 4 — MAKE THE UPGRADE PARTS LOOK COOL

This is the one I care most about. 80 parts, and I refuse to draw 80 cars.

  a. BE HONEST ABOUT VISIBILITY. Which of Engine / Transmission / Suspension /
     Wheels-Tyres are actually visible from a rear chase camera at 480×270? I suspect
     the answer is "wheels clearly, engine partly via exhaust and intake, suspension
     only via ride height, transmission not at all." If a category is invisible, say so
     and tell me where that feedback belongs instead — HUD readout, engine note, garage
     screen, exhaust flame on shift, chassis squat under acceleration.

  b. LAYERING. Spec a base chassis frame plus separately-anchored overlay frames
     (wheels, exhaust, spoiler, intake). Give me the anchor-point scheme that keeps
     overlays registered across all steering angles and all scale steps from (3b) —
     this is the part that usually breaks. Then cost it: extra draw calls per car per
     frame, against my <150 quad budget with 60 on-screen sprites on mobile.

  c. COLOUR VARIATION. Rank these for a 60fps loop with no per-frame allocation, and
     pick one: pre-baked colour variants in the atlas (my existing font precedent),
     `globalCompositeOperation` tinting, a one-time offscreen tint cache built at load,
     per-pixel `ImageData` manipulation. Include the atlas-size cost of the pre-baked
     option at my chosen frame count.

  d. READABILITY AT SPEED. A player sees their own car for the whole race but a traffic
     car for two seconds. What level of part detail actually registers, and what's
     wasted work? Where should I spend the pixels?

  e. THE GARAGE SCREEN IS WHERE PARTS SELL THEMSELVES. Since most part detail is
     invisible at speed, how should the garage present an 80-part catalogue so
     upgrades feel meaningful — big hero render, rotating showcase, stat-diff bars,
     part icons? What did the games that did this well actually do?

--------------------------------------------------------------------------------
TASK 5 — LAYOUT

Two kinds, both matter.

  a. SCREEN COMPOSITION. Give me the 480×270 layout: horizon line height, how much
     vertical space the road gets versus sky versus HUD, where the player car sits,
     safe margins. My HUD is a TX-1-style solid blue (#000088) top header carrying a
     5-stage branching route tree, score, stage, timer, speed, and a gold star gauge.
     Does a top-heavy header work at 16:9, or should elements move to the corners the
     way OutRun and Top Gear did? Sketch it in ASCII with pixel coordinates.

  b. ATLAS LAYOUT. How to organise the sprite sheets themselves: one atlas or several
     (cars / props / UI / effects)? Frame ordering so related frames are cache-adjacent,
     padding and edge-bleed rules that stop nearest-neighbour sampling from pulling in
     neighbouring pixels, power-of-two versus tight packing, and a JSON manifest schema
     modelled on my existing `public/assets/backgrounds/manifest.json` shape. Include
     max atlas dimensions that are safe across mobile Safari and Chrome, cited.

================================================================================
OUTPUT: one document, five sections matching the tasks, sources cited inline.
Concrete numbers over general principles throughout — I am going to implement directly
from this. End with a "Decisions I need from you" list of anything you couldn't resolve.
```
