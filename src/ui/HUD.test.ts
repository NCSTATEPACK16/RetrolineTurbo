import { describe, it, expect } from 'vitest';
import { HUD, speedToKmh, formatTime } from './HUD.js';
import { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { packAtlas } from '../assets/packAtlas.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';
import { RecordingBackend } from '../engine/testing/RecordingBackend.js';
import { TrackManager } from '../engine/TrackManager.js';
import {
  DEFAULT_TRACK_CONFIG, DEFAULT_FOCAL_LENGTH, DEFAULT_CAMERA_HEIGHT, HORIZON_Y,
  HEADER_H, HUD_MARGIN, HUD_ROW_Y, LOGICAL_WIDTH, LOGICAL_HEIGHT,
} from '../constants.js';
import { PALETTE } from '../assets/palette.js';
import { RouteState } from '../track/route.js';
import type { Camera, PlayerState } from '../types/engine.js';

const atlas = new SpriteAtlas({} as CanvasImageSource, packAtlas(SPRITE_MANIFEST, 256).frames);
const camera: Camera = { x: 0, z: 0, height: DEFAULT_CAMERA_HEIGHT, focalLength: DEFAULT_FOCAL_LENGTH, horizon: HORIZON_Y };
const player: PlayerState = { z: 0, x: 0, speed: 6000, gear: 2, steer: 0, skidding: false, braking: false };

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
});

describe('HUD TX-1 header', () => {
  const track = new TrackManager(DEFAULT_TRACK_CONFIG);
  const draw = (route?: RouteState, passedCars = 0, points = 0): RecordingBackend => {
    const b = new RecordingBackend();
    new HUD(atlas).render(player, 0, track, camera, b, 42_000, route, passedCars, points);
    return b;
  };
  const starFrames = (b: RecordingBackend, name: 'star_on' | 'star_off'): number => {
    const f = atlas.frame(name);
    return b.sprites.filter((s) => s.sx === f.x && s.sy === f.y).length;
  };

  it('fills a solid blue header band across the top of the frame', () => {
    expect(draw().bands).toContainEqual({ y: 0, h: HUD.HEADER_H, color: HUD.HEADER_BG });
  });

  it('underlines the header with an accent border', () => {
    expect(draw().bands).toContainEqual({ y: HUD.HEADER_H, h: 1, color: HUD.HEADER_EDGE });
  });

  it('draws the score value in cyan glyphs', () => {
    const b = draw(undefined, 0, 1200);
    const one = atlas.frame('digit_1_cyan');
    expect(b.sprites.some((s) => s.sx === one.x && s.sy === one.y)).toBe(true);
  });

  it('draws the checkpoint countdown in red glyphs', () => {
    const b = draw();
    const four = atlas.frame('digit_4_red'); // "42" seconds remaining
    expect(b.sprites.some((s) => s.sx === four.x && s.sy === four.y)).toBe(true);
  });

  it('lights one star per overtaken car and leaves the rest unlit', () => {
    const b = draw(undefined, 3);
    expect(starFrames(b, 'star_on')).toBe(3);
    expect(starFrames(b, 'star_off')).toBe(HUD.STAR_SLOTS - 3);
  });

  it('caps the star gauge at its slot count', () => {
    const b = draw(undefined, 25);
    expect(starFrames(b, 'star_on')).toBe(HUD.STAR_SLOTS);
    expect(starFrames(b, 'star_off')).toBe(0);
  });

  it('draws one tree node per scene in the route pyramid', () => {
    const route = new RouteState(1);
    const b = draw(route);
    const nodes = b.quads.filter((q) => q.color === HUD.TREE_NODE
      || q.color === HUD.TREE_PATH || q.color === HUD.TREE_ACTIVE);
    expect(nodes.length).toBe(route.pyramid.flat().length); // 15 scenes
  });

  it('marks exactly one tree node as the active scene', () => {
    const b = draw(new RouteState(1));
    expect(b.quads.filter((q) => q.color === HUD.TREE_ACTIVE).length).toBe(1);
  });

  it('omits the tree when no route is supplied', () => {
    const b = draw();
    expect(b.quads.some((q) => q.color === HUD.TREE_ACTIVE)).toBe(false);
  });

  describe('TX-1 layout (research §5a)', () => {
    it('paints a 40px blue header band', () => {
      const header = draw().bands.find((b) => b.color === PALETTE.ui.header);
      expect(header).toBeDefined();
      expect(header!.y).toBe(0);
      expect(header!.h).toBe(HEADER_H);
    });

    it('moves SCORE and SPEED out of the header into the bottom corners', () => {
      const low = draw(undefined, 0, 4200).sprites.filter((s) => s.dy >= HUD_ROW_Y - 8);
      expect(low.length).toBeGreaterThan(0);
      // Some on the left, some on the right — the two corner readouts.
      expect(low.some((s) => s.dx < LOGICAL_WIDTH / 2)).toBe(true);
      expect(low.some((s) => s.dx > LOGICAL_WIDTH / 2)).toBe(true);
    });

    it('right-aligns the speed readout against the safe margin', () => {
      const b = draw();
      const right = Math.max(...b.sprites.map((s) => s.dx + s.dw));
      expect(right).toBeLessThanOrEqual(LOGICAL_WIDTH - HUD_MARGIN);
      expect(right).toBeGreaterThan(LOGICAL_WIDTH - HUD_MARGIN - 12); // actually flush, not merely inside
    });

    it('keeps every HUD glyph inside the safe margin', () => {
      for (const s of draw(new RouteState(1), 3, 4200).sprites) {
        expect(s.dx).toBeGreaterThanOrEqual(HUD_MARGIN);
        expect(s.dx + s.dw).toBeLessThanOrEqual(LOGICAL_WIDTH - HUD_MARGIN);
        expect(s.dy).toBeGreaterThanOrEqual(0);
        expect(s.dy + s.dh).toBeLessThanOrEqual(LOGICAL_HEIGHT - HUD_MARGIN);
      }
    });

    it('no longer draws the mini-map over the sky', () => {
      // The route tree carries stage position; TX-1 has no mini-map, and at
      // HEADER_H=40 the old strip landed at y=48, on top of the backdrop plate.
      const b = draw();
      expect(b.quads.every((q) => q.color !== '#e8e8f0')).toBe(true);
    });
  });
});
