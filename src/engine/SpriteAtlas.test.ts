import { describe, it, expect } from 'vitest';
import { SpriteAtlas } from './SpriteAtlas.js';
import type { FrameTable } from '../types/engine.js';

const frames: FrameTable = { tree: { x: 1, y: 1, w: 16, h: 40, anchorX: 8, anchorY: 40 } };
const stubImage = {} as CanvasImageSource;

describe('SpriteAtlas', () => {
  it('returns the frame for a known name', () => {
    const atlas = new SpriteAtlas(stubImage, frames);
    expect(atlas.frame('tree').w).toBe(16);
  });
  it('throws a clear error for an unknown frame name', () => {
    const atlas = new SpriteAtlas(stubImage, frames);
    expect(() => atlas.frame('nope')).toThrow(/unknown sprite frame: nope/);
  });
  it('exposes the backing image for the backend to blit', () => {
    const atlas = new SpriteAtlas(stubImage, frames);
    expect(atlas.image).toBe(stubImage);
  });
});
