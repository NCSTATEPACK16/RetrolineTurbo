import { describe, it, expect } from 'vitest';
import { DEFAULT_TRACK_FILE, parsedDefaultTrack } from './tracks.js';
import { parseTrackFile } from './schema.js';

describe('DEFAULT_TRACK_FILE', () => {
  it('passes its own validator', () => {
    expect(parseTrackFile(DEFAULT_TRACK_FILE).ok).toBe(true);
  });
  it('reproduces the Phase 5 layout: 600 segments, same curve/pitch runs', () => {
    const { segments, totalSegments } = parsedDefaultTrack();
    expect(totalSegments).toBe(600);
    expect(segments[30]!.curve).toBe(0);
    expect(segments[80]!.curve).toBe(3);   // right curve
    expect(segments[120]!.pitch).toBe(40); // uphill
    expect(segments[160]!.curve).toBe(-3); // left over the crest
    expect(segments[160]!.pitch).toBe(-40);
    expect(segments[250]!.curve).toBe(0);  // run-out
  });
  it('meets the seam rule for the default config draw distance (300)', () => {
    expect(parsedDefaultTrack().totalSegments).toBeGreaterThanOrEqual(600);
  });
});
