import { describe, it, expect } from 'vitest';
import { TrackManager } from './TrackManager.js';
import { DEFAULT_TRACK_CONFIG } from '../constants.js';
import { parseTrackFile } from '../track/schema.js';

describe('TrackManager (straight track)', () => {
  it('builds a flat, straight track whose segments carry monotonic z and zero curve/pitch', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    expect(track.length).toBeGreaterThan(DEFAULT_TRACK_CONFIG.drawDistance);
    const first = track.segment(0);
    const second = track.segment(1);
    expect(first.z).toBe(0);
    expect(second.z).toBe(DEFAULT_TRACK_CONFIG.segmentLength);
    // Index + z are monotonic across the whole track regardless of curve/hill
    // sections; curve/pitch are only guaranteed flat on the straight lead-in.
    const LEADIN = 60;
    for (let i = 0; i < track.length; i++) {
      const s = track.segment(i);
      expect(s.index).toBe(i);
      expect(s.z).toBe(i * DEFAULT_TRACK_CONFIG.segmentLength);
      if (i < LEADIN) {
        expect(s.curve).toBe(0);
        expect(s.pitch).toBe(0);
      }
    }
  });

  it('wraps out-of-range indices modulo the track length', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    expect(track.segment(track.length).index).toBe(0);
    expect(track.segment(-1).index).toBe(track.length - 1);
  });
});

describe('TrackManager (curves + hills)', () => {
  it('carries a right curve, a left curve, and a crest in distinct segment ranges', () => {
    const track = new TrackManager(DEFAULT_TRACK_CONFIG);
    const curves = track.segments.map((s) => s.curve);
    const pitches = track.segments.map((s) => s.pitch);
    expect(curves.some((c) => c > 0)).toBe(true); // right curve present
    expect(curves.some((c) => c < 0)).toBe(true); // left curve present
    expect(pitches.some((p) => p > 0)).toBe(true); // uphill present
    expect(pitches.some((p) => p < 0)).toBe(true); // downhill (far side of crest)
    // The opening lead-in is still straight & flat.
    expect(track.segment(0).curve).toBe(0);
    expect(track.segment(0).pitch).toBe(0);
  });
});

describe('TrackManager (roadside sprites)', () => {
  it('populates segments with roadside sprites', () => {
    const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
    const total = tm.segments.reduce((n, s) => n + s.sprites.length, 0);
    expect(total).toBeGreaterThan(20);
  });
  it('places sprites on both sides of the road', () => {
    const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
    const offs = tm.segments.flatMap((s) => s.sprites.map((sp) => sp.offset));
    expect(offs.some((o) => o < -1)).toBe(true);
    expect(offs.some((o) => o > 1)).toBe(true);
  });
});

describe('TrackManager (data-driven rebuild)', () => {
  it('rebuild swaps segments in place behind the same reference', () => {
    const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
    const before = tm.length;
    const r = parseTrackFile({
      trackId: 'tiny', stageName: 'Tiny', segmentLength: 200, roadWidth: 2000, lanes: 3,
      sections: [{ length: 700, curve: 1, pitch: 0 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    tm.rebuild(r.track);
    expect(tm.length).toBe(700);
    expect(tm.length).not.toBe(before);
    expect(tm.segment(10).curve).toBe(1);
  });

  it('exposes the active branch and refreshes it on rebuild', () => {
    const tm = new TrackManager(DEFAULT_TRACK_CONFIG);
    expect(tm.activeBranch).toBeNull(); // default track has no fork
    const r = parseTrackFile({
      trackId: 'forked', stageName: 'Forked', segmentLength: 200, roadWidth: 2000, lanes: 3,
      sections: [{ length: 700, curve: 0, pitch: 0 }],
      branchPoint: { startSegment: 500, splitDurationSegments: 60, ways: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    tm.rebuild(r.track);
    expect(tm.activeBranch).toEqual({ startSegment: 500, splitDurationSegments: 60, ways: 2 });
  });
});
