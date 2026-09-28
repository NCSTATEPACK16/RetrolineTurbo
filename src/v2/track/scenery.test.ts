import { describe, it, expect } from 'vitest';
import { placeScenery, KERB_M, type SceneryKind } from './scenery.js';
import { buildSimTrack } from '../sim/track.js';
import { parseTrackFile, type CircuitLayout } from './schema.js';
import sunset from './circuits/sunset-beach.json';
import { SCENERY_KINDS } from '../view/sprites.js';

const track = buildSimTrack({ name: 't', halfWidth: 8, sections: [{ length: 500, curvature: 0 }] });
const layout = (scenery: CircuitLayout['scenery']): CircuitLayout =>
  ({ theme: 't', grid: { rows: 4, columns: 2, rowGap: 8, columnGap: 6 }, itemBoxes: [], coins: [], scenery, racingLine: null });

describe('scenery placement', () => {
  it('sizes sprites from world height and art aspect only', () => {
    const kinds: Record<string, SceneryKind> = {
      small: { heightM: 10, aspect: 0.5 }, // e.g. a 60x120 frame
      big: { heightM: 10, aspect: 0.5 }, // e.g. a 240x480 frame: same world size
    };
    const [a] = placeScenery(track, layout([{ sprite: 'small', side: 'left', from: 0, to: 1, every: 10, offset: 0 }]), kinds);
    const [b] = placeScenery(track, layout([{ sprite: 'big', side: 'left', from: 0, to: 1, every: 10, offset: 0 }]), kinds);
    expect(a!.width).toBe(5);
    expect(a!.height).toBe(10);
    expect(b!.width).toBe(a!.width);
  });

  it('spaces runs and sits sprites clear of the kerb on the requested sides', () => {
    const kinds = { post: { heightM: 2, aspect: 0.5 } };
    const placed = placeScenery(track, layout([{ sprite: 'post', side: 'both', from: 100, to: 150, every: 10, offset: 3 }]), kinds);
    expect(placed).toHaveLength(10);
    expect(placed.filter((p) => p.lat < 0)).toHaveLength(5);
    for (const p of placed) expect(Math.abs(p.lat) - p.width / 2).toBeCloseTo(8 + KERB_M + 3, 9);
  });

  it('names an unknown sprite', () => {
    expect(() => placeScenery(track, layout([{ sprite: 'ufo', side: 'left', from: 0, to: 1, every: 1, offset: 0 }]), {}))
      .toThrow(/no scenery sprite called "ufo"/);
  });

  it('places every Sunset Beach run with the shipped sprite set', () => {
    const c = parseTrackFile(sunset);
    const placed = placeScenery(buildSimTrack(c.def), c.layout, SCENERY_KINDS);
    expect(placed.length).toBeGreaterThan(40);
  });
});
