import { describe, it, expect, vi, afterEach } from 'vitest';
import { Canvas2DBackend } from './Canvas2DBackend.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeCanvas(): { canvas: HTMLCanvasElement; ops: string[] } {
  const ops: string[] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    canvas: { width: 0, height: 0 },
    fillRect: (x: number, y: number, w: number, h: number) => ops.push(`fillRect ${x} ${y} ${w} ${h}`),
    beginPath: () => ops.push('beginPath'),
    moveTo: (x: number, y: number) => ops.push(`moveTo ${x} ${y}`),
    lineTo: (x: number, y: number) => ops.push(`lineTo ${x} ${y}`),
    closePath: () => ops.push('closePath'),
    fill: () => ops.push('fill'),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    rect: (x: number, y: number, w: number, h: number) => ops.push(`rect ${x} ${y} ${w} ${h}`),
    clip: () => ops.push('clip'),
    clearRect: () => {},
    drawImage: (_img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) =>
      ops.push(`drawImage ${sx} ${sy} ${sw} ${sh} ${dx} ${dy} ${dw} ${dh}`),
  };
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  // The suite runs in the `node` environment (no DOM). The constructor calls
  // `document.createElement('canvas')` for the offscreen buffer; stub a minimal
  // `document` that hands back the same fake context. (vi.unstubAllGlobals in
  // afterEach restores it.)
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }),
  });
  return { canvas, ops };
}

describe('Canvas2DBackend raster methods', () => {
  it('fillBand fills a full-width horizontal rectangle', () => {
    const { canvas, ops } = fakeCanvas();
    const b = new Canvas2DBackend(canvas);
    b.fillBand(10, 20, '#123');
    expect(ops).toContain('fillRect 0 10 480 20');
  });

  it('drawQuad traces the four trapezoid corners: top(x1±w1), bottom(x2±w2)', () => {
    const { canvas, ops } = fakeCanvas();
    const b = new Canvas2DBackend(canvas);
    b.drawQuad(100, 50, 10, 200, 150, 40, '#456');
    expect(ops).toContain('moveTo 90 50'); // top-left  = x1 - w1
    expect(ops).toContain('lineTo 110 50'); // top-right = x1 + w1
    expect(ops).toContain('lineTo 240 150'); // bottom-right = x2 + w2
    expect(ops).toContain('lineTo 160 150'); // bottom-left  = x2 - w2
    expect(ops).toContain('fill');
  });

  it('drawSprite blits the source rect into the dest rect', () => {
    const { canvas, ops } = fakeCanvas();
    const b = new Canvas2DBackend(canvas);
    const img = {} as CanvasImageSource;
    // clipBottom below the sprite bottom ⇒ no clip region needed.
    b.drawSprite(img, 1, 2, 8, 16, 100, 50, 16, 32, 270);
    expect(ops).toContain('drawImage 1 2 8 16 100 50 16 32');
    expect(ops).not.toContain('clip');
  });

  it('drawSprite honours clipBottom via save/clip/restore when the sprite crosses the crest', () => {
    const { canvas, ops } = fakeCanvas();
    const b = new Canvas2DBackend(canvas);
    const img = {} as CanvasImageSource;
    // dy + dh = 90; clipBottom 70 < 90 ⇒ must clip.
    b.drawSprite(img, 0, 0, 8, 16, 100, 50, 16, 40, 70);
    expect(ops).toContain('save');
    expect(ops).toContain('rect 0 0 480 70');
    expect(ops).toContain('clip');
    expect(ops).toContain('drawImage 0 0 8 16 100 50 16 40');
    expect(ops).toContain('restore');
    // clip is set up before the blit, restore after.
    expect(ops.indexOf('clip')).toBeLessThan(ops.indexOf('drawImage 0 0 8 16 100 50 16 40'));
    expect(ops.indexOf('drawImage 0 0 8 16 100 50 16 40')).toBeLessThan(ops.indexOf('restore'));
  });
});
