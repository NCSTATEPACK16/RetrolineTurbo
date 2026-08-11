import { describe, it, expect } from 'vitest';
import { parseAtlasManifest } from './AtlasManifest.js';

const valid = {
  id: 'cars', file: 'sprites/cars.png', width: 2048, height: 1024,
  frames: [{
    id: 'gt_red_a0_s0', x: 0, y: 0, w: 120, h: 72,
    car: 'gt', color: 'red', angle: 0, step: 0,
    anchors: { wheelBL: [0.18, 0.92], exhaust: [0.5, 0.98] },
  }],
};

describe('parseAtlasManifest', () => {
  it('parses a well-formed manifest', () => {
    const m = parseAtlasManifest(valid)!;
    expect(m.id).toBe('cars');
    expect(m.frames).toHaveLength(1);
    expect(m.frames[0]!.anchors.wheelBL).toEqual([0.18, 0.92]);
  });

  it('ignores unknown fields so the bake script can add metadata freely', () => {
    const m = parseAtlasManifest({ ...valid, generatedAt: '2026-08-10', tris: 2900 })!;
    expect(m.frames).toHaveLength(1);
  });

  it('drops malformed frames individually rather than failing the atlas', () => {
    const m = parseAtlasManifest({
      ...valid,
      frames: [valid.frames[0], { id: 'bad', x: 'nope' }, { w: 1 }],
    })!;
    expect(m.frames).toHaveLength(1);
  });

  it('returns null for structurally unusable input', () => {
    expect(parseAtlasManifest(null)).toBeNull();
    expect(parseAtlasManifest(42)).toBeNull();
    expect(parseAtlasManifest({})).toBeNull();
    expect(parseAtlasManifest({ ...valid, frames: 'nope' })).toBeNull();
  });

  it('never throws, for any input', () => {
    const cyclic: Record<string, unknown> = { id: 'x' };
    cyclic.self = cyclic;
    for (const input of [undefined, NaN, [], '', cyclic, Symbol('s')]) {
      expect(() => parseAtlasManifest(input)).not.toThrow();
    }
  });

  it('tolerates a frame with no anchors', () => {
    const noAnchors = { ...valid.frames[0] } as Record<string, unknown>;
    delete noAnchors.anchors;
    const m = parseAtlasManifest({ ...valid, frames: [noAnchors] })!;
    expect(m.frames[0]!.anchors).toEqual({});
  });
});
