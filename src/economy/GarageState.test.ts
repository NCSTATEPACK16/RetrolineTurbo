import { describe, it, expect } from 'vitest';
import { PART_CATALOG } from './partCurves.js';
import { MemorySaveBackend } from './save.js';
import { GarageState, GARAGE_SAVE_KEY, loadGarage, persistGarage } from './GarageState.js';

const part = (id: string) => PART_CATALOG.find((p) => p.id === id)!;

describe('GarageState part states', () => {
  it('locks parts behind route progress before price', () => {
    const g = new GarageState();
    g.credits = 1_000_000;
    g.bestStage = 0;
    expect(g.partState(part('engine-20'))).toBe('locked'); // unlockStage 3
    expect(g.partState(part('engine-01'))).toBe('purchasable');
  });

  it('reports unaffordable once unlocked but too dear', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 100;
    expect(g.partState(part('engine-20'))).toBe('unaffordable');
  });

  it('walks purchasable -> owned -> equipped', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 5000;
    const p = part('engine-01');
    expect(g.partState(p)).toBe('purchasable');
    expect(g.buy(p)).toBe(true);
    expect(g.credits).toBe(5000 - p.cost);
    expect(g.partState(p)).toBe('owned');
    expect(g.equip(p)).toBe(true);
    expect(g.partState(p)).toBe('equipped');
    expect(g.equipped.engine).toBe('engine-01');
  });

  it('refuses to buy what it cannot afford and to equip what it does not own', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 10;
    expect(g.buy(part('engine-01'))).toBe(false);
    expect(g.credits).toBe(10);
    expect(g.equip(part('engine-01'))).toBe(false);
    expect(g.equipped.engine).toBeNull();
  });

  it('equipping a second part in a category replaces the first', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 5000;
    g.buy(part('engine-01'));
    g.buy(part('engine-02'));
    g.equip(part('engine-01'));
    g.equip(part('engine-02'));
    expect(g.equipped.engine).toBe('engine-02');
    expect(g.owns('engine-01')).toBe(true); // still owned, just not fitted
  });
});

describe('GarageState bookkeeping', () => {
  it('award adds credits and noteStage only ratchets upward', () => {
    const g = new GarageState();
    g.award(1200);
    g.award(300);
    expect(g.credits).toBe(1500);
    g.noteStage(3);
    g.noteStage(1);
    expect(g.bestStage).toBe(3);
  });

  it('adopt hydrates ownership without charging credits', () => {
    const g = new GarageState();
    g.adopt('engine-07');
    expect(g.owns('engine-07')).toBe(true);
    expect(g.credits).toBe(0);
  });
});

describe('GarageState serialization', () => {
  it('round-trips through JSON', () => {
    const g = new GarageState();
    g.bestStage = 4;
    g.credits = 9000;
    g.buy(part('wheels-03'));
    g.equip(part('wheels-03'));
    const back = GarageState.fromJSON(JSON.stringify(g.toJSON()));
    expect(back.credits).toBe(g.credits);
    expect(back.bestStage).toBe(4);
    expect(back.equipped.wheels).toBe('wheels-03');
    expect(back.owns('wheels-03')).toBe(true);
  });

  it('falls back to defaults on missing or corrupt saves', () => {
    for (const raw of [null, '', 'not json', '{"credits":"lots"}', '[]']) {
      const g = GarageState.fromJSON(raw);
      expect(g.credits).toBe(0);
      expect(g.bestStage).toBe(0);
      expect(g.equipped.engine).toBeNull();
    }
  });

  it('round-trips through a SaveBackend', async () => {
    const save = new MemorySaveBackend();
    const g = new GarageState();
    g.award(2500);
    await persistGarage(save, g);
    expect(await save.get(GARAGE_SAVE_KEY)).not.toBeNull();
    expect((await loadGarage(save)).credits).toBe(2500);
  });
});
