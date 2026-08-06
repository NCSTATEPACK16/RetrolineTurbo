import { describe, it, expect } from 'vitest';
import { branchSpread, fillRoadOffsets, chosenOffsetAtNode } from './BranchRenderer.js';
import type { BranchPoint } from '../types/engine.js';

const branch: BranchPoint = { startSegment: 100, splitDurationSegments: 60, ways: 2 };
const MAX = 5000;

describe('branchSpread', () => {
  it('is zero before the split window', () => {
    expect(branchSpread(0, branch, MAX)).toBe(0);
    expect(branchSpread(99, branch, MAX)).toBe(0);
    expect(branchSpread(100, branch, MAX)).toBe(0); // t = 0 at the start segment
  });
  it('reaches exactly maxSpread at and after the node', () => {
    expect(branchSpread(160, branch, MAX)).toBe(MAX);
    expect(branchSpread(500, branch, MAX)).toBe(MAX);
  });
  it('is strictly increasing inside the window', () => {
    let prev = branchSpread(100, branch, MAX);
    for (let i = 101; i <= 160; i++) {
      const s = branchSpread(i, branch, MAX);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });
  it('eases in (below the linear ramp at the midpoint)', () => {
    expect(branchSpread(130, branch, MAX)).toBeLessThan(MAX / 2);
  });
});

describe('fillRoadOffsets', () => {
  it('is a single centred road at zero spread', () => {
    const out = [9, 9, 9];
    expect(fillRoadOffsets(out, 2, 0)).toBe(1);
    expect(out[0]).toBe(0);
  });
  it('splits into ±spread for 2-way', () => {
    const out = [0, 0, 0];
    expect(fillRoadOffsets(out, 2, 1200)).toBe(2);
    expect(out[0]).toBe(-1200);
    expect(out[1]).toBe(1200);
  });
  it('keeps a centre road for 3-way', () => {
    const out = [0, 0, 0];
    expect(fillRoadOffsets(out, 3, 1200)).toBe(3);
    expect(out).toEqual([-1200, 0, 1200]);
  });
});

describe('chosenOffsetAtNode', () => {
  it('maps choices to road centres', () => {
    expect(chosenOffsetAtNode(0, 2, MAX)).toBe(-MAX);
    expect(chosenOffsetAtNode(1, 2, MAX)).toBe(MAX);
    expect(chosenOffsetAtNode(0, 3, MAX)).toBe(-MAX);
    expect(chosenOffsetAtNode(1, 3, MAX)).toBe(0);
    expect(chosenOffsetAtNode(2, 3, MAX)).toBe(MAX);
  });
});
