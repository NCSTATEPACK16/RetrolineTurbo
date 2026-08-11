import { describe, it, expect } from 'vitest';
import { overlayDest, type Rect } from './SpriteComposer.js';

const rect = (): Rect => ({ dx: 0, dy: 0, dw: 0, dh: 0 });

describe('overlayDest', () => {
  it('places a centre anchor at the body centre', () => {
    const out = rect();
    overlayDest(100, 50, 120, 72, 0.5, 0.5, 20, 10, false, out);
    expect(out.dx + out.dw / 2).toBeCloseTo(100 + 60, 5);
    expect(out.dy + out.dh / 2).toBeCloseTo(50 + 36, 5);
  });

  it('keeps registration across ladder steps from one normalised anchor', () => {
    // Same anchor, a 120px body and a 60px body: the overlay must land at the
    // same *fraction* of the body in both cases. This is the property that
    // makes one anchor cover all 12 steps.
    const big = rect();
    const small = rect();
    overlayDest(0, 0, 120, 72, 0.18, 0.92, 20, 10, false, big);
    overlayDest(0, 0, 60, 36, 0.18, 0.92, 10, 5, false, small);
    expect((big.dx + big.dw / 2) / 120).toBeCloseTo((small.dx + small.dw / 2) / 60, 5);
    expect((big.dy + big.dh / 2) / 72).toBeCloseTo((small.dy + small.dh / 2) / 36, 5);
  });

  it('MIRRORS the anchor on flip — the line that detaches overlays on left turns', () => {
    const flipped = rect();
    const plain = rect();
    overlayDest(0, 0, 120, 72, 0.18, 0.92, 20, 10, true, flipped);
    overlayDest(0, 0, 120, 72, 0.82, 0.92, 20, 10, false, plain);
    expect(flipped.dx).toBeCloseTo(plain.dx, 5);
    expect(flipped.dy).toBeCloseTo(plain.dy, 5);
  });

  it('is a no-op for a centred anchor under flip', () => {
    const a = rect();
    const b = rect();
    overlayDest(0, 0, 120, 72, 0.5, 0.4, 20, 10, false, a);
    overlayDest(0, 0, 120, 72, 0.5, 0.4, 20, 10, true, b);
    expect(b.dx).toBeCloseTo(a.dx, 5);
  });

  it('never mirrors the vertical anchor', () => {
    const a = rect();
    const b = rect();
    overlayDest(0, 0, 120, 72, 0.2, 0.9, 20, 10, false, a);
    overlayDest(0, 0, 120, 72, 0.2, 0.9, 20, 10, true, b);
    expect(b.dy).toBeCloseTo(a.dy, 5);
  });

  it('writes into the caller-owned rect without allocating', () => {
    const out = rect();
    const before = out;
    overlayDest(10, 20, 120, 72, 0.3, 0.7, 8, 8, false, out);
    expect(out).toBe(before);
  });
});
