import type { TrackFile, TrackSection, TrackSpriteRule } from './schema.js';

/** Deterministic 32-bit PRNG (public-domain mulberry32). Same seed ⇒ same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Magnitude bounds are provisional feel constants, matched to what the renderer
// and skid tuning were visually gated on (|curve| ≤ 5, |pitch| ≤ 60).
const MAX_CURVE = 5;
const MAX_PITCH = 60;
const SCENERY: readonly string[] = ['tree', 'bush', 'rock'];

function int(rnd: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}
function pick<T>(rnd: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rnd() * xs.length)]!;
}

function scenery(rnd: () => number, sectionLength: number): TrackSpriteRule[] | undefined {
  const roll = rnd();
  if (roll < 0.2) return undefined; // barren stretch
  const rules: TrackSpriteRule[] = [];
  const density = roll < 0.6 ? 1 : 2; // sparse or normal
  for (let i = 0; i < density; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    rules.push({
      name: pick(rnd, SCENERY),
      offset: side * (1.5 + rnd() * 1.2),
      every: int(rnd, 4, 12),
    });
  }
  if (rnd() < 0.15) rules.push({ name: rnd() < 0.5 ? 'sign' : 'billboard', offset: rnd() < 0.5 ? -1.4 : 1.6, every: Math.max(sectionLength, 1) });
  return rules;
}

/** Seeded section-append generator. Output always satisfies parseTrackFile and
 * the seam rule (total ≥ max(targetSegments, 600) ≥ 2 × drawDistance). */
export function generateTrack(
  seed: number,
  opts: { targetSegments?: number; segmentLength?: number; roadWidth?: number } = {},
): TrackFile {
  const rnd = mulberry32(seed);
  const target = Math.max(opts.targetSegments ?? 700, 600);
  const sections: TrackSection[] = [];
  let total = 0;
  const sceneryRules = (length: number): { sprites: TrackSpriteRule[] } | undefined => {
    const s = scenery(rnd, length);
    return s === undefined ? undefined : { sprites: s };
  };
  const add = (length: number, curve: number, pitch: number): void => {
    // Round to editor-friendly precision (curve 0.1 steps, integer pitch/offset
    // display) so generated tracks read cleanly in the section editor.
    const c = Math.round(curve * 10) / 10;
    const p = Math.round(pitch);
    sections.push({ length, curve: c, pitch: p, ...(sceneryRules(length) ?? {}) });
    total += length;
  };

  add(int(rnd, 40, 80), 0, 0); // lead-in
  while (total < target - 120) {
    const kind = int(rnd, 0, 4);
    if (kind === 0) add(int(rnd, 20, 60), 0, 0); // straight
    else if (kind === 1) add(int(rnd, 20, 40), (rnd() < 0.5 ? -1 : 1) * (1 + rnd() * 1.5), 0); // gentle arc
    else if (kind === 2) add(int(rnd, 15, 30), (rnd() < 0.5 ? -1 : 1) * (2.5 + rnd() * (MAX_CURVE - 2.5)), 0); // sharp arc
    else if (kind === 3) add(int(rnd, 20, 40), 0, (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * (MAX_PITCH - 20))); // hill
    else { // S-pair
      const c = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 2);
      const len = int(rnd, 15, 30);
      add(len, c, 0);
      add(len, -c, 0);
    }
  }
  add(int(rnd, 40, 80), 0, 0); // run-out
  if (total < target) add(target - total, 0, 0); // seam pad

  return {
    trackId: `gen-${seed}`,
    stageName: `Generated ${seed}`,
    segmentLength: opts.segmentLength ?? 200,
    roadWidth: opts.roadWidth ?? 2000,
    lanes: 3,
    sections,
  };
}
