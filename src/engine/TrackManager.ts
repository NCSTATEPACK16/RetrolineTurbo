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

  /** Straight track: enough segments to loop past the draw distance. */
  private build(): Segment[] {
    const count = this.config.drawDistance * 2; // room to loop without a visible seam
    const segments: Segment[] = new Array(count);
    for (let i = 0; i < count; i++) {
      segments[i] = { index: i, z: i * this.config.segmentLength, curve: 0, pitch: 0 };
    }
    return segments;
  }
}
