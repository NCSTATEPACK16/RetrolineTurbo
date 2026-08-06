import type { BranchPoint, Segment, TrackConfig } from '../types/engine.js';
import { parsedDefaultTrack } from '../track/tracks.js';
import type { ParsedTrack } from '../track/schema.js';

/**
 * Owns the segment array for the active track. Since Phase 6 the source is a
 * validated ParsedTrack (default: the hand-authored DEFAULT_TRACK_FILE); the
 * hardcoded build() is gone. `rebuild` swaps the track behind the same object
 * reference so consumers (renderer, HUD, main loop) never rewire.
 * `segment()` wraps so the track loops seamlessly.
 */
export class TrackManager {
  private _segments: Segment[];
  private _branch: BranchPoint | null;

  constructor(readonly config: TrackConfig, track?: ParsedTrack) {
    const t = track ?? parsedDefaultTrack();
    this._segments = t.segments;
    this._branch = t.file.branchPoint ?? null;
  }

  rebuild(track: ParsedTrack): void {
    this._segments = track.segments;
    this._branch = track.file.branchPoint ?? null;
  }

  /** The active track's fork, or null when the track ends without one. */
  get activeBranch(): BranchPoint | null {
    return this._branch;
  }

  get length(): number {
    return this._segments.length;
  }

  get segments(): readonly Segment[] {
    return this._segments;
  }

  segment(index: number): Segment {
    const n = this._segments.length;
    const i = ((index % n) + n) % n; // positive modulo for negative indices
    return this._segments[i]!;
  }
}
