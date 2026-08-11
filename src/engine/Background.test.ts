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

describe('Background with a backdrop plate', () => {
  const backdrop = { image: {} as CanvasImageSource, width: 960, height: 119, skyColor: '#211958' };

  it('draws no plate sprites when no backdrop is supplied', () => {
    const backend = new RecordingBackend();
    new Background().render(CAM, 0, backend);
    expect(backend.sprites).toHaveLength(0);
  });

  it('rests the plate bottom exactly on the horizon', () => {
    const backend = new RecordingBackend();
    new Background().render(CAM, 0, backend, backdrop);
    expect(backend.sprites.length).toBeGreaterThan(0);
    for (const s of backend.sprites) expect(s.dy + s.dh).toBe(HORIZON_Y);
  });

  it('fills the gap above a short plate with the plate sky colour', () => {
    // Must be genuinely shorter than the horizon to leave a gap at all. The
    // shared 119px fixture is the tallest shipped plate and now exceeds
    // HORIZON_Y (118) — see the tall-plate case below.
    const short = { ...backdrop, height: 90 };
    const backend = new RecordingBackend();
    new Background().render(CAM, 0, backend, short);
    const sky = backend.bands.find((b) => b.color === short.skyColor);
    expect(sky).toBeDefined();
    expect(sky!.y).toBe(0);
    expect(sky!.h).toBeCloseTo(HORIZON_Y - short.height, 6);
  });

  it('fills no gap band when the plate is taller than the horizon', () => {
    // At HORIZON_Y = 118 the 119px city_night plate overhangs the top of the
    // sky band; it is the header that overpaints it, not a fill.
    expect(backdrop.height).toBeGreaterThan(HORIZON_Y);
    const backend = new RecordingBackend();
    new Background().render(CAM, 0, backend, backdrop);
    expect(backend.bands.some((b) => b.color === backdrop.skyColor)).toBe(false);
  });

  it('still fills the ground band below the horizon', () => {
    const backend = new RecordingBackend();
    new Background().render(CAM, 0, backend, backdrop);
    const ground = backend.bands.find((b) => b.y === HORIZON_Y);
    expect(ground).toBeDefined();
    expect(ground!.y + ground!.h).toBeCloseTo(LOGICAL_HEIGHT, 6);
  });

  it('slides the plate horizontally as the camera pans', () => {
    const still = new RecordingBackend();
    const panned = new RecordingBackend();
    new Background().render(CAM, 0, still, backdrop);
    new Background().render({ ...CAM, x: 4000 }, 0, panned, backdrop);
    expect(panned.sprites[0]!.dx).not.toBe(still.sprites[0]!.dx);
  });

  it('draws the plate at native scale so the pixel art stays crisp', () => {
    const backend = new RecordingBackend();
    new Background().render(CAM, 0, backend, backdrop);
    for (const s of backend.sprites) {
      expect(s.dw).toBe(backdrop.width);
      expect(s.dh).toBe(backdrop.height);
    }
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
