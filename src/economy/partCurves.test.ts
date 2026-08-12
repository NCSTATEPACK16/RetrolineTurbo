import { describe, it, expect } from 'vitest';
import { PART_CATEGORIES } from '../types/inventory.js';
import {
  PART_TIERS, primaryMod, tradeoffMod, partCost, partUnlockStage, generateCatalog,
} from './partCurves.js';

describe('part curves', () => {
  it('primary gain rises with tier', () => {
    expect(primaryMod(1)).toBe(2);
    expect(primaryMod(20)).toBe(36);
    for (let t = 2; t <= PART_TIERS; t++) expect(primaryMod(t)).toBeGreaterThanOrEqual(primaryMod(t - 1));
  });

  it('trade-off penalty is free through tier 5 then bites', () => {
    for (let t = 1; t <= 5; t++) expect(tradeoffMod(t)).toBe(0);
    expect(tradeoffMod(6)).toBe(-1);
    expect(tradeoffMod(20)).toBe(-14);
  });

  it('cost grows geometrically from 400c', () => {
    expect(partCost(1)).toBe(400);
    expect(partCost(20)).toBe(43556);
  });

  it('unlock stage steps every five tiers and caps at 4', () => {
    expect(partUnlockStage(1)).toBe(0);
    expect(partUnlockStage(5)).toBe(0);
    expect(partUnlockStage(6)).toBe(1);
    expect(partUnlockStage(20)).toBe(3);
  });
});

describe('generateCatalog', () => {
  const catalog = generateCatalog();

  it('produces 80 parts, 20 per category, with unique ids', () => {
    expect(catalog).toHaveLength(80);
    for (const c of PART_CATEGORIES) expect(catalog.filter((p) => p.category === c)).toHaveLength(20);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(80);
  });

  it('names are drawable by the 3x5 font', () => {
    for (const p of catalog) expect(p.name).toMatch(/^[a-z0-9 .:-]+$/);
  });

  it('applies each category primary/trade-off pairing', () => {
    const engine20 = catalog.find((p) => p.id === 'engine-20')!;
    expect(engine20.speedMod).toBe(36);
    expect(engine20.handlingMod).toBe(tradeoffMod(20));
    expect(engine20.accelMod).toBe(0);
    expect(engine20.gripMod).toBe(0);

    const trans20 = catalog.find((p) => p.id === 'transmission-20')!;
    expect(trans20.accelMod).toBe(36);
    expect(trans20.speedMod).toBe(tradeoffMod(20));

    const susp20 = catalog.find((p) => p.id === 'suspension-20')!;
    expect(susp20.handlingMod).toBe(36);
    expect(susp20.gripMod).toBe(tradeoffMod(20));

    const wheels20 = catalog.find((p) => p.id === 'wheels-20')!;
    expect(wheels20.gripMod).toBe(36);
    expect(wheels20.speedMod).toBe(tradeoffMod(20));
  });

  it('is deterministic', () => {
    expect(generateCatalog()).toEqual(catalog);
  });
});
