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
    expect(sky!.h).toBeCloseTo(HORIZON_Y, 6);
    expect(ground!.y).toBeCloseTo(HORIZON_Y, 6);
    expect(ground!.y + ground!.h).toBeCloseTo(LOGICAL_HEIGHT, 6);
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
