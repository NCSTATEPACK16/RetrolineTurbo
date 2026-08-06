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
    clearRect: () => {},
    drawImage: () => {},
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
});
