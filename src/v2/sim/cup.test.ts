import { describe, it, expect } from 'vitest';
import { createCup, recordRace, standings, cupOver, pointsFor, POINTS, type CupDef } from './cup.js';
import type { ResultRow } from './race.js';

const CUP: CupDef = { name: 'Test Cup', rounds: [{ track: 'a' }, { track: 'a' }, { track: 'a' }] };
const race = (order: number[]): ResultRow[] => order.map((car, i) => ({ car, position: i + 1, timeSeconds: 60 + i }));

describe('cup points table', () => {
  it('awards points by finishing position, 8 places deep', () => {
    expect(POINTS).toHaveLength(8);
    expect(pointsFor(1)).toBe(15);
    expect(pointsFor(8)).toBe(1);
    expect(pointsFor(9)).toBe(0);
    for (let p = 1; p < 8; p++) expect(pointsFor(p)).toBeGreaterThan(pointsFor(p + 1));
  });

  it('accumulates across races and ranks the table', () => {
    const cup = createCup(CUP, 4);
    recordRace(cup, race([0, 1, 2, 3]));
    recordRace(cup, race([1, 0, 3, 2]));
    expect(cup.points).toEqual([27, 27, 18, 18]);
    expect(cupOver(cup)).toBe(false);
    // Ties go to the better finish in the latest race.
    expect(standings(cup).map((s) => s.car)).toEqual([1, 0, 3, 2]);
    recordRace(cup, race([3, 2, 1, 0]));
    expect(cupOver(cup)).toBe(true);
    expect(standings(cup)[0]).toEqual({ car: 1, points: 37, place: 1 });
    expect(() => recordRace(cup, race([0, 1, 2, 3]))).toThrow();
  });
});
