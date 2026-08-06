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
    // The track has a 60-segment straight lead-in before its first curve; keep
    // the whole rendered view inside it (drawDistance < 60) so "centred" is exact.
    const straightCfg = { ...DEFAULT_TRACK_CONFIG, drawDistance: 40 };
    const track = new TrackManager(straightCfg);
    const renderer = new Renderer(straightCfg);
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

describe('Renderer rumble + lane decoration', () => {
  it('alternates rumble colour by band and overlays road on rumble', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG);
    const backend = new RecordingBackend();
    const cam: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
    renderer.render(cam, track, backend);

    const rumbleColors = new Set(backend.quads.map((q) => q.color));
    expect(rumbleColors.has(COLORS.rumbleLight)).toBe(true);
    expect(rumbleColors.has(COLORS.rumbleDark)).toBe(true);
    expect(rumbleColors.has(COLORS.lane)).toBe(true);

    // For a given span the rumble quad is wider than the road quad and drawn earlier.
    const firstRoadIdx = backend.quads.findIndex((q) => q.color === COLORS.road || q.color === COLORS.roadDark);
    expect(firstRoadIdx).toBeGreaterThan(0);
    const rumbleBefore = backend.quads[firstRoadIdx - 1]!;
    const road = backend.quads[firstRoadIdx]!;
    expect(rumbleBefore.w1).toBeGreaterThan(road.w1);
  });
});

describe('Renderer curve + hill + occlusion (M2 track)', () => {
  const cam = (): Camera => ({ x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y });

  it('drifts road-quad centres away from screen centre through a curve', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG);
    const backend = new RecordingBackend();
    const c = cam();
    c.z = 60 * DEFAULT_TRACK_CONFIG.segmentLength; // park the camera at the curve entry
    renderer.render(c, track, backend);
    const road = backend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark);
    // Far quads bend off-centre: the farthest quad's centre differs from screen centre.
    const farthest = road[road.length - 1]!;
    expect(Math.abs(farthest.x1 - LOGICAL_WIDTH / 2)).toBeGreaterThan(1);
  });

  it('discards far segments hidden behind a crest (fewer quads than an equal flat run)', () => {
    const renderer = new Renderer(DEFAULT_TRACK_CONFIG);
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const segLen = DEFAULT_TRACK_CONFIG.segmentLength;

    // Occluded case: from the lead-in the hill crest (~segment 140) sits ahead in
    // the draw distance and hides the road beyond it.
    const cCrest = cam();
    cCrest.z = 0;
    const crestBackend = new RecordingBackend();
    renderer.render(cCrest, track, crestBackend);

    // Unoccluded reference: parked deep in the flat run-out after the crest, the
    // whole draw distance is level so nothing is occluded (full draw distance).
    const cFlat = cam();
    cFlat.z = 300 * segLen;
    const flatBackend = new RecordingBackend();
    renderer.render(cFlat, track, flatBackend);

    const crestRoad = crestBackend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark).length;
    const flatRoad = flatBackend.quads.filter((q) => q.color === COLORS.road || q.color === COLORS.roadDark).length;
    expect(crestRoad).toBeLessThan(flatRoad); // crest occluded the far road
  });
});
