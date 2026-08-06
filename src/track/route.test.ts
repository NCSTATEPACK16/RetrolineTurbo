import { describe, it, expect } from 'vitest';
import {
  buildPyramid, sceneTrack, resolveFork, nextSceneIdx, RouteState,
  STAGES, INITIAL_TIME_MS, STAGE_TIME_BONUS_MS,
} from './route.js';
import { parseTrackFile } from './schema.js';

const ROAD = 2000;

describe('buildPyramid', () => {
  it('has 5 stages with 1..5 scenes (15 total), deterministic seeds', () => {
    const p = buildPyramid(1);
    expect(p.length).toBe(STAGES);
    let total = 0;
    for (let s = 0; s < STAGES; s++) {
      expect(p[s]!.length).toBe(s + 1);
      total += p[s]!.length;
      p[s]!.forEach((plan, i) => {
        expect(plan.stage).toBe(s);
        expect(plan.idx).toBe(i);
      });
    }
    expect(total).toBe(15);
    expect(buildPyramid(1)).toEqual(buildPyramid(1));
    expect(buildPyramid(1)[0]![0]!.seed).not.toBe(buildPyramid(2)[0]![0]!.seed);
  });
});

describe('sceneTrack', () => {
  it('every scene in the pyramid validates; stages 0-3 fork, stage 4 does not', () => {
    const p = buildPyramid(1);
    for (const stage of p) {
      for (const plan of stage) {
        const file = sceneTrack(plan);
        const r = parseTrackFile(file);
        expect(r.ok, `${plan.name}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
        if (!r.ok) continue;
        if (plan.stage < STAGES - 1) {
          expect(file.branchPoint).toBeTruthy();
          const node = file.branchPoint!.startSegment + file.branchPoint!.splitDurationSegments;
          expect(node).toBeLessThan(r.track.totalSegments);
        } else {
          expect(file.branchPoint ?? null).toBeNull();
        }
      }
    }
  });
});

describe('resolveFork', () => {
  it('2-way: sign of x decides', () => {
    expect(resolveFork(-1, 2, ROAD)).toBe(0);
    expect(resolveFork(1, 2, ROAD)).toBe(1);
    expect(resolveFork(0, 2, ROAD)).toBe(1); // centre defaults right (x < 0 → A rule)
  });
  it('3-way: thresholds at half the road width', () => {
    expect(resolveFork(-1001, 3, ROAD)).toBe(0);
    expect(resolveFork(-999, 3, ROAD)).toBe(1);
    expect(resolveFork(999, 3, ROAD)).toBe(1);
    expect(resolveFork(1001, 3, ROAD)).toBe(2);
  });
});

describe('nextSceneIdx', () => {
  it('2-way: left keeps i, right takes i+1, clamped to the next stage', () => {
    expect(nextSceneIdx(0, 0, 2, 2)).toBe(0);
    expect(nextSceneIdx(0, 1, 2, 2)).toBe(1);
    expect(nextSceneIdx(3, 1, 2, 5)).toBe(4);
    expect(nextSceneIdx(4, 1, 2, 5)).toBe(4); // clamp at the right edge
  });
  it('3-way maps i-1 | i | i+1 with clamping', () => {
    expect(nextSceneIdx(1, 0, 3, 3)).toBe(0);
    expect(nextSceneIdx(1, 1, 3, 3)).toBe(1);
    expect(nextSceneIdx(1, 2, 3, 3)).toBe(2);
    expect(nextSceneIdx(0, 0, 3, 3)).toBe(0); // clamp at the left edge
  });
});

describe('RouteState', () => {
  it('walks always-left to ending 0 and always-right to ending 4', () => {
    const left = new RouteState(1);
    for (let s = 0; s < STAGES - 1; s++) left.advance(0);
    expect(left.stage).toBe(4);
    expect(left.sceneIdx).toBe(0);
    left.finish();
    expect(left.finished).toBe(true);
    expect(left.endingIdx).toBe(0);

    const right = new RouteState(1);
    for (let s = 0; s < STAGES - 1; s++) right.advance(1);
    expect(right.sceneIdx).toBe(4);
    right.finish();
    expect(right.endingIdx).toBe(4);
  });
  it('records the visited path', () => {
    const r = new RouteState(1);
    r.advance(1); r.advance(0); r.advance(1);
    expect(r.visited).toEqual([0, 1, 1]);
    expect(r.stage).toBe(3);
    expect(r.sceneIdx).toBe(2);
  });
  it('starts with the initial time and extends on advance', () => {
    const r = new RouteState(1);
    expect(r.remainingMs).toBe(INITIAL_TIME_MS);
    r.advance(0);
    expect(r.remainingMs).toBe(INITIAL_TIME_MS + STAGE_TIME_BONUS_MS);
  });
  it('ticks down to expiry, but never expires after finishing', () => {
    const r = new RouteState(1);
    r.tick(INITIAL_TIME_MS - 1);
    expect(r.expired).toBe(false);
    r.tick(100);
    expect(r.expired).toBe(true);

    const f = new RouteState(1);
    f.finish();
    f.tick(INITIAL_TIME_MS * 2);
    expect(f.expired).toBe(false); // timer frozen on the ending screen
    expect(f.remainingMs).toBe(INITIAL_TIME_MS);
  });
  it('currentPlan tracks stage/scene', () => {
    const r = new RouteState(1);
    expect(r.currentPlan().stage).toBe(0);
    r.advance(1);
    expect(r.currentPlan().stage).toBe(1);
    expect(r.currentPlan().idx).toBe(1);
  });
});
