import type { SimTrack } from '../sim/track.js';
import { sectionIndexAt } from '../sim/track.js';

/**
 * World-space centreline sampled at a fixed arc-length step, derived from the
 * sim track by integrating curvature into heading. three.js convention:
 * forward at heading 0 is -Z, +X is right, +Y is up.
 */
export interface Centerline {
  readonly step: number;
  readonly count: number;
  readonly length: number;
  /** x,y,z per sample. */
  readonly pos: Float32Array;
  /** Heading (radians, clockwise from -Z seen from above) per sample. */
  readonly heading: Float32Array;
}

export function buildCenterline(track: SimTrack, maxStep = 1): Centerline {
  // Divide the lap into whole equal steps so the last sample hands off to the first exactly.
  const count = Math.ceil(track.length / maxStep);
  const step = track.length / count;
  const pos = new Float32Array(count * 3);
  const heading = new Float32Array(count);
  let x = 0, z = 0, h = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    const sec = sectionIndexAt(track, s);
    pos[i * 3] = x; pos[i * 3 + 1] = elevationAt(track, sec, s); pos[i * 3 + 2] = z;
    heading[i] = h;
    // Midpoint integration keeps closed loops closing to within centimetres.
    const k = track.sections[sec]!.curvature;
    const hm = h + k * step * 0.5;
    x += Math.sin(hm) * step;
    z -= Math.cos(hm) * step;
    h += k * step;
  }
  // Whatever tiny gap integration leaves at the finish is spread along the lap,
  // so the loop closes exactly (invisible: validated tracks close within 1 m).
  const gx = x, gz = z;
  for (let i = 0; i < count; i++) {
    const u = (i * step) / track.length;
    pos[i * 3] = pos[i * 3]! - gx * u;
    pos[i * 3 + 2] = pos[i * 3 + 2]! - gz * u;
  }
  return { step, count, length: track.length, pos, heading };
}

/** Height at `s` inside section `sec`: each section's rise is smoothstep-eased so crests and dips never kink. */
function elevationAt(track: SimTrack, sec: number, s: number): number {
  let y = 0;
  for (let i = 0; i < sec; i++) y += track.sections[i]!.rise ?? 0;
  const section = track.sections[sec]!;
  const u = (s - track.starts[sec]!) / section.length;
  return y + (section.rise ?? 0) * u * u * (3 - 2 * u);
}

/** A sampled pose along the centreline. Callers own and reuse it. */
export interface Pose { x: number; y: number; z: number; heading: number }

/** Pose at arc length `s` plus lateral offset `lat` (metres, + right). Allocation-free. */
export function poseAt(c: Centerline, s: number, lat: number, out: Pose): Pose {
  const L = c.length;
  let t = s % L;
  if (t < 0) t += L;
  const f = t / c.step;
  const i = Math.floor(f) % c.count;
  const j = (i + 1) % c.count;
  const u = f - Math.floor(f);
  const p = c.pos;
  let h0 = c.heading[i]!;
  let h1 = c.heading[j]!;
  // Headings accumulate past 2*pi on a loop; unwrap the pair before blending.
  while (h1 - h0 > Math.PI) h1 -= 2 * Math.PI;
  while (h1 - h0 < -Math.PI) h1 += 2 * Math.PI;
  const h = h0 + (h1 - h0) * u;
  // The last sample's neighbour is sample 0; blend toward it positionally too.
  const cx = p[i * 3]! + (p[j * 3]! - p[i * 3]!) * u;
  const cy = p[i * 3 + 1]! + (p[j * 3 + 1]! - p[i * 3 + 1]!) * u;
  const cz = p[i * 3 + 2]! + (p[j * 3 + 2]! - p[i * 3 + 2]!) * u;
  // Right-hand normal of heading h is (cos h, 0, sin h).
  out.x = cx + Math.cos(h) * lat;
  out.y = cy;
  out.z = cz + Math.sin(h) * lat;
  out.heading = h;
  return out;
}
