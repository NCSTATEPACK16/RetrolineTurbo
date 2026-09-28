import palette from '../../assets/palette.json';

/** Hard cap on colours the post shader searches (uniform array size). */
export const MAX_PALETTE = 64;

/** Every colour in the shared master palette, deduplicated, as sRGB [0..1] triples. */
export function masterPalette(src: unknown = palette): [number, number, number][] {
  const seen = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (/^#[0-9a-f]{6}$/i.test(v)) seen.add(v.toLowerCase());
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(src);
  const out = [...seen].map((hex): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]);
  if (out.length > MAX_PALETTE) throw new Error(`palette has ${out.length} colours; the shader supports ${MAX_PALETTE}`);
  return out;
}

/** 4x4 Bayer matrix, normalised to [-0.5, 0.5). Mirrors the shader's table. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

/**
 * Reference implementation of the post shader's quantiser (the GLSL mirrors
 * it line for line) so the look is unit-testable: nudge by the ordered-dither
 * threshold for this pixel, then snap to the nearest palette entry.
 */
export function quantise(
  rgb: readonly [number, number, number], px: number, py: number,
  pal: readonly (readonly [number, number, number])[], spread: number,
): readonly [number, number, number] {
  const d = BAYER4[(py & 3) * 4 + (px & 3)]! * spread;
  const r = rgb[0] + d, g = rgb[1] + d, b = rgb[2] + d;
  let best = pal[0]!;
  let bestD = Infinity;
  for (const p of pal) {
    // Weighted RGB distance — cheap, and close enough to perceptual for 48 flat colours.
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (dist < bestD) { bestD = dist; best = p; }
  }
  return best;
}
