import { describe, it, expect } from 'vitest';
import { RecordingBackend } from './RecordingBackend.js';

describe('RecordingBackend', () => {
  it('records quad, band, clear and present calls verbatim', () => {
    const b = new RecordingBackend();
    b.clear('#000');
    b.fillBand(10, 20, '#111');
    b.drawQuad(1, 2, 3, 4, 5, 6, '#222');
    b.present();

    expect(b.clears).toEqual(['#000']);
    expect(b.bands).toEqual([{ y: 10, h: 20, color: '#111' }]);
    expect(b.quads).toEqual([{ x1: 1, y1: 2, w1: 3, x2: 4, y2: 5, w2: 6, color: '#222' }]);
    expect(b.presents).toBe(1);
  });
});
