import { describe, it, expect } from 'vitest';
import { TrackManager } from './TrackManager.js';
import { DEFAULT_TRACK_CONFIG } from '../constants.js';

describe('TrackManager (straight track)', () => {
  it('builds a flat, straight track whose segments carry monotonic z and zero curve/pitch', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    expect(track.length).toBeGreaterThan(DEFAULT_TRACK_CONFIG.drawDistance);
    const first = track.segment(0);
    const second = track.segment(1);
    expect(first.z).toBe(0);
    expect(second.z).toBe(DEFAULT_TRACK_CONFIG.segmentLength);
    for (let i = 0; i < track.length; i++) {
      const s = track.segment(i);
      expect(s.index).toBe(i);
      expect(s.curve).toBe(0);
      expect(s.pitch).toBe(0);
      expect(s.z).toBe(i * DEFAULT_TRACK_CONFIG.segmentLength);
    }
  });

  it('wraps out-of-range indices modulo the track length', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    expect(track.segment(track.length).index).toBe(0);
    expect(track.segment(-1).index).toBe(track.length - 1);
  });
});
