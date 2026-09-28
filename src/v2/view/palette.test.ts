import { describe, it, expect } from 'vitest';
import { masterPalette, quantise, BAYER4, MAX_PALETTE } from './palette.js';

describe('v2 master palette', () => {
  const pal = masterPalette();

  it('collects the shared palette without duplicates, within the shader cap', () => {
    expect(pal.length).toBeGreaterThan(30);
    expect(pal.length).toBeLessThanOrEqual(MAX_PALETTE);
    expect(new Set(pal.map((c) => c.join())).size).toBe(pal.length);
  });

  it('refuses a palette larger than the shader supports', () => {
    const big = Array.from({ length: MAX_PALETTE + 1 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);
    expect(() => masterPalette(big)).toThrow(/supports/);
  });

  it('snaps every output onto a palette colour', () => {
    for (let i = 0; i < 200; i++) {
      const c: [number, number, number] = [(i * 37 % 255) / 255, (i * 91 % 255) / 255, (i * 13 % 255) / 255];
      const q = quantise(c, i, i * 3, pal, 0.06);
      expect(pal).toContainEqual([...q]);
    }
  });

  it('leaves exact palette colours alone when dithering is off', () => {
    for (const p of pal) expect([...quantise(p, 1, 2, pal, 0)]).toEqual(p);
  });

  it('dithers a mid-tone between its neighbours across a 4x4 tile', () => {
    const two: [number, number, number][] = [[0, 0, 0], [1, 1, 1]];
    let white = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (quantise([0.5, 0.5, 0.5], x, y, two, 1)[0] === 1) white++;
    expect(white).toBe(8);
  });

  it('uses a balanced Bayer table', () => {
    expect(BAYER4.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 9);
  });
});
