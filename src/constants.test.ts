import { describe, it, expect } from 'vitest';
import { COLORS } from './constants.js';
import { PALETTE } from './assets/palette.js';

describe('COLORS', () => {
  it('draws the kerb in high-contrast arcade red and white', () => {
    expect(COLORS.rumbleDark).toBe(PALETTE.kerb.red);
    expect(COLORS.rumbleLight).toBe(PALETTE.kerb.white);
  });

  it('keeps the two road greys close enough to read as texture, not stripes', () => {
    const lum = (h: string): number => {
      const n = parseInt(h.slice(1), 16);
      return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff);
    };
    expect(Math.abs(lum(COLORS.road) - lum(COLORS.roadDark))).toBeLessThan(12);
  });

  it('exposes a shoulder colour distinct from both kerb and road', () => {
    expect(COLORS.shoulder).toBe(PALETTE.road.shoulder);
    expect(COLORS.shoulder).not.toBe(COLORS.road);
    expect(COLORS.shoulder).not.toBe(COLORS.rumbleDark);
  });
});
