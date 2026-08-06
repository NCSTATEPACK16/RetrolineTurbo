import { describe, it, expect } from 'vitest';
import { HUD, speedToKmh, formatTime } from './HUD.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { TrackManager } from '../engine/TrackManager.js';
import { DEFAULT_TRACK_CONFIG, DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y } from '../constants.js';
import type { Camera, PlayerState } from '../types/engine.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const camera: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
const player: PlayerState = { z: 0, x: 0, speed: 6000, gear: 2 };

describe('HUD helpers', () => {
  it('formatTime renders minutes:seconds.tenths', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(83400)).toBe('1:23.4');
  });
  it('speedToKmh scales world speed to a positive display number', () => {
    expect(speedToKmh(6000)).toBeGreaterThan(0);
  });
});

describe('HUD render', () => {
  it('draws one sprite per speed digit plus the gear digit', () => {
    const b = new RecordingBackend();
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    new HUD(atlas).render(player, 83400, track, camera, b);
    // speed "300" (3) + timer "1:23.4" (5 digits + 1 colon) + gear "2" (1) = 10 sprite calls min
    expect(b.sprites.length).toBeGreaterThanOrEqual(9);
  });
  it('draws the checkpoint countdown when remainingMs is supplied', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const without = new RecordingBackend();
    new HUD(atlas).render(player, 0, track, camera, without);
    const withCountdown = new RecordingBackend();
    new HUD(atlas).render(player, 0, track, camera, withCountdown, 42_000);
    expect(withCountdown.sprites.length).toBeGreaterThan(without.sprites.length); // "time 42" glyphs
  });
  it('draws a mini-map strip via quads', () => {
    const b = new RecordingBackend();
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    new HUD(atlas).render(player, 0, track, camera, b);
    expect(b.quads.length).toBeGreaterThan(0);
  });
});
