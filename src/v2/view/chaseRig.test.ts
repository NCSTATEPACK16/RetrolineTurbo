import { describe, it, expect } from 'vitest';
import { CHASE_TUNING, initialChaseState, updateChase, crestSafeHeight, easeFactor, type ChaseInput } from './chaseRig.js';

const base: ChaseInput = { curvature: 0, speed: 0, topSpeed: 42, boosting: false, drifting: false };
const settle = (input: ChaseInput, seconds = 3, dt = 1 / 60) => {
  const s = initialChaseState();
  for (let t = 0; t < seconds; t += dt) updateChase(s, input, dt);
  return s;
};

describe('chase camera rig', () => {
  it('rolls into right-handers and left-handers, capped', () => {
    expect(settle({ ...base, curvature: 0.02, speed: 30 }).roll).toBeGreaterThan(0);
    expect(settle({ ...base, curvature: -0.02, speed: 30 }).roll).toBeLessThan(0);
    expect(settle({ ...base, curvature: 1, speed: 42 }).roll).toBeCloseTo(CHASE_TUNING.maxRoll, 3);
  });

  it('widens FOV with speed and more on boost', () => {
    const cruise = settle({ ...base, speed: 42 }).fov;
    const boost = settle({ ...base, speed: 42, boosting: true }).fov;
    expect(cruise).toBeCloseTo(CHASE_TUNING.fov + CHASE_TUNING.speedFov, 2);
    expect(boost).toBeCloseTo(cruise + CHASE_TUNING.boostFov, 2);
  });

  it('pulls in while drifting and releases after', () => {
    const s = settle({ ...base, drifting: true });
    expect(s.zoom).toBeCloseTo(CHASE_TUNING.driftZoom, 2);
    for (let i = 0; i < 180; i++) updateChase(s, base, 1 / 60);
    expect(s.zoom).toBeLessThan(0.01);
  });

  it('eases rather than snapping', () => {
    const s = initialChaseState();
    updateChase(s, { ...base, speed: 42, boosting: true }, 1 / 60);
    expect(s.fov).toBeGreaterThan(CHASE_TUNING.fov);
    expect(s.fov).toBeLessThan(CHASE_TUNING.fov + 2);
  });

  it('is frame-rate independent', () => {
    const at60 = settle({ ...base, speed: 42, boosting: true }, 0.5, 1 / 60).fov;
    const at144 = settle({ ...base, speed: 42, boosting: true }, 0.5, 1 / 144).fov;
    expect(Math.abs(at60 - at144)).toBeLessThan(0.1);
    expect(easeFactor(6, 0)).toBe(0);
  });

  it('never lets a crest between camera and car hide the car', () => {
    expect(crestSafeHeight(0, [0, 0, 0])).toBe(CHASE_TUNING.height);
    const y = crestSafeHeight(0, [0, 3, 2]);
    expect(y).toBeGreaterThanOrEqual(3 + CHASE_TUNING.crestClearance);
  });
});
