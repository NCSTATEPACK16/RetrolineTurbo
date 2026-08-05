import { describe, it, expect } from 'vitest';
import { projectSegment } from './Renderer.js';
import { DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y, LOGICAL_WIDTH } from '../constants.js';
import type { Camera } from '../types/engine.js';

const CAM: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
const ROAD_HALF = 2000;

describe('projectSegment', () => {
  it('centres a straight-ahead segment and shrinks its half-width with depth', () => {
    const near = projectSegment(0, 0, 400, CAM, ROAD_HALF);
    const far = projectSegment(0, 0, 4000, CAM, ROAD_HALF);
    expect(near.x).toBeCloseTo(LOGICAL_WIDTH / 2, 9); // centred on a straight
    expect(far.x).toBeCloseTo(LOGICAL_WIDTH / 2, 9);
    expect(near.w).toBeGreaterThan(far.w); // nearer road is wider
    expect(far.w).toBeGreaterThan(0);
    expect(near.y).toBeGreaterThan(far.y); // nearer ground is lower on screen (larger y)
    expect(far.y).toBeGreaterThan(HORIZON_Y); // ground stays below the horizon
  });

  it('shifts screen-x when the segment centre curves away from the camera axis', () => {
    const straight = projectSegment(0, 0, 1000, CAM, ROAD_HALF);
    const curved = projectSegment(500, 0, 1000, CAM, ROAD_HALF); // centre drifted +500 world
    expect(curved.x).toBeGreaterThan(straight.x);
  });
});
