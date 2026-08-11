# Gemini Asset Generation Prompt Guide for Retroline Turbo

> **Document:** `docs/gemini_asset_prompts_guide.md`  
> **Target Style:** 16-Bit / 32-Bit Arcade Pixel Art (Tatsumi *TX-1*, *OutRun*, *Slipstream*, *Horizon Chase*)  
> **Use Case:** Copy-pasteable Gemini prompts to generate vehicles, NPC traffic cars, horizon skylines, roadside billboards, and garage upgrade part icons.  

---

## 1. Master Style Modifiers (Always Include)

To ensure all generated assets share the exact same retro arcade aesthetic, include these master visual tags in your prompts:

```
Style: 16-bit arcade pixel art sprite, crisp pixel edges, vibrant retro color palette, SEGA OutRun and Tatsumi TX-1 aesthetic, 1980s 2D arcade video game graphics, flat solid lighting, clean solid magenta (#FF00FF) background for chroma-key removal, no antialiasing, no blur, high contrast.
```

---

## 2. Vehicle & NPC Traffic Prompts

When generating racing cars, specify the exact **rear perspective view**, car livery color, open-wheel F1 frame, and turn angle.

### Prompt 2.1: Player F1 Racer (Rear View - Straight)
```text
16-bit arcade pixel art sprite of a Formula 1 racing car, rear perspective view facing forward down the track. Aerodynamic bright red chassis with white racing stripes, wide exposed black rubber rear tires with dark tread lines, low rear wing spoiler, driver helmet visible in dark central cockpit, dual rear exhaust pipes. Solid magenta background (#FF00FF) for sprite extraction. Crisp pixels, retro 1980s arcade style, high contrast, clean outline.
```

### Prompt 2.2: Player F1 Racer (Rear View - Turning Left)
```text
16-bit arcade pixel art sprite of a Formula 1 racing car angled 20 degrees to the left, rear-three-quarter perspective view. Aerodynamic bright red body, chassis leaning into the left curve, visible left tire tread angle, low rear spoiler wing, driver helmet tilted slightly. Solid magenta background (#FF00FF). Crisp retro arcade pixels, vibrant colors.
```

### Prompt 2.3: Opponent F1 Racer - Purple Livery (NPC Traffic)
```text
16-bit arcade pixel art sprite of a Formula 1 racing car, rear perspective view. Metallic purple chassis with neon yellow accent lines, wide black rear tires, elevated rear spoiler, driver in cockpit. Solid magenta background (#FF00FF). Retro 80s arcade racing game style, crisp pixel edges.
```

### Prompt 2.4: Opponent F1 Racer - Cyan Blue Livery (NPC Traffic)
```text
16-bit arcade pixel art sprite of a Formula 1 open-wheel race car, rear perspective view. Bright cyan blue body with white number decal, wide rear tires, exposed suspension rods, low rear wing. Solid magenta background (#FF00FF). Crisp arcade pixels.
```

### Prompt 2.5: GT Supercar Traffic - Yellow Livery (NPC Traffic)
```text
16-bit arcade pixel art sprite of a retro 1980s GT supercar, rear view showing twin red taillights lit, dual chrome exhaust pipes, wide rear tires, bright yellow body with black rear diffuser. Solid magenta background (#FF00FF). Crisp 80s arcade style.
```

---

## 3. Horizon Scenery & Parallax Backdrop Prompts

Generate panoramic horizon backdrops at wide aspect ratios ($16:9$).

### Prompt 3.1: TX-1 City Nightscape Skyline (Stage 1 Default)
```text
Seamless 16-bit arcade pixel art horizon backdrop of a retro 1980s city skyline at twilight. Dark navy blue sky with subtle purple gradient, distant silhouetted skyscrapers, suspension bridge, and radio tower with glowing warm yellow, orange, and white illuminated window pixels. Flat pixel art style, SEGA OutRun and Tatsumi TX-1 aesthetic, wide panorama, no foreground objects, pixelated retro look.
```

### Prompt 3.2: Coastal Sunset Skyline (Stage 2)
```text
Seamless 16-bit arcade pixel art horizon backdrop of a tropical coastline at sunset. Vibrant gradient sky from deep magenta to warm golden yellow, silhouetted palm trees along ocean horizon, calm water reflections in low-res pixel art. 80s synthwave arcade aesthetic, SEGA OutRun style, wide panoramic backdrop.
```

### Prompt 3.3: Desert Canyon & Sunset Skyline (Stage 3)
```text
Seamless 16-bit arcade pixel art horizon backdrop of a desert highway canyon at dusk. Layered red rock mesas and mountain ridge silhouettes against a deep orange and violet twilight sky. Retro 16-bit arcade pixel art style, clean horizontal layers for parallax scrolling.
```

---

## 4. Roadside Props & Billboard Prompts

### Prompt 4.1: Streetlight / Lamp Post Sprite
```text
16-bit arcade pixel art sprite of an avenue highway streetlight lamp post. Tall thin metallic silver pole with an angled top fixture emitting a soft warm yellow pixel glow downward. Solid magenta background (#FF00FF) for sprite extraction. Crisp pixel edges, retro 80s arcade style.
```

### Prompt 4.2: Retro Arcade Sponsor Billboard
```text
16-bit arcade pixel art billboard banner sprite on double steel posts. Billboard graphics feature a bold yellow and blue "RETRO TURBO 290" racing logo with checkered flag accents. Solid magenta background (#FF00FF). Crisp 80s arcade game sprite.
```

### Prompt 4.3: Roadside Fork Direction Sign
```text
16-bit arcade pixel art highway sign sprite on posts. White board with red border containing two bold black arrows splitting left and right for a highway route fork. Solid magenta background (#FF00FF). 16-bit arcade style, crisp pixel edges.
```

---

## 5. Garage Upgrade Part Icons (Phase 9 Prep)

Generate square $1:1$ inventory icons on dark backgrounds for the Post-Race Garage Shop.

### Prompt 5.1: Twin-Turbo V6 Engine Block
```text
16-bit pixel art icon of a high-performance twin-turbo V6 engine block. Metallic silver cylinder heads, red valve covers, chrome intake manifold, orange turbocharger pipes. Dark charcoal background box (#101018). Crisp 16-bit arcade UI icon, vibrant highlights.
```

### Prompt 5.2: Racing Soft Compound Tires
```text
16-bit pixel art icon of a slick racing tire mounted on a gold alloy wheel rim. Black rubber tire with red sidewall lettering, 5-spoke gold rim. Dark charcoal background box (#101018). Crisp arcade UI icon style.
```

### Prompt 5.3: Sport Performance Suspension Coilover
```text
16-bit pixel art icon of a racing suspension coilover damper. Bright red coil spring, metallic chrome shock body, anodized blue top mount. Dark charcoal background box (#101018). Retro arcade UI icon.
```

---

## 6. How to Extract & Import Generated Sprites into Retroline Turbo

1. **Generate Image in Gemini**: Copy any prompt above and generate the image.
2. **Remove Solid Background**: Run the automated Python script `scripts/trim_alpha.py` (which removes solid `#FF00FF` magenta backgrounds) or use an online tool like Remove.bg / Photopea.
3. **Save to Asset Folder**: Place the output transparent PNG files into `public/assets/sprites/` in Retroline Turbo.
4. **Update Frame Manifest**: Add the sprite coordinates and dimensions to `src/assets/spriteManifest.ts`.
