import { describe, it, expect } from 'vitest';
import { parseMusicManifest } from './musicManifest.js';

describe('parseMusicManifest', () => {
  it('parses a well-formed manifest', () => {
    const t = parseMusicManifest({ tracks: [
      { id: 'chase', ogg: 'chase.ogg', mp3: 'chase.mp3', seconds: 128.5 },
    ] });
    expect(t).toEqual([{ id: 'chase', ogg: 'chase.ogg', mp3: 'chase.mp3', seconds: 128.5 }]);
  });

  it('returns an empty list rather than throwing on garbage', () => {
    expect(parseMusicManifest(null)).toEqual([]);
    expect(parseMusicManifest({})).toEqual([]);
    expect(parseMusicManifest({ tracks: 'nope' })).toEqual([]);
  });

  it('drops malformed entries but keeps good ones', () => {
    const t = parseMusicManifest({ tracks: [
      { id: 'ok', ogg: 'a.ogg', mp3: 'a.mp3', seconds: 1 },
      { id: 'bad' },
    ] });
    expect(t.map((x) => x.id)).toEqual(['ok']);
  });
});
