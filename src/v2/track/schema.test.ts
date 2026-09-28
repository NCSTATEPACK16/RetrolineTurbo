import { describe, it, expect } from 'vitest';
import { parseTrackFile, closureGap, TrackFileError } from './schema.js';
import { buildSimTrack, halfWidthAt } from '../sim/track.js';
import { buildCenterline, poseAt, type Pose } from '../view/centerline.js';
import sunsetBeach from './circuits/sunset-beach.json';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Mutable = Record<string, unknown> & { sections: Record<string, unknown>[]; grid: Record<string, unknown> };

function expectReject(mutate: (f: Mutable) => void, message: RegExp): void {
  const f = clone(sunsetBeach) as unknown as Mutable;
  mutate(f);
  expect(() => parseTrackFile(f)).toThrow(TrackFileError);
  expect(() => parseTrackFile(f)).toThrow(message);
}

describe('track schema v2', () => {
  it('accepts Sunset Beach', () => {
    const c = parseTrackFile(sunsetBeach);
    expect(c.def.name).toBe('Sunset Beach');
    expect(c.layout.theme).toBe('sunset');
    expect(c.layout.itemBoxes.length).toBeGreaterThan(0);
    expect(c.layout.racingLine).toBeNull();
  });

  it('names the track and the offending path in errors', () => {
    expectReject((f) => { f.sections[3]!.length = -5; }, /track "Sunset Beach": sections\[3\]\.length must be > 0/);
  });

  it.each<[string, (f: Mutable) => void, RegExp]>([
    ['wrong version', (f) => { f.version = 1; }, /version must be 2/],
    ['missing theme', (f) => { delete f.theme; }, /theme/],
    ['road too narrow', (f) => { f.halfWidth = 2; }, /halfWidth must be 4\.\.20/],
    ['turns not a full circle', (f) => { f.sections[1]!.turn = 80; }, /turns sum to/],
    ['does not return to start height', (f) => { f.sections[5]!.rise = 9; }, /rises sum to/],
    ['loop does not close', (f) => { f.sections[0]!.length = 350; }, /does not close/],
    ['grid too small', (f) => { f.grid.rows = 3; }, /at least 8 cars/],
    ['grid wider than road', (f) => { f.grid.columnGap = 30; }, /wider than the road/],
    ['item box off the lap', (f) => { (f.itemBoxes as { s: number }[])[0]!.s = 99999; }, /itemBoxes\[0\]\.s must be within the lap/],
    ['coin off the road', (f) => { (f.coins as { x: number }[])[0]!.x = 40; }, /coins\[0\]\.x must be on the road/],
    ['scenery run reversed', (f) => { (f.scenery as { to: number }[])[0]!.to = 0; }, /scenery\[0\]\.to/],
  ])('rejects %s', (_label, mutate, message) => expectReject(mutate, message));
});

describe('Sunset Beach geometry', () => {
  const circuit = parseTrackFile(sunsetBeach);
  const track = buildSimTrack(circuit.def);
  const c = buildCenterline(track, 1);
  const pose: Pose = { x: 0, y: 0, z: 0, heading: 0 };

  it('is a proper-length circuit that closes', () => {
    expect(track.length).toBeGreaterThan(2000);
    expect(closureGap(sunsetBeach.sections)).toBeLessThan(0.05);
  });

  it('has no seam at the start line', () => {
    const a = poseAt(c, track.length - 0.25, 0, { ...pose });
    const b = poseAt(c, 0.25, 0, { ...pose });
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.6);
  });

  it('has hills', () => {
    let top = -Infinity;
    for (let s = 0; s < track.length; s += 5) top = Math.max(top, poseAt(c, s, 0, pose).y);
    expect(top).toBeGreaterThan(8);
  });

  it('never runs within 30 m of another part of itself', () => {
    const pts: [number, number][] = [];
    for (let s = 0; s < track.length; s += 4) {
      poseAt(c, s, 0, pose);
      pts.push([pose.x, pose.z]);
    }
    const n = pts.length;
    const skip = 30; // 120 m either side along the track is "the same stretch"
    let min = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + skip; j < n; j++) {
        if (n - j + i < skip) continue;
        min = Math.min(min, Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]));
      }
    }
    expect(min).toBeGreaterThan(30);
  });

  it('widens through the hairpin and blends back', () => {
    const hairpin = track.starts[8]!;
    expect(halfWidthAt(track, hairpin + 45)).toBe(10.5);
    expect(halfWidthAt(track, hairpin + 5)).toBeGreaterThan(9);
    expect(halfWidthAt(track, hairpin + 5)).toBeLessThan(10.5);
    expect(halfWidthAt(track, track.starts[9]! + 60)).toBe(9);
  });
});
