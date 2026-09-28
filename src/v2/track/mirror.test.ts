import { describe, it, expect } from 'vitest';
import { mirrorTrackFile } from './mirror.js';
import { parseTrackFile, type TrackFileV2 } from './schema.js';
import sunset from './circuits/sunset-beach.json';

describe('mirror mode track flip', () => {
  const file = sunset as TrackFileV2;
  const m = mirrorTrackFile(file);

  it('is still a valid, closed circuit', () => {
    expect(() => parseTrackFile(m)).not.toThrow();
  });

  it('turns the other way and swaps everything placed by side', () => {
    m.sections.forEach((s, i) => expect(s.turn).toBe(-file.sections[i]!.turn));
    m.coins.forEach((c, i) => expect(c.x).toBe(-file.coins[i]!.x));
    m.scenery.forEach((r, i) => {
      const was = file.scenery[i]!.side;
      expect(r.side).toBe(was === 'left' ? 'right' : was === 'right' ? 'left' : 'both');
    });
  });

  it('mirroring twice gives back the original', () => {
    expect(mirrorTrackFile(m)).toEqual(file);
  });
});
