import { describe, it, expect } from 'vitest';
import {
  BACKDROP_LAYER_SPEED, BACKDROP_NEAR_SPEED,
  backdropIdForStage, backdropPan, backdropTiles, parseBackdropManifest, STAGE_BACKDROP_IDS,
} from './Backdrop.js';
import { LOGICAL_WIDTH } from '../constants.js';

describe('backdropIdForStage', () => {
  it('drives the journey out of the city, through the coast, into the desert', () => {
    expect(backdropIdForStage(0)).toBe('city_night');
    expect(backdropIdForStage(1)).toBe('city_night');
    expect(backdropIdForStage(2)).toBe('coastal_sunset');
    expect(backdropIdForStage(3)).toBe('desert_canyon');
    expect(backdropIdForStage(4)).toBe('desert_canyon');
  });

  it('clamps stages outside the pyramid to its ends', () => {
    expect(backdropIdForStage(-3)).toBe(STAGE_BACKDROP_IDS[0]);
    expect(backdropIdForStage(99)).toBe(STAGE_BACKDROP_IDS[STAGE_BACKDROP_IDS.length - 1]);
  });
});

describe('backdropPan', () => {
  it('wraps the pan into one plate width', () => {
    for (const x of [-50_000, -1, 0, 1, 12_345, 900_000]) {
      const pan = backdropPan(x, 0, 960);
      expect(pan).toBeGreaterThanOrEqual(0);
      expect(pan).toBeLessThan(960);
    }
  });

  it('shifts as the camera pans sideways', () => {
    expect(backdropPan(2000, 0, 960)).not.toBe(backdropPan(0, 0, 960));
  });

  it('adds a curvature term on top of the camera pan', () => {
    expect(backdropPan(0, 4, 960)).not.toBe(backdropPan(0, 0, 960));
  });
});

describe('parallax depth', () => {
  it('pans the near strip faster than the plate — that lead IS the depth cue', () => {
    expect(BACKDROP_NEAR_SPEED).toBeGreaterThan(BACKDROP_LAYER_SPEED);
  });

  it('wraps the near strip seamlessly like the plate', () => {
    const w = 960;
    for (const x of [0, 1234, -5678, 1e6]) {
      const pan = backdropPan(x, 0, w, BACKDROP_NEAR_SPEED);
      expect(pan).toBeGreaterThanOrEqual(0);
      expect(pan).toBeLessThan(w);
    }
  });

  it('moves the near strip further than the plate for the same camera pan', () => {
    const w = 960;
    // Compared before the wrap so the modulo can't mask the difference.
    const plate = Math.abs(backdropPan(1000, 0, w) - backdropPan(0, 0, w));
    const near = Math.abs(backdropPan(1000, 0, w, BACKDROP_NEAR_SPEED) - backdropPan(0, 0, w, BACKDROP_NEAR_SPEED));
    expect(near).toBeGreaterThan(plate);
  });
});

describe('backdropTiles', () => {
  const out = [0, 0, 0];

  it('covers the whole screen width with plate copies', () => {
    const n = backdropTiles(700, 960, LOGICAL_WIDTH, out);
    expect(n).toBeGreaterThanOrEqual(1);
    const right = out[n - 1]! + 960;
    expect(out[0]).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(LOGICAL_WIDTH);
  });

  it('needs a single copy when the plate starts flush at the left edge', () => {
    expect(backdropTiles(0, 960, LOGICAL_WIDTH, out)).toBe(1);
    expect(out[0]).toBe(0);
  });

  it('lays consecutive copies exactly one plate apart', () => {
    const n = backdropTiles(700, 960, LOGICAL_WIDTH, out);
    for (let i = 1; i < n; i++) expect(out[i]! - out[i - 1]!).toBe(960);
  });
});

describe('parseBackdropManifest', () => {
  const good = {
    backgrounds: [
      { id: 'city_night', name: 'City', file: 'backgrounds/city_night.png', width: 960, height: 119, skyColor: '#211958' },
    ],
  };

  it('reads the entries the prep script emits', () => {
    const metas = parseBackdropManifest(good);
    expect(metas).toHaveLength(1);
    expect(metas[0]!.id).toBe('city_night');
    expect(metas[0]!.width).toBe(960);
    expect(metas[0]!.skyColor).toBe('#211958');
  });

  it('drops entries missing the fields the renderer needs', () => {
    expect(parseBackdropManifest({ backgrounds: [{ id: 'x' }] })).toHaveLength(0);
  });

  it('returns nothing for a malformed document', () => {
    expect(parseBackdropManifest(null)).toEqual([]);
    expect(parseBackdropManifest({})).toEqual([]);
    expect(parseBackdropManifest('nope')).toEqual([]);
  });

  it('reads the optional near-strip block when the prep script emits one', () => {
    const withNear = {
      backgrounds: [{
        ...good.backgrounds[0],
        near: { file: 'backgrounds/city_night_near.png', width: 960, height: 48 },
      }],
    };
    const near = parseBackdropManifest(withNear)[0]!.near;
    expect(near).toBeDefined();
    expect(near!.file).toBe('backgrounds/city_night_near.png');
    expect(near!.height).toBe(48);
  });

  it('keeps the plate but drops a malformed near block', () => {
    // The near strip is decoration; losing it must never cost us the plate.
    const bad = { backgrounds: [{ ...good.backgrounds[0], near: { file: 'x' } }] };
    const metas = parseBackdropManifest(bad);
    expect(metas).toHaveLength(1);
    expect(metas[0]!.near).toBeUndefined();
  });
});
