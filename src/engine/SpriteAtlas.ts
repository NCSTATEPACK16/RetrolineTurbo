import type { FrameTable, SpriteFrame } from '../types/engine.js';

/** Holds a generated atlas image and its frame table. Pure lookups only —
 * no drawing, no ctx. The image is opaque to the engine (blitted by the backend). */
export class SpriteAtlas {
  constructor(readonly image: CanvasImageSource, private readonly frames: FrameTable) {}

  frame(name: string): SpriteFrame {
    const f = this.frames[name];
    if (!f) throw new Error(`SpriteAtlas: unknown sprite frame: ${name}`);
    return f;
  }
}
