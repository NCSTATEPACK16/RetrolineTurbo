import { describe, it, expect } from 'vitest';
import { ScoreState, OVERTAKE_POINTS } from './score.js';

describe('ScoreState', () => {
  it('starts with no passed cars and no points', () => {
    const s = new ScoreState();
    expect(s.passedCars).toBe(0);
    expect(s.points).toBe(0);
  });

  it('awards OVERTAKE_POINTS for a single overtake', () => {
    const s = new ScoreState();
    s.addOvertakes(1);
    expect(s.points).toBe(OVERTAKE_POINTS);
  });

  it('accumulates passed cars across calls', () => {
    const s = new ScoreState();
    s.addOvertakes(2);
    s.addOvertakes(3);
    expect(s.passedCars).toBe(5);
  });

  it('ignores a zero-overtake step', () => {
    const s = new ScoreState();
    s.addOvertakes(0);
    expect(s.points).toBe(0);
  });

  it('reset clears passed cars and points', () => {
    const s = new ScoreState();
    s.addOvertakes(4);
    s.reset();
    expect(s.passedCars).toBe(0);
    expect(s.points).toBe(0);
  });

  it('counts collisions and clears them on reset', () => {
    const s = new ScoreState();
    expect(s.collisions).toBe(0);
    s.addCollision();
    s.addCollision();
    expect(s.collisions).toBe(2);
    s.reset();
    expect(s.collisions).toBe(0);
  });
});
