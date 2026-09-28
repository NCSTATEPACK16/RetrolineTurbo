import { curvatureAt, halfWidthAt, wrapS, type SimTrack } from './track.js';

/**
 * The ideal line round a circuit, generated from its curvature: centre on the
 * straights, swinging to the inside at each apex (a smoothed, look-ahead-shifted
 * curvature profile, so the car sets up wide and clips the inside late).
 * Built once per track; lookups are allocation-free.
 */
export interface RacingLine {
  readonly step: number;
  readonly count: number;
  /** Target lateral offset per sample, + right. */
  readonly x: Float32Array;
  /** Smoothed curvature per sample (for speed planning). */
  readonly k: Float32Array;
}

export const LINE = {
  step: 2,
  /** Smoothing window half-width, metres. */
  window: 40,
  /** Metres the apex sits after the geometric corner middle. */
  apexDelay: 10,
  /** Metres of lateral offset per unit of smoothed curvature. */
  gain: 700,
  /** Stay this far inside the road edge. */
  margin: 2.5,
} as const;

export function buildRacingLine(track: SimTrack, authored?: readonly { s: number; x: number }[] | null): RacingLine {
  const step = track.length / Math.ceil(track.length / LINE.step);
  const count = Math.round(track.length / step);
  const raw = new Float32Array(count);
  for (let i = 0; i < count; i++) raw[i] = curvatureAt(track, i * step);
  // Box-filter twice (≈ triangular window) for a smooth, symmetric profile.
  const smooth = (src: Float32Array): Float32Array => {
    const out = new Float32Array(count);
    const w = Math.round(LINE.window / step);
    let acc = 0;
    for (let j = -w; j <= w; j++) acc += src[(j + count) % count]!;
    for (let i = 0; i < count; i++) {
      out[i] = acc / (2 * w + 1);
      acc += src[(i + w + 1) % count]! - src[(i - w + count) % count]!;
    }
    return out;
  };
  const k = smooth(smooth(raw));
  const x = new Float32Array(count);
  const delay = Math.round(LINE.apexDelay / step);
  for (let i = 0; i < count; i++) {
    const s = i * step;
    const lim = halfWidthAt(track, s) - LINE.margin;
    const v = k[(i - delay + count) % count]! * LINE.gain;
    x[i] = v > lim ? lim : v < -lim ? -lim : v;
  }
  if (authored && authored.length > 0) overrideWithAuthored(track, x, step, authored);
  return { step, count, x, k };
}

/** Replace the generated offsets with a hand-authored line (linear between points, wrapping). */
function overrideWithAuthored(track: SimTrack, x: Float32Array, step: number, pts: readonly { s: number; x: number }[]): void {
  const sorted = [...pts].sort((a, b) => a.s - b.s);
  for (let i = 0; i < x.length; i++) {
    const s = i * step;
    let j = sorted.findIndex((p) => p.s > s);
    if (j < 0) j = 0;
    const b = sorted[j]!;
    const a = sorted[(j - 1 + sorted.length) % sorted.length]!;
    let span = b.s - a.s;
    let t = s - a.s;
    if (span <= 0) span += track.length;
    if (t < 0) t += track.length;
    x[i] = a.x + (b.x - a.x) * (t / span);
  }
}

function sample(line: RacingLine, arr: Float32Array, s: number, trackLength: number): number {
  const f = wrapLength(s, trackLength) / line.step;
  const i = Math.floor(f) % line.count;
  const j = (i + 1) % line.count;
  const u = f - Math.floor(f);
  return arr[i]! + (arr[j]! - arr[i]!) * u;
}

function wrapLength(s: number, L: number): number {
  return s >= L || s < 0 ? s - L * Math.floor(s / L) : s;
}

export function lineX(line: RacingLine, track: SimTrack, s: number): number {
  return sample(line, line.x, s, track.length);
}

export function lineK(line: RacingLine, track: SimTrack, s: number): number {
  return sample(line, line.k, wrapS(track, s), track.length);
}
