/**
 * The simulation's view of a circuit: a closed loop measured in metres along
 * its centreline (`s`), with signed curvature per section. Positive curvature
 * turns right. Geometry (positions, headings, meshes) is derived from this by
 * the view layer; the sim itself only ever needs arc length and curvature.
 */
export interface TrackSection {
  /** Arc length in metres. */
  readonly length: number;
  /** Signed curvature in 1/m (heading change in radians per metre). */
  readonly curvature: number;
}

export interface TrackDef {
  readonly name: string;
  /** Half the drivable road width in metres. */
  readonly halfWidth: number;
  readonly sections: readonly TrackSection[];
}

export interface SimTrack {
  readonly name: string;
  readonly halfWidth: number;
  readonly length: number;
  readonly sections: readonly TrackSection[];
  /** Arc-length start of each section, ascending. */
  readonly starts: Float64Array;
}

export function buildSimTrack(def: TrackDef): SimTrack {
  if (def.sections.length === 0) throw new Error(`track "${def.name}" has no sections`);
  const starts = new Float64Array(def.sections.length);
  let s = 0;
  def.sections.forEach((sec, i) => {
    if (!(sec.length > 0)) throw new Error(`track "${def.name}" section ${i} has non-positive length`);
    starts[i] = s;
    s += sec.length;
  });
  return { name: def.name, halfWidth: def.halfWidth, length: s, sections: def.sections, starts };
}

/** Wrap an arc length onto [0, length). */
export function wrapS(track: SimTrack, s: number): number {
  const L = track.length;
  if (s >= L) return s - L * Math.floor(s / L);
  if (s < 0) return s + L * Math.ceil(-s / L);
  return s;
}

/** Index of the section containing arc length `s` (already wrapped). Binary search, allocation-free. */
export function sectionIndexAt(track: SimTrack, s: number): number {
  const starts = track.starts;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function curvatureAt(track: SimTrack, s: number): number {
  return track.sections[sectionIndexAt(track, s)]!.curvature;
}

/** Signed shortest arc distance from `a` to `b` around the loop, in (-L/2, L/2]. */
export function arcDelta(track: SimTrack, a: number, b: number): number {
  const L = track.length;
  let d = b - a;
  if (d > L / 2) d -= L;
  else if (d <= -L / 2) d += L;
  return d;
}
