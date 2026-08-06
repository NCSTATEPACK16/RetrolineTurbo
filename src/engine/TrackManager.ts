import type { Segment, TrackConfig } from '../types/engine.js';

/**
 * Owns the segment array for the active track. Phase 2 builds a straight track
 * from a `TrackConfig`; Phase 3 extends `build()` with curve/hill sections.
 * Phase 6 will replace the *source* (file loader / editor output) behind this
 * same interface. `segment()` wraps so the track loops seamlessly.
 */
export class TrackManager {
  private readonly _segments: Segment[];

  constructor(private readonly config: TrackConfig) {
    this._segments = this.build();
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
    // noUncheckedIndexedAccess: i is guaranteed in-range by the modulo above.
    return this._segments[i]!;
  }

  /**
   * Track script: a straight lead-in, an S-curve (right then left), and a hill
   * crest, padded past the draw distance so the loop has no visible seam.
   */
  private build(): Segment[] {
    const segments: Segment[] = [];
    const push = (count: number, curve: number, pitch: number): void => {
      for (let n = 0; n < count; n++) {
        segments.push({ index: segments.length, z: segments.length * this.config.segmentLength, curve, pitch });
      }
    };

    push(60, 0, 0); // straight, flat lead-in
    push(40, 3, 0); // gentle right curve
    push(40, 0, 40); // uphill
    push(40, -3, -40); // left curve over the crest, downhill
    push(40, 0, 0); // recover
    // Pad past the draw distance so the loop has no visible seam.
    const pad = this.config.drawDistance * 2 - segments.length;
    push(Math.max(pad, this.config.drawDistance), 0, 0);

    return segments;
  }
}
