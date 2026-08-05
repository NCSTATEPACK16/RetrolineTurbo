import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from './RenderBackend.js';

/**
 * Canvas 2D implementation of {@link RenderBackend} — the primary backend.
 *
 * All drawing happens on an offscreen buffer fixed at the logical resolution.
 * `present()` blits that buffer to the visible canvas at the largest integer
 * scale that fits, with image smoothing off, so the result is a crisp
 * nearest-neighbour upscale (the Pole Position pixel look) with fill cost
 * bounded independent of display size.
 *
 * Phase 0 wires up clear/present/resize (a blank frame). The segment/sprite
 * raster methods are intentional stubs, filled in from Phase 2 onward.
 */
export class Canvas2DBackend implements RenderBackend {
  private readonly out: CanvasRenderingContext2D;
  private readonly buffer: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(visible: HTMLCanvasElement) {
    const out = visible.getContext('2d');
    if (!out) throw new Error('Canvas2DBackend: 2D context unavailable on the visible canvas');
    this.out = out;

    const buffer = document.createElement('canvas');
    buffer.width = LOGICAL_WIDTH;
    buffer.height = LOGICAL_HEIGHT;
    const ctx = buffer.getContext('2d');
    if (!ctx) throw new Error('Canvas2DBackend: 2D context unavailable on the offscreen buffer');
    this.buffer = buffer;
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.out.imageSmoothingEnabled = false;
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }

  // --- Segment / sprite raster: stubbed until Phase 2+ ------------------------

  drawQuad(
    x1: number, y1: number, w1: number,
    x2: number, y2: number, w2: number,
    color: string,
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(x1 - w1, y1); // top-left
    this.ctx.lineTo(x1 + w1, y1); // top-right
    this.ctx.lineTo(x2 + w2, y2); // bottom-right
    this.ctx.lineTo(x2 - w2, y2); // bottom-left
    this.ctx.closePath();
    this.ctx.fill();
  }

  fillBand(y: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, y, LOGICAL_WIDTH, h);
  }

  drawSprite(
    _image: CanvasImageSource,
    _dx: number,
    _dy: number,
    _dw: number,
    _dh: number,
    _clipBottom: number,
  ): void {
    // Phase 4: depth-scaled sprites with hill-crest bottom clipping.
  }

  // --- Present / resize -------------------------------------------------------

  present(): void {
    this.out.clearRect(0, 0, this.out.canvas.width, this.out.canvas.height);
    this.out.drawImage(
      this.buffer,
      0,
      0,
      LOGICAL_WIDTH,
      LOGICAL_HEIGHT,
      0,
      0,
      LOGICAL_WIDTH * this.scale,
      LOGICAL_HEIGHT * this.scale,
    );
  }

  resize(cssWidth: number, cssHeight: number): void {
    // Largest integer multiple of the logical resolution that fits the box.
    const fit = Math.min(cssWidth / LOGICAL_WIDTH, cssHeight / LOGICAL_HEIGHT);
    this.scale = Math.max(1, Math.floor(fit));
    this.out.canvas.width = LOGICAL_WIDTH * this.scale;
    this.out.canvas.height = LOGICAL_HEIGHT * this.scale;
    // Backing-store resize resets context state; re-assert it.
    this.out.imageSmoothingEnabled = false;
  }
}
