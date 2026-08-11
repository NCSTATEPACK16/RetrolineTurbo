import { describe, it, expect } from 'vitest';
import {
  Effects, EFFECT_NAMES, MAX_PARTICLES, STREAK_SPEED_FRACTION,
  buildEffectSet, particleAlpha, streakAlpha,
} from './Effects.js';
import { RecordingBackend } from './testing/RecordingBackend.js';
import type { AtlasFrameMeta } from './AtlasManifest.js';
import type { PlayerState } from '../types/engine.js';

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  z: 0, x: 0, speed: 0, gear: 1, steer: 0, skidding: false, braking: false, ...over,
});

/** Synthetic manifest frames in the shape pack_atlas.py emits for effects.png. */
const frames: AtlasFrameMeta[] = EFFECT_NAMES.flatMap((name, n) =>
  [0, 1, 2].map((step) => ({
    id: `${name}_std_a0_s${step}`, x: n * 40 + step * 10, y: 0, w: 8, h: 8,
    car: name, color: 'std', angle: 0, step, anchors: {},
  })));

describe('streakAlpha', () => {
  it('shows nothing below the threshold — streaks are a speed cue, not decoration', () => {
    expect(streakAlpha(0, 100)).toBe(0);
    expect(streakAlpha(100 * STREAK_SPEED_FRACTION * 0.5, 100)).toBe(0);
  });

  it('ramps in rather than popping on at the threshold', () => {
    const max = 100;
    const at = (f: number): number => streakAlpha(max * f, max);
    expect(at(STREAK_SPEED_FRACTION)).toBeCloseTo(0, 6);
    expect(at((STREAK_SPEED_FRACTION + 1) / 2)).toBeGreaterThan(0);
    expect(at((STREAK_SPEED_FRACTION + 1) / 2)).toBeLessThan(1);
  });

  it('never exceeds 1, even past the top speed', () => {
    expect(streakAlpha(1e9, 100)).toBeLessThanOrEqual(1);
    expect(streakAlpha(100, 100)).toBeCloseTo(1, 6);
  });

  it('returns 0 rather than NaN for a zero or bogus max speed', () => {
    // The render loop must never draw with a NaN alpha; canvas would throw.
    for (const max of [0, -1, NaN, Infinity]) expect(streakAlpha(50, max)).toBe(0);
  });
});

describe('particleAlpha', () => {
  it('fades from full to nothing across the particle lifetime', () => {
    expect(particleAlpha(0, 1)).toBeCloseTo(1, 6);
    expect(particleAlpha(0.5, 1)).toBeGreaterThan(0);
    expect(particleAlpha(0.5, 1)).toBeLessThan(1);
    expect(particleAlpha(1, 1)).toBeCloseTo(0, 6);
  });

  it('clamps outside the lifetime instead of going negative', () => {
    expect(particleAlpha(5, 1)).toBe(0);
    expect(particleAlpha(-1, 1)).toBeLessThanOrEqual(1);
    expect(particleAlpha(0.5, 0)).toBe(0);
  });
});

describe('Effects particle pool', () => {
  it('spawns dust while the car skids and nothing while it does not', () => {
    const fx = new Effects();
    fx.update(1 / 60, player({ skidding: false, speed: 500 }));
    expect(fx.live).toBe(0);
    fx.update(1 / 60, player({ skidding: true, speed: 500 }));
    expect(fx.live).toBeGreaterThan(0);
  });

  it('spawns flame on a gear change, not on every frame in the same gear', () => {
    const fx = new Effects();
    fx.update(1 / 60, player({ gear: 1 }));
    const afterFirst = fx.live;
    fx.update(1 / 60, player({ gear: 1 }));
    expect(fx.live).toBe(afterFirst);
    fx.update(1 / 60, player({ gear: 2 }));
    expect(fx.live).toBeGreaterThan(afterFirst);
  });

  it('retires particles once their lifetime is up', () => {
    const fx = new Effects();
    fx.update(1 / 60, player({ skidding: true, speed: 500 }));
    expect(fx.live).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) fx.update(1 / 60, player());
    expect(fx.live).toBe(0);
  });

  it('never exceeds the pre-allocated pool, however long it runs', () => {
    const fx = new Effects();
    for (let i = 0; i < 5000; i++) {
      fx.update(1 / 60, player({ skidding: true, speed: 900, gear: i % 6 }));
      expect(fx.live).toBeLessThanOrEqual(MAX_PARTICLES);
    }
  });

  it('survives a garbage dt without spawning or leaking a NaN particle', () => {
    const fx = new Effects();
    for (const dt of [NaN, -1, Infinity, 1e6]) {
      expect(() => fx.update(dt, player({ skidding: true, speed: 500 }))).not.toThrow();
      expect(fx.live).toBeLessThanOrEqual(MAX_PARTICLES);
    }
  });
});

describe('Effects rendering', () => {
  const set = () => buildEffectSet({} as CanvasImageSource, frames);

  it('draws nothing at all when the atlas never arrived — effects.png is droppable', () => {
    const fx = new Effects();
    const backend = new RecordingBackend();
    fx.update(1 / 60, player({ skidding: true, speed: 900, gear: 3 }));
    expect(() => fx.render(backend, null, player({ speed: 900 }), 1000)).not.toThrow();
    expect(backend.sprites).toHaveLength(0);
  });

  it('draws every live particle once the atlas is present', () => {
    const fx = new Effects();
    const backend = new RecordingBackend();
    fx.update(1 / 60, player({ skidding: true, speed: 500 }));
    fx.render(backend, set(), player({ speed: 500 }), 1000);
    expect(backend.sprites.length).toBeGreaterThanOrEqual(fx.live);
  });

  it('draws each particle with an alpha strictly inside (0, 1]', () => {
    const fx = new Effects();
    const backend = new RecordingBackend();
    fx.update(1 / 60, player({ skidding: true, speed: 500 }));
    fx.update(4 / 60, player({ skidding: true, speed: 500 }));
    fx.render(backend, set(), player({ speed: 500 }), 1000);
    for (const s of backend.sprites) {
      expect(s.alpha).toBeGreaterThan(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('adds speed streaks only above the threshold', () => {
    const fx = new Effects();
    const slow = new RecordingBackend();
    const fast = new RecordingBackend();
    fx.render(slow, set(), player({ speed: 100 }), 1000);
    fx.render(fast, set(), player({ speed: 1000 }), 1000);
    expect(slow.sprites).toHaveLength(0);
    expect(fast.sprites.length).toBeGreaterThan(0);
  });

  it('degrades to drawing nothing when the atlas lacks a frame it wanted', () => {
    // A hand-edited or truncated effects.json must not take the frame down.
    const partial = buildEffectSet({} as CanvasImageSource, frames.filter((f) => f.car !== 'streak'));
    const backend = new RecordingBackend();
    expect(() => new Effects().render(backend, partial, player({ speed: 1000 }), 1000)).not.toThrow();
    expect(backend.sprites).toHaveLength(0);
  });
});
