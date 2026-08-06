import type { RenderBackend } from '../RenderBackend.js';

export interface QuadCall { x1: number; y1: number; w1: number; x2: number; y2: number; w2: number; color: string; }
export interface BandCall { y: number; h: number; color: string; }

/**
 * A {@link RenderBackend} that records every call instead of drawing. Lets the
 * headless test suite assert on projected geometry, draw order, and occlusion
 * without a real canvas. Test-support only — never imported by production code.
 */
export class RecordingBackend implements RenderBackend {
  readonly clears: string[] = [];
  readonly quads: QuadCall[] = [];
  readonly bands: BandCall[] = [];
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

  drawSprite(): void {
    // Phase 4 — not exercised by Phase 2/3 tests.
  }

  present(): void {
    this.presents++;
  }

  resize(): void {
    // no-op for the headless double
  }
}
