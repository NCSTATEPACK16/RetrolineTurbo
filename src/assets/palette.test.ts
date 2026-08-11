import { describe, it, expect } from 'vitest';
import { PALETTE, paletteEntryCount, coreEntryCount, CORE_MAX, PALETTE_BUDGET } from './palette.js';
import { FONT_COLORS, STAR_UNLIT } from './spriteManifest.js';

const HEX = /^#[0-9a-f]{6}$/;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff);
}

describe('palette', () => {
  it('uses lowercase 6-digit hex everywhere', () => {
    const walk = (v: unknown): void => {
      if (typeof v === 'string') expect(v).toMatch(HEX);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(PALETTE);
  });

  it('keeps the always-on-screen core inside the hard ceiling', () => {
    // The real 16-bit discipline: road + kerb + lane + outline + trunk + foliage
    // + chrome + ui composite in EVERY frame. Raising this is an art decision.
    expect(coreEntryCount()).toBeLessThanOrEqual(CORE_MAX);
    expect(CORE_MAX).toBe(28);
  });

  it('keeps the whole library inside the soft budget', () => {
    // Variable roles (body hues, per-stage sky ramps) are never all on screen at
    // once, so they are budgeted separately. Spec C raises PALETTE_BUDGET to 84.
    expect(paletteEntryCount()).toBeLessThanOrEqual(PALETTE_BUDGET);
  });

  it('gives every car body a 5-step ramp ordered dark to light', () => {
    for (const [hue, ramp] of Object.entries(PALETTE.body)) {
      expect(ramp, hue).toHaveLength(5);
      for (let i = 1; i < ramp.length; i++) {
        expect(luminance(ramp[i]!), `${hue} step ${i}`).toBeGreaterThan(luminance(ramp[i - 1]!));
      }
    }
  });

  it('records the shipped baked-in UI colours verbatim', () => {
    // Regression guard: 228 glyph frames and both star frames are already baked
    // against these. The palette RECORDS them; it does not get to redefine them.
    expect(PALETTE.ui.white).toBe(FONT_COLORS.white);
    expect(PALETTE.ui.magenta).toBe(FONT_COLORS.magenta);
    expect(PALETTE.ui.cyan).toBe(FONT_COLORS.cyan);
    expect(PALETTE.ui.red).toBe(FONT_COLORS.red);
    expect(PALETTE.ui.gold).toBe(FONT_COLORS.gold);
    expect(PALETTE.ui.blue).toBe(FONT_COLORS.blue);
    expect(PALETTE.ui.starOff).toBe(STAR_UNLIT);
  });

  it('keeps the chrome ramp at 5 steps', () => {
    expect(PALETTE.chrome).toHaveLength(5);
  });
});
