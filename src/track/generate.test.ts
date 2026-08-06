import { describe, it, expect } from 'vitest';
import { generateTrack, mulberry32 } from './generate.js';
import { parseTrackFile } from './schema.js';

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('generateTrack', () => {
  it('is deterministic per seed', () => {
    expect(generateTrack(7)).toEqual(generateTrack(7));
  });
  it('differs across seeds', () => {
    expect(generateTrack(1)).not.toEqual(generateTrack(2));
  });
  it('every seed 0..49 passes the validator (property)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = parseTrackFile(generateTrack(seed));
      expect(r.ok, `seed ${seed}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
    }
  });
  it('meets the seam rule and stays within tuned magnitude bounds', () => {
    for (let seed = 0; seed < 20; seed++) {
      const t = generateTrack(seed);
      const total = t.sections.reduce((n, s) => n + s.length, 0);
      expect(total).toBeGreaterThanOrEqual(600);
      for (const s of t.sections) {
        expect(Math.abs(s.curve)).toBeLessThanOrEqual(5);
        expect(Math.abs(s.pitch)).toBeLessThanOrEqual(60);
      }
    }
  });
  it('stamps a seed-derived trackId', () => {
    expect(generateTrack(9).trackId).toBe('gen-9');
  });
});
