import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PART_CATEGORIES, type CarMetrics, type Part } from '../types/inventory.js';
import { generateCatalog } from './partCurves.js';

const SNAPSHOT = fileURLToPath(new URL('./parts.json', import.meta.url));
const serialize = (parts: Part[]): string => `${JSON.stringify(parts, null, 2)}\n`;

/**
 * Golden test over the committed catalog. The curves in partCurves.ts are the
 * source of truth; parts.json exists so any balance change lands as a readable
 * diff instead of disappearing into a formula. Regenerate with:
 *   UPDATE_PARTS=1 npm test
 */
describe('parts.json', () => {
  const catalog = generateCatalog();

  it('matches the generator output', () => {
    const text = serialize(catalog);
    if (process.env.UPDATE_PARTS === '1') {
      writeFileSync(SNAPSHOT, text);
    }
    expect(readFileSync(SNAPSHOT, 'utf8')).toBe(text);
  });
});

/** Best achievable value of one metric: pick the strongest part per category. */
function bestFor(metric: keyof CarMetrics, catalog: Part[]): CarMetrics {
  const key = `${metric}Mod` as 'speedMod' | 'accelMod' | 'handlingMod' | 'gripMod';
  const totals: CarMetrics = { speed: 50, accel: 50, handling: 50, grip: 50 };
  for (const category of PART_CATEGORIES) {
    const pick = catalog
      .filter((p) => p.category === category)
      .reduce((a, b) => (b[key] > a[key] ? b : a));
    totals.speed += pick.speedMod;
    totals.accel += pick.accelMod;
    totals.handling += pick.handlingMod;
    totals.grip += pick.gripMod;
  }
  return totals;
}

describe('balance guards', () => {
  const catalog = generateCatalog();
  const metrics: (keyof CarMetrics)[] = ['speed', 'accel', 'handling', 'grip'];

  it('every tier-20 part pays a real penalty', () => {
    for (const p of catalog.filter((x) => x.tier === 20)) {
      const mods = [p.speedMod, p.accelMod, p.handlingMod, p.gripMod];
      expect(Math.min(...mods)).toBeLessThan(0);
    }
  });

  it('no loadout leads on every metric — specializing in one costs another', () => {
    for (const a of metrics) {
      for (const b of metrics) {
        if (a === b) continue;
        // The build that maximizes `a` must be strictly worse at `b` than the
        // build that maximizes `b`. If this ever fails, one loadout dominates.
        expect(bestFor(a, catalog)[b]).toBeLessThan(bestFor(b, catalog)[b]);
      }
    }
  });
});
