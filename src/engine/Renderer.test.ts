import { describe, it, expect } from 'vitest';
import { projectSegment, Renderer } from './Renderer.js';
import { TrackManager } from './TrackManager.js';
import { RecordingBackend } from './testing/RecordingBackend.js';
import {
  DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y, LOGICAL_WIDTH,
  DEFAULT_TRACK_CONFIG, COLORS,
} from '../constants.js';
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

describe('Renderer straight road surface', () => {
  it('emits road quads centred and shrinking near→far, in draw order', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG);
    const backend = new RecordingBackend();
    const cam: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };

    renderer.render(cam, track, backend);

    const road = backend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark);
    expect(road.length).toBeGreaterThan(10);
    // Centred on a straight road: every road quad's edges are symmetric about centre.
    for (const q of road) {
      expect(q.x1).toBeCloseTo(LOGICAL_WIDTH / 2, 6);
      expect(q.x2).toBeCloseTo(LOGICAL_WIDTH / 2, 6);
    }
    // Draw order near→far ⇒ each quad's top row (y1) is at or above the previous.
    for (let i = 1; i < road.length; i++) {
      expect(road[i]!.y1).toBeLessThanOrEqual(road[i - 1]!.y1);
    }
    // Far half-widths are smaller than near ones.
    expect(road[0]!.w2).toBeGreaterThan(road[road.length - 1]!.w1);
  });

  it('presents exactly once per render and clears first', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG);
    const backend = new RecordingBackend();
    const cam: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
    renderer.render(cam, track, backend);
    expect(backend.clears.length).toBe(1);
    expect(backend.presents).toBe(1);
  });
});
