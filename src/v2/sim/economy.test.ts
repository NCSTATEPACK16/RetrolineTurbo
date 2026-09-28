import { describe, it, expect } from 'vitest';
import { newProfile, buy, equip, awardCup, raceCredits, parseProfile, isUnlocked } from './economy.js';
import { PART_BY_ID, STARTER_BUILD } from './parts.js';

describe('credits', () => {
  it('pay more for better finishes and for coins, scaled by class', () => {
    expect(raceCredits(1, 0, 100)).toBeGreaterThan(raceCredits(2, 0, 100));
    expect(raceCredits(8, 0, 100)).toBeGreaterThan(0);
    expect(raceCredits(4, 10, 100)).toBe(raceCredits(4, 0, 100) + 50);
    expect(raceCredits(1, 0, 150)).toBeGreaterThan(raceCredits(1, 0, 100));
    expect(raceCredits(1, 0, 50)).toBeLessThan(raceCredits(1, 0, 100));
  });
});

describe('garage profile', () => {
  it('starts with the starter parts equipped and nothing else', () => {
    const p = newProfile();
    expect(p.build).toEqual(STARTER_BUILD);
    for (const id of Object.values(STARTER_BUILD).filter((v) => v.includes('.'))) expect(p.owned).toContain(id);
    expect(p.owned).not.toContain('wheels.slick');
  });

  it('buys parts with credits, once, and only when it can afford them', () => {
    const p = newProfile();
    expect(buy(p, 'wheels.slick')).toBe('poor');
    p.credits = 1000;
    expect(buy(p, 'wheels.slick')).toBe('ok');
    expect(p.credits).toBe(1000 - PART_BY_ID.get('wheels.slick')!.price);
    expect(buy(p, 'wheels.slick')).toBe('owned');
    expect(buy(p, 'nope')).toBe('unknown');
  });

  it('only equips parts you own, in their own slot', () => {
    const p = newProfile();
    expect(equip(p, 'wheels', 'wheels.slick')).toBe(false);
    p.credits = 1000;
    buy(p, 'wheels.slick');
    expect(equip(p, 'wheels', 'wheels.slick')).toBe(true);
    expect(equip(p, 'body', 'wheels.slick')).toBe(false);
    expect(equip(p, 'paint', 'gold')).toBe(true);
    expect(equip(p, 'paint', 'plaid')).toBe(false);
  });

  it('trophy parts cannot be bought; a cup trophy unlocks them', () => {
    const p = newProfile();
    p.credits = 99999;
    expect(buy(p, 'engine.blower')).toBe('locked');
    expect(isUnlocked(p, PART_BY_ID.get('body.wedge')!)).toBe(false);
    const bronze = awardCup(p, 'Sunset Cup', 100, 3);
    expect(bronze).toEqual(['body.wedge']);
    const gold = awardCup(p, 'Sunset Cup', 100, 1);
    expect(gold.sort()).toEqual(['engine.blower', 'exhaust.stack']);
    expect(p.trophies).toEqual([{ cup: 'Sunset Cup', cls: 100, place: 1 }]);
    expect(awardCup(p, 'Sunset Cup', 100, 5)).toEqual([]);
  });

  it('rebuilds safely from stored data, dropping anything invalid', () => {
    const p = parseProfile({ credits: 250.7, owned: ['wheels.slick', 'hax', 7], build: { wheels: 'wheels.slick', body: 'body.wedge', paint: 'blue' }, trophies: [{ cup: 'x', cls: 3, place: 1 }] });
    expect(p.credits).toBe(250);
    expect(p.owned).toContain('wheels.slick');
    expect(p.owned).not.toContain('hax');
    expect(p.build.wheels).toBe('wheels.slick');
    expect(p.build.body).toBe(STARTER_BUILD.body); // not owned
    expect(p.build.paint).toBe('blue');
    expect(p.trophies).toEqual([]);
    expect(parseProfile('garbage')).toEqual(newProfile());
  });
});
