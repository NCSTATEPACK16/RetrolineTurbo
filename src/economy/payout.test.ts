import { describe, it, expect } from 'vitest';
import { computePayout, CLEAN_MULTIPLIER, FINISH_BONUS, STAGE_CREDITS, type RunSummary } from './payout.js';

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  stagesCleared: 0, finished: false, remainingMs: 0, points: 0, collisions: 1, ...over,
});

describe('computePayout', () => {
  it('pays nothing for an immediate crash-out', () => {
    expect(computePayout(run()).total).toBe(0);
  });

  it('pays per stage cleared', () => {
    expect(computePayout(run({ stagesCleared: 3 })).total).toBe(3 * STAGE_CREDITS);
  });

  it('adds the completion bonus only when the route is finished', () => {
    expect(computePayout(run({ stagesCleared: 5, finished: true })).total)
      .toBe(5 * STAGE_CREDITS + FINISH_BONUS);
    expect(computePayout(run({ stagesCleared: 5, finished: false })).total).toBe(5 * STAGE_CREDITS);
  });

  it('converts whole banked seconds at 10c and drops the remainder', () => {
    expect(computePayout(run({ remainingMs: 12_900 })).total).toBe(120);
  });

  it('ignores time remaining on an expired run', () => {
    expect(computePayout(run({ remainingMs: 30_000, finished: false })).total).toBe(300);
    // (an expired run always reports remainingMs 0 — this documents the arithmetic)
  });

  it('converts overtake points at 10 points per credit', () => {
    expect(computePayout(run({ points: 4000 })).total).toBe(400);
  });

  it('applies the clean-race multiplier only at zero collisions', () => {
    const dirty = computePayout(run({ stagesCleared: 4, collisions: 2 })).total;
    const clean = computePayout(run({ stagesCleared: 4, collisions: 0 })).total;
    expect(clean).toBe(Math.round(dirty * CLEAN_MULTIPLIER));
    expect(computePayout(run({ collisions: 0 })).cleanMultiplier).toBe(CLEAN_MULTIPLIER);
    expect(computePayout(run({ collisions: 1 })).cleanMultiplier).toBe(1);
  });

  it('itemizes every line for the summary screen, in display order', () => {
    const ledger = computePayout(run({ stagesCleared: 5, finished: true, remainingMs: 20_000, points: 3000, collisions: 0 }));
    expect(ledger.lines.map((l) => l.label))
      .toEqual(['stages cleared', 'route complete', 'time remaining', 'passed cars']);
    expect(ledger.lines.map((l) => l.credits)).toEqual([1250, 1000, 200, 300]);
    expect(ledger.total).toBe(Math.round(2750 * CLEAN_MULTIPLIER));
  });

  it('a strong clean run lands in the tuned 3-4k band', () => {
    const ledger = computePayout(run({ stagesCleared: 5, finished: true, remainingMs: 45_000, points: 4000, collisions: 0 }));
    expect(ledger.total).toBeGreaterThan(3000);
    expect(ledger.total).toBeLessThan(4000);
  });
});
