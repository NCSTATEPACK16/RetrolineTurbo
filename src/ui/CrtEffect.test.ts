import { describe, it, expect } from 'vitest';
import { CrtEffect, crtDefaultEnabled } from './CrtEffect.js';
import { CRT_MOBILE_MAX_WIDTH } from '../constants.js';

describe('crtDefaultEnabled', () => {
  it('defaults off at or under the mobile width threshold', () => {
    expect(crtDefaultEnabled(CRT_MOBILE_MAX_WIDTH)).toBe(false);
    expect(crtDefaultEnabled(CRT_MOBILE_MAX_WIDTH - 1)).toBe(false);
    expect(crtDefaultEnabled(320)).toBe(false); // a phone
  });

  it('defaults on above the mobile width threshold', () => {
    expect(crtDefaultEnabled(CRT_MOBILE_MAX_WIDTH + 1)).toBe(true);
    expect(crtDefaultEnabled(1920)).toBe(true); // a desktop
  });

  it('honours a custom threshold rather than only the constant default', () => {
    expect(crtDefaultEnabled(500, 400)).toBe(true);
    expect(crtDefaultEnabled(300, 400)).toBe(false);
  });
});

/** WebGL2 program compilation is a browser edge this suite's `node`
 * environment (vite.config.ts) cannot exercise for real — same boundary
 * SoundEngine.test.ts hits for AudioContext. What IS testable headlessly,
 * and matters just as much, is the "never throws, degrades cleanly" contract:
 * no WebGL2 support (getContext returns null) or a context that throws must
 * leave `supported` false and every method a safe no-op. */
function fakeCanvas(getContext: () => unknown): HTMLCanvasElement {
  return { getContext, width: 0, height: 0 } as unknown as HTMLCanvasElement;
}

describe('CrtEffect without WebGL2 support', () => {
  it('reports unsupported and never throws when getContext returns null', () => {
    const canvas = fakeCanvas(() => null);
    const crt = new CrtEffect(canvas);
    expect(crt.supported).toBe(false);
    expect(() => crt.resize(960, 540)).not.toThrow();
    expect(() => crt.render({} as CanvasImageSource)).not.toThrow();
  });

  it('reports unsupported and never throws when getContext itself throws', () => {
    const canvas = fakeCanvas(() => { throw new Error('context creation blocked'); });
    const crt = new CrtEffect(canvas);
    expect(crt.supported).toBe(false);
    expect(() => crt.resize(960, 540)).not.toThrow();
    expect(() => crt.render({} as CanvasImageSource)).not.toThrow();
  });

  it('reports unsupported and never throws when shader setup fails partway through', () => {
    // A minimal GL stub that returns null from createShader — simulates a
    // driver that grants a context but then refuses to compile anything.
    const gl = {
      createShader: () => null,
      createProgram: () => ({}),
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
    };
    const canvas = fakeCanvas(() => gl);
    const crt = new CrtEffect(canvas);
    expect(crt.supported).toBe(false);
    expect(() => crt.render({} as CanvasImageSource)).not.toThrow();
  });
});

describe('CrtEffect display settings', () => {
  it('defaults on, matching the shipped constants', () => {
    const crt = new CrtEffect(fakeCanvas(() => null)); // unsupported path is fine here
    const s = crt.getSettings();
    expect(s.scanline).toBe(true);
    expect(s.aberration).toBe(true);
    expect(s.bloom).toBeCloseTo(0.35);
  });

  it('setSettings merges partial updates and clamps bloom to 0..1', () => {
    const crt = new CrtEffect(fakeCanvas(() => null));
    crt.setSettings({ scanline: false });
    expect(crt.getSettings()).toEqual({ scanline: false, aberration: true, bloom: 0.35 });
    crt.setSettings({ bloom: 5 });
    expect(crt.getSettings().bloom).toBe(1);
    crt.setSettings({ bloom: -1 });
    expect(crt.getSettings().bloom).toBe(0);
  });

  it('never throws when settings change on an unsupported instance', () => {
    const crt = new CrtEffect(fakeCanvas(() => null));
    expect(() => crt.setSettings({ scanline: false, aberration: false, bloom: 0.1 })).not.toThrow();
    expect(() => crt.render({} as CanvasImageSource)).not.toThrow();
  });
});
