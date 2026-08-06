import { parseTrackFile, type ParsedTrack, type TrackFile } from './schema.js';

/**
 * The hand-authored default track — the Phase 2–5 hardcoded build() re-expressed
 * as data (Phase 6 deliverable). Curve/pitch runs are the golden master of the
 * Phase 5 visual gate; scenery is expressed as section rules with equivalent
 * density (not per-segment-identical placement).
 */
export const DEFAULT_TRACK_FILE: TrackFile = {
  trackId: 'default',
  stageName: 'Proving Grounds',
  segmentLength: 200,
  roadWidth: 2000,
  lanes: 3,
  sections: [
    { length: 60, curve: 0, pitch: 0, sprites: [
      { name: 'tree', offset: -1.6, every: 12 }, { name: 'bush', offset: -2.0, every: 6 },
      { name: 'tree', offset: 1.6, every: 12 }, { name: 'rock', offset: 2.0, every: 6 },
      { name: 'sign', offset: -1.3, every: 60 },
    ] },
    { length: 40, curve: 3, pitch: 0, sprites: [
      { name: 'bush', offset: -1.8, every: 6 }, { name: 'tree', offset: 1.8, every: 8 },
    ] },
    { length: 40, curve: 0, pitch: 40, sprites: [
      { name: 'tree', offset: -2.2, every: 8 }, { name: 'rock', offset: 1.7, every: 7 },
    ] },
    { length: 40, curve: -3, pitch: -40, sprites: [
      { name: 'bush', offset: -1.7, every: 6 }, { name: 'tree', offset: 2.1, every: 8 },
    ] },
    { length: 40, curve: 0, pitch: 0, sprites: [
      { name: 'billboard', offset: 1.8, every: 40 }, { name: 'tree', offset: -1.9, every: 9 },
    ] },
    { length: 380, curve: 0, pitch: 0, sprites: [
      { name: 'tree', offset: -1.6, every: 12 }, { name: 'bush', offset: 1.9, every: 10 },
      { name: 'rock', offset: -2.3, every: 14 },
    ] },
  ],
};

/** Parse the default track once; a broken default is a programmer error. */
export function parsedDefaultTrack(): ParsedTrack {
  const r = parseTrackFile(DEFAULT_TRACK_FILE);
  if (!r.ok) throw new Error(`DEFAULT_TRACK_FILE invalid:\n${r.errors.join('\n')}`);
  return r.track;
}
