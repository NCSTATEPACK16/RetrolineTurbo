import { describe, it, expect } from 'vitest';
import { stepAccumulator } from './loop.js';
import { STEP_MS, MAX_FRAME_MS } from '../constants.js';

describe('stepAccumulator', () => {
  it('runs exactly one step for a nominal 60Hz frame', () => {
    const { steps, remainder } = stepAccumulator(0, STEP_MS, STEP_MS);
    expect(steps).toBe(1);
    expect(remainder).toBeCloseTo(0, 9);
  });

  it('runs three steps for a ~50ms frame and carries the remainder', () => {
    const { steps, remainder } = stepAccumulator(0, 50, STEP_MS);
    expect(steps).toBe(3); // 50 / 16.666… = 3 whole steps
    expect(remainder).toBeCloseTo(50 - 3 * STEP_MS, 9);
    expect(remainder).toBeGreaterThanOrEqual(0);
    expect(remainder).toBeLessThan(STEP_MS);
  });

  it('carries leftover time across frames without losing or gaining steps', () => {
    // Two 10ms frames total 20ms → one step over two frames, then more.
    const a = stepAccumulator(0, 10, STEP_MS);
    expect(a.steps).toBe(0);
    const b = stepAccumulator(a.remainder, 10, STEP_MS);
    expect(b.steps).toBe(1);
    expect(a.remainder + 10 - b.steps * STEP_MS).toBeCloseTo(b.remainder, 9);
  });

  it('clamps a long stall to prevent a spiral of death', () => {
    const { steps } = stepAccumulator(0, 5000, STEP_MS);
    // Without the clamp this would be ~300 steps; clamped to MAX_FRAME_MS.
    expect(steps).toBe(Math.floor(MAX_FRAME_MS / STEP_MS));
  });

  it('treats negative deltas as zero elapsed time', () => {
    const { steps, remainder } = stepAccumulator(0, -100, STEP_MS);
    expect(steps).toBe(0);
    expect(remainder).toBe(0);
  });

  it('is deterministic — identical inputs yield identical output', () => {
    const first = stepAccumulator(4.2, 33.3, STEP_MS);
    const second = stepAccumulator(4.2, 33.3, STEP_MS);
    expect(second).toEqual(first);
  });
});
