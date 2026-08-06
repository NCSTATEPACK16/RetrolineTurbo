import { describe, it, expect } from 'vitest';
import { Background, layerOffset } from './Background.js';
import { RecordingBackend } from './testing/RecordingBackend.js';
import { COLORS, LOGICAL_HEIGHT, HORIZON_Y, DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT } from '../constants.js';
import type { Camera } from '../types/engine.js';

const CAM: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };

describe('Background bands', () => {
  it('fills a sky band above the horizon and a ground band below it', () => {
    const b = new Background();
    const backend = new RecordingBackend();
    b.render(CAM, 0, backend);

    const sky = backend.bands.find((x) => x.color === COLORS.sky);
    const ground = backend.bands.find((x) => x.color === COLORS.groundDark || x.color === COLORS.groundLight);
    expect(sky).toBeDefined();
    expect(ground).toBeDefined();
    expect(sky!.y).toBe(0);
    // Sky now occupies the upper 60% down to the horizon; a hill band fills the
    // remaining 40% (Task 9). The last full-height ground band still spans
    // [horizon, LOGICAL_HEIGHT].
    expect(sky!.h).toBeCloseTo(HORIZON_Y * 0.6, 6);
    const groundFull = backend.bands.find((x) => x.y === HORIZON_Y);
    expect(groundFull).toBeDefined();
    expect(groundFull!.y + groundFull!.h).toBeCloseTo(LOGICAL_HEIGHT, 6);
  });
});

describe('layerOffset', () => {
  it('combines camera pan and curvature into a horizontal shift', () => {
    // pan-only: proportional to cameraX * speed
    expect(layerOffset(1000, 0, 0.002)).toBeCloseTo(2, 6);
    // curvature adds on top
    expect(layerOffset(0, 500, 0.002)).not.toBe(0);
    // zero inputs ⇒ zero offset
    expect(layerOffset(0, 0, 0.002)).toBe(0);
  });
});

describe('Background parallax panning', () => {
  it('shifts layer bands horizontally as the camera pans, faster for nearer layers', () => {
    const b = new Background();
    const backend0 = new RecordingBackend();
    const backendPan = new RecordingBackend();
    const cam0: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
    const camPan: Camera = { ...cam0, x: 5000 };
    b.render(cam0, 0, backend0);
    b.render(camPan, 0, backendPan);
    // Panning must change what is drawn (band count/positions differ from the static frame).
    expect(JSON.stringify(backendPan.bands)).not.toBe(JSON.stringify(backend0.bands));
  });
});
