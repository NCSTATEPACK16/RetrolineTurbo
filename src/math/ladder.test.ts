import { describe, it, expect } from 'vitest';
import { LADDER, ladderStepFor, OVERLAY_CULL_STEP, quantisedWidth } from './ladder.js';
import { PLAYER_CAR_WIDTH } from '../constants.js';

describe('LADDER', () => {
  it('has 12 steps ordered largest to smallest', () => {
    expect(LADDER).toHaveLength(12);
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i]!).toBeLessThan(LADDER[i - 1]!);
    }
  });

  it('spans 120px down to 10px (research §3b)', () => {
    expect(LADDER[0]).toBe(120);
    expect(LADDER.at(-1)).toBe(10);
  });

  it('starts at the player car width so Spec C can draw it at a native step', () => {
    // Spec A §5.4: the player car is drawn at PLAYER_CAR_WIDTH. Spec C draws it
    // from the atlas at LADDER[0]. If these drift the player car resamples.
    expect(LADDER[0]).toBe(PLAYER_CAR_WIDTH);
  });
});

describe('ladderStepFor', () => {
  it('returns the exact index for an exact ladder width', () => {
    LADDER.forEach((w, i) => expect(ladderStepFor(w)).toBe(i));
  });

  it('snaps to the NEAREST step, not the floor', () => {
    // Between 96 (idx 1) and 76 (idx 2): 90 is nearer 96, 80 is nearer 76.
    expect(ladderStepFor(90)).toBe(1);
    expect(ladderStepFor(80)).toBe(2);
  });

  it('clamps at both ends', () => {
    expect(ladderStepFor(1000)).toBe(0);
    expect(ladderStepFor(120.1)).toBe(0);
    expect(ladderStepFor(1)).toBe(LADDER.length - 1);
    expect(ladderStepFor(0)).toBe(LADDER.length - 1);
  });

  it('is monotonic: a wider sprite never gets a smaller-step index', () => {
    let prev = ladderStepFor(0);
    for (let w = 0; w <= 140; w += 0.5) {
      const idx = ladderStepFor(w);
      expect(idx).toBeLessThanOrEqual(prev);
      prev = idx;
    }
  });

  it('is total — degenerate input clamps instead of throwing', () => {
    expect(() => ladderStepFor(NaN)).not.toThrow();
    expect(ladderStepFor(NaN)).toBe(LADDER.length - 1);
    expect(ladderStepFor(-50)).toBe(LADDER.length - 1);
    expect(ladderStepFor(Infinity)).toBe(0);
  });

  it('culls overlays at a step small enough that nobody sees them', () => {
    expect(LADDER[OVERLAY_CULL_STEP]!).toBeLessThanOrEqual(30);
  });
});

describe('quantisedWidth', () => {
  it('reproduces the baked widths exactly inside the ladder range', () => {
    // Cars are drawn from frames baked at these widths; any drift here resamples
    // the very sprites the ladder exists to keep pixel-exact.
    LADDER.forEach((w) => expect(quantisedWidth(w)).toBe(w));
  });

  it('continues the same geometric series below the smallest baked step', () => {
    // Roadside props project well under 10px. Clamping them all to the ladder
    // floor would draw a sprite 300 segments away the same size as one 30
    // segments away, which reads as no depth at all.
    expect(quantisedWidth(6.5)).toBeLessThan(10);
    expect(quantisedWidth(6.5)).toBeGreaterThan(quantisedWidth(0.6));
    expect(quantisedWidth(0.6)).toBeGreaterThanOrEqual(1);
  });

  it('grows past the largest baked step rather than clamping', () => {
    expect(quantisedWidth(400)).toBeGreaterThan(LADDER[0]!);
  });

  it('is piecewise constant — the anti-shimmer property', () => {
    // Sweeping a sprite continuously toward the camera must produce long runs of
    // one width, not a new width every frame. That is the whole mechanism: with
    // imageSmoothingEnabled off, a width that changes every frame resamples at a
    // slightly different ratio every frame and the pixels crawl.
    let changes = 0;
    let prev = quantisedWidth(20);
    for (let i = 1; i <= 400; i++) {
      const w = quantisedWidth(20 + i * 0.25); // 20px -> 120px, continuously
      if (w !== prev) changes++;
      prev = w;
    }
    expect(changes).toBeLessThan(12); // ~8 geometric steps across that range
  });

  it('never returns a non-positive or non-finite width', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const w = quantisedWidth(bad);
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThan(0);
    }
  });
});
