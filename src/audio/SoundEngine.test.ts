import { describe, it, expect } from 'vitest';
import { SoundEngine } from './SoundEngine.js';
import type { PlayerState } from '../types/engine.js';

/** vitest runs `environment: 'node'` (see vite.config.ts) — no AudioContext
 * exists here, so every test in this file exercises the no-support path.
 * That path IS the regression guard the spec asks for: the game loop must
 * complete with a stubbed/null audio backend, same contract as the Supabase
 * null-client tests. */
const player = (over: Partial<PlayerState> = {}): PlayerState => (
  { z: 0, x: 0, speed: 0, gear: 1, steer: 0, skidding: false, skidMagnitude: 0, braking: false, ...over }
);

describe('SoundEngine without Web Audio support', () => {
  it('constructs without throwing', () => {
    expect(() => new SoundEngine()).not.toThrow();
  });

  it('resume is a safe no-op', () => {
    const engine = new SoundEngine();
    expect(() => engine.resume()).not.toThrow();
  });

  it('step is a safe no-op across the full state range', () => {
    const engine = new SoundEngine();
    expect(() => engine.step(player())).not.toThrow();
    expect(() => engine.step(player({ speed: 6000, gear: 2 }))).not.toThrow();
    expect(() => engine.step(player({ skidding: true, skidMagnitude: 0.7 }))).not.toThrow();
    expect(() => engine.step(player({ speed: Number.NaN }))).not.toThrow();
  });

  it('collisionCue is a safe no-op', () => {
    const engine = new SoundEngine();
    expect(() => engine.collisionCue()).not.toThrow();
  });

  it('survives a full simulated run: many steps, a skid, a collision, all with no audio backend', () => {
    const engine = new SoundEngine();
    expect(() => {
      for (let i = 0; i < 120; i++) engine.step(player({ speed: i * 10, gear: i > 60 ? 2 : 1 }));
      engine.step(player({ skidding: true, skidMagnitude: 1 }));
      engine.collisionCue();
      engine.resume();
    }).not.toThrow();
  });
});
