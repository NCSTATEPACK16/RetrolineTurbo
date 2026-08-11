import { describe, it, expect } from 'vitest';
import {
  scaleFor,
  projectX,
  projectY,
  zAtScanline,
  stepZAccumulator,
  accumulateSegment,
  clipToCrest,
} from './projection.js';
import {
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  HORIZON_Y,
  DEFAULT_FOCAL_LENGTH,
  DEFAULT_CAMERA_HEIGHT,
} from '../constants.js';
import type { Camera } from '../types/engine.js';

const D = DEFAULT_FOCAL_LENGTH;
const H_CAM = DEFAULT_CAMERA_HEIGHT;

/** A level camera at the origin looking down the track. */
function levelCamera(): Camera {
  return { x: 0, z: 0, height: H_CAM, focalLength: D, horizon: HORIZON_Y };
}

describe('scaleFor (S = d/z)', () => {
  it('inverts to the focal length: S(d, z) * z === d', () => {
    for (const z of [1, 7, 42, 1000, 10000]) {
      expect(scaleFor(D, z) * z).toBeCloseTo(D, 9);
    }
  });

  it('is strictly decreasing and positive over z ∈ [1, 10000]', () => {
    let prev = Infinity;
    for (let z = 1; z <= 10000; z += 13) {
      const s = scaleFor(D, z);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });
});

describe('projectX / projectY', () => {
  it('maps a point on the camera axis to the frame centre', () => {
    const s = scaleFor(D, 500);
    expect(projectX(0, 0, s)).toBeCloseTo(LOGICAL_WIDTH / 2, 9);
  });

  it('places ground (worldY=0) below the horizon and equidistant edges symmetric', () => {
    const s = scaleFor(D, 500);
    const y = projectY(0, H_CAM, s);
    expect(y).toBeGreaterThan(HORIZON_Y); // ground is below the vanishing row (larger screen-y)
    // A point +w to the right and -w to the left are mirror images about centre.
    const right = projectX(10, 0, s);
    const left = projectX(-10, 0, s);
    expect(right - LOGICAL_WIDTH / 2).toBeCloseTo(LOGICAL_WIDTH / 2 - left, 9);
  });
});

describe('horizon collapse (z → ∞)', () => {
  it('a ground point converges to Y_horizon as depth grows', () => {
    const near = projectY(0, H_CAM, scaleFor(D, 10));
    const far = projectY(0, H_CAM, scaleFor(D, 1e6));
    const veryFar = projectY(0, H_CAM, scaleFor(D, 1e12));
    // Monotonically approaching the horizon from below (larger y → smaller y).
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(veryFar);
    expect(veryFar).toBeGreaterThan(HORIZON_Y);
    expect(veryFar).toBeCloseTo(HORIZON_Y, 3);
  });

  it('equals Y_horizon exactly in the scale → 0 limit', () => {
    expect(projectY(0, H_CAM, 0)).toBe(HORIZON_Y);
  });
});

describe('zAtScanline (z-map)', () => {
  it('round-trips the forward projection across several depths', () => {
    const cam = levelCamera();
    for (const z of [50, 200, 840, 5000, 10000]) {
      const screenY = projectY(0, cam.height, scaleFor(cam.focalLength, z));
      expect(zAtScanline(screenY, cam)).toBeCloseTo(z, 6);
    }
  });

  it('is strictly monotonic from the horizon toward the bottom of the frame', () => {
    const cam = levelCamera();
    let prev = Infinity;
    // As screenY increases (moves down from the horizon), depth decreases.
    for (let y = HORIZON_Y + 1; y <= LOGICAL_HEIGHT; y += 1) {
      const z = zAtScanline(y, cam);
      expect(z).toBeGreaterThan(0);
      expect(z).toBeLessThan(prev);
      prev = z;
    }
  });
});

describe('stepZAccumulator (z += dz; dz += ddz)', () => {
  it('matches the closed form z0 + n·dz0 + ddz·n(n−1)/2 after N steps', () => {
    const z0 = 3;
    const dz0 = 2;
    const ddz = 0.5;
    let state = { z: z0, dz: dz0 };
    for (let n = 1; n <= 20; n++) {
      state = stepZAccumulator(state, ddz);
      const expected = z0 + n * dz0 + (ddz * n * (n - 1)) / 2;
      expect(state.z).toBeCloseTo(expected, 9);
      expect(state.dz).toBeCloseTo(dz0 + n * ddz, 9);
    }
  });

  it('is deterministic and does not mutate its input', () => {
    const input = { z: 1, dz: 1 };
    const a = stepZAccumulator(input, 0.25);
    const b = stepZAccumulator(input, 0.25);
    expect(a).toEqual(b);
    expect(input).toEqual({ z: 1, dz: 1 }); // unchanged
  });
});

describe('accumulateSegment (dx += curve; x += dx; y += pitch)', () => {
  it('integrates a known curve/pitch sequence to the expected x and y', () => {
    // Constant curve K=1 from rest: dx = 1,2,3…; x = 1,3,6,10 (triangular).
    let state = { x: 0, dx: 0, y: 0 };
    const xs: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = accumulateSegment(state, 1, 2); // pitch +2 each step
      xs.push(state.x);
    }
    expect(xs).toEqual([1, 3, 6, 10]);
    expect(state.y).toBe(8); // 4 steps × pitch 2
    expect(state.dx).toBe(4);
  });

  it('does not mutate its input', () => {
    const input = { x: 5, dx: 1, y: 2 };
    accumulateSegment(input, 3, 4);
    expect(input).toEqual({ x: 5, dx: 1, y: 2 });
  });
});

describe('clipToCrest (painter crest occlusion; screen-y grows downward)', () => {
  it('discards a segment that is not above the current clip', () => {
    // clip at y=100 (a crest). A segment whose top projects lower (y=140) is hidden.
    const r = clipToCrest(100, 140);
    expect(r.visible).toBe(false);
    expect(r.clip).toBe(100); // clip unchanged
  });

  it('renders a higher segment and raises the clip toward the horizon', () => {
    const r = clipToCrest(100, 60);
    expect(r.visible).toBe(true);
    expect(r.clip).toBe(60); // clip moved up (smaller y)
  });

  it('is monotonic under repeated application: the clip never descends', () => {
    let clip = LOGICAL_HEIGHT; // start at the bottom of the frame
    for (const topY of [200, 150, 180, 90, 120, 40]) {
      const r = clipToCrest(clip, topY);
      expect(r.clip).toBeLessThanOrEqual(clip);
      clip = r.clip;
    }
    expect(clip).toBe(40); // ends at the highest crest seen
  });
});

describe('a horizon that is not the vertical centre', () => {
  const OFF = 118; // Spec A's target, deliberately != LOGICAL_HEIGHT / 2

  it('collapses to the given horizon in the scale -> 0 limit', () => {
    expect(projectY(0, H_CAM, 0, LOGICAL_HEIGHT, OFF)).toBe(OFF);
  });

  it('keeps ground below the horizon and rising toward it with depth', () => {
    const near = projectY(0, H_CAM, scaleFor(D, 10), LOGICAL_HEIGHT, OFF);
    const far = projectY(0, H_CAM, scaleFor(D, 1e6), LOGICAL_HEIGHT, OFF);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(OFF);
  });

  it('stays an exact inverse of zAtScanline — the invariant that was silently broken', () => {
    const cam: Camera = { x: 0, z: 0, height: H_CAM, focalLength: D, horizon: OFF };
    for (const z of [50, 200, 840, 5000, 10000]) {
      const y = projectY(0, cam.height, scaleFor(cam.focalLength, z), LOGICAL_HEIGHT, cam.horizon);
      expect(zAtScanline(y, cam)).toBeCloseTo(z, 6);
    }
  });

  it('defaults to the vertical centre when no horizon is supplied', () => {
    expect(projectY(0, H_CAM, 0)).toBe(LOGICAL_HEIGHT / 2);
  });
});
