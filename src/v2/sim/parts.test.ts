import { describe, it, expect } from 'vitest';
import { PARTS, PART_SLOTS, STARTER_BUILD, buildStats, dominates, type PartSlot } from './parts.js';
import { DEFAULT_STATS, STAT_KEYS } from './car.js';

function* everyBuild(): Generator<Record<PartSlot, string>> {
  const bySlot = PART_SLOTS.map((slot) => PARTS.filter((p) => p.slot === slot).map((p) => p.id));
  const walk = function* (i: number, acc: Record<string, string>): Generator<Record<PartSlot, string>> {
    if (i === PART_SLOTS.length) { yield { ...acc } as Record<PartSlot, string>; return; }
    for (const id of bySlot[i]!) yield* walk(i + 1, { ...acc, [PART_SLOTS[i]!]: id });
  };
  yield* walk(0, {});
}

describe('part catalogue', () => {
  it('offers at least three parts per slot', () => {
    for (const slot of PART_SLOTS) expect(PARTS.filter((p) => p.slot === slot).length).toBeGreaterThanOrEqual(3);
  });

  it('every part trades: its stat changes sum to zero', () => {
    for (const p of PARTS) expect(STAT_KEYS.reduce((a, k) => a + (p.stats[k] ?? 0), 0), p.id).toBe(0);
  });

  it('no part is strictly better than another in its slot', () => {
    for (const slot of PART_SLOTS) {
      const ps = PARTS.filter((p) => p.slot === slot);
      for (const a of ps) for (const b of ps) {
        const sa = { ...DEFAULT_STATS }, sb = { ...DEFAULT_STATS };
        for (const k of STAT_KEYS) { sa[k] += a.stats[k] ?? 0; sb[k] += b.stats[k] ?? 0; }
        expect(dominates(sa, sb), `${a.id} beats ${b.id}`).toBe(false);
      }
    }
  });

  it('no build is strictly best: every build is matched by one that beats it somewhere', () => {
    const builds = [...everyBuild()].map((b) => ({ b, s: buildStats(b) }));
    expect(builds.length).toBe(3 ** 5);
    for (const x of builds) {
      const dominatesAll = builds.every((y) => y === x || dominates(x.s, y.s));
      expect(dominatesAll, JSON.stringify(x.b)).toBe(false);
    }
    // And nothing is simply the best at everything: no build dominates more than a sliver of the rest.
    const worst = Math.max(...builds.map((x) => builds.filter((y) => dominates(x.s, y.s)).length));
    expect(worst / builds.length).toBeLessThan(0.1);
  });

  it('the free starter car is the stock car the balance gates use', () => {
    expect(buildStats(STARTER_BUILD)).toEqual(DEFAULT_STATS);
  });

  it('rejects a part in the wrong slot', () => {
    expect(() => buildStats({ ...STARTER_BUILD, body: 'wheels.stock' })).toThrow();
  });
});
