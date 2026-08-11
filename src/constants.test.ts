import { describe, it, expect } from 'vitest';
import { COLORS } from './constants.js';
import { PALETTE } from './assets/palette.js';
import {
  HORIZON_Y, HEADER_H, HUD_MARGIN, HUD_ROW_Y,
  PLAYER_CAR_BASE_Y, PLAYER_CAR_WIDTH, LOGICAL_WIDTH, LOGICAL_HEIGHT,
} from './constants.js';

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

describe('screen layout (research §5a)', () => {
  it('puts the horizon just above vertical centre', () => {
    expect(HORIZON_Y).toBe(118);
    expect(HORIZON_Y).toBeLessThan(LOGICAL_HEIGHT / 2);
  });

  it('keeps the TX-1 header shallow so it does not eat the sky', () => {
    expect(HEADER_H).toBe(40);
    expect(HEADER_H / LOGICAL_HEIGHT).toBeLessThan(0.16);
  });

  it('leaves a usable sky band between header and horizon', () => {
    // 78 rows. NOTE this is deliberately LESS than the tallest plate (city_night,
    // 119px) — plates rest their bottom edge on the horizon and let the header
    // overpaint the top. Spec D's far parallax layer is what must fit in 78.
    expect(HORIZON_Y - HEADER_H).toBeGreaterThanOrEqual(78);
  });

  it('keeps corner readouts inside the safe margin', () => {
    expect(HUD_MARGIN).toBeGreaterThanOrEqual(6);
    expect(HUD_ROW_Y).toBeLessThanOrEqual(LOGICAL_HEIGHT - HUD_MARGIN - 5);
  });

  it('sits the player car in the lower third with road visible below it', () => {
    expect(PLAYER_CAR_BASE_Y).toBe(232);
    expect(LOGICAL_HEIGHT - PLAYER_CAR_BASE_Y).toBeGreaterThanOrEqual(30);
    expect(PLAYER_CAR_WIDTH).toBe(120);
    expect(PLAYER_CAR_WIDTH / LOGICAL_WIDTH).toBeCloseTo(0.25, 1);
  });
});
