import { describe, it, expect } from 'vitest';
import type { PlayerState, Segment, Sprite, SpriteFrame } from './engine.js';

describe('engine domain types', () => {
  it('PlayerState is satisfiable by a plain readonly object', () => {
    const p: PlayerState = { z: 0, x: 0, speed: 0, gear: 1 };
    expect(p.gear).toBe(1);
  });

  it('Segment carries a sprite list keyed by atlas frame name', () => {
    const s: Sprite = { name: 'tree', offset: 1.4 };
    const seg: Segment = { index: 0, z: 0, curve: 0, pitch: 0, sprites: [s] };
    expect(seg.sprites[0]!.name).toBe('tree');
  });

  it('SpriteFrame carries an anchor for base-aligned billboards', () => {
    const f: SpriteFrame = { x: 0, y: 0, w: 8, h: 16, anchorX: 4, anchorY: 16 };
    expect(f.anchorY).toBe(16);
  });
});
