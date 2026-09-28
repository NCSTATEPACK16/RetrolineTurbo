import { describe, it, expect } from 'vitest';
import { internalResolution, integerScale } from './View.js';

describe('v2 low-res target sizing', () => {
  it('is 427x240 on 16:9 and 320x240 on 4:3', () => {
    expect(internalResolution(16 / 9)).toEqual({ width: 427, height: 240 });
    expect(internalResolution(4 / 3)).toEqual({ width: 320, height: 240 });
  });

  it('clamps extreme aspect ratios', () => {
    expect(internalResolution(3).width).toBe(427);
    expect(internalResolution(0.5).width).toBe(320);
  });

  it('upscales by the largest whole number that fits, never below 1', () => {
    expect(integerScale(1920, 1080, 427, 240)).toBe(4);
    expect(integerScale(1366, 768, 427, 240)).toBe(3);
    expect(integerScale(300, 200, 427, 240)).toBe(1);
  });
});
