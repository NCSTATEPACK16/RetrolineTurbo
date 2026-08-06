import type { RenderBackend } from '../RenderBackend.js';

export interface QuadCall { x1: number; y1: number; w1: number; x2: number; y2: number; w2: number; color: string; }
export interface BandCall { y: number; h: number; color: string; }
export interface SpriteCall {
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
  clipBottom: number;
}

/**
 * A {@link RenderBackend} that records every call instead of drawing. Lets the
 * headless test suite assert on projected geometry, draw order, and occlusion
 * without a real canvas. Test-support only — never imported by production code.
 */
export class RecordingBackend implements RenderBackend {
  readonly clears: string[] = [];
  readonly quads: QuadCall[] = [];
  readonly bands: BandCall[] = [];
  readonly sprites: SpriteCall[] = [];
  presents = 0;

  clear(color: string): void {
    this.clears.push(color);
  }

  drawQuad(x1: number, y1: number, w1: number, x2: number, y2: number, w2: number, color: string): void {
    this.quads.push({ x1, y1, w1, x2, y2, w2, color });
  }

  fillBand(y: number, h: number, color: string): void {
    this.bands.push({ y, h, color });
  }

  drawSprite(
    _image: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    clipBottom: number,
  ): void {
    this.sprites.push({ sx, sy, sw, sh, dx, dy, dw, dh, clipBottom });
  }

  present(): void {
    this.presents++;
  }

  resize(): void {
    // no-op for the headless double
  }
}
