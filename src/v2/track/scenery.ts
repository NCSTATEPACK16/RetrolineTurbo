import { halfWidthAt, type SimTrack } from '../sim/track.js';
import type { CircuitLayout } from './schema.js';

/** How big a scenery sprite is in the world. Size comes from metres, never from the art's pixels (hard rule 5). */
export interface SceneryKind {
  /** World height in metres. */
  readonly heightM: number;
  /** Art width / height, so width follows height without distortion. */
  readonly aspect: number;
}

export interface SceneryPlacement {
  readonly sprite: string;
  readonly s: number;
  /** Lateral offset of the sprite's centre from the centreline, + right. */
  readonly lat: number;
  readonly width: number;
  readonly height: number;
}

/** Kerb width the road mesh draws beyond the tarmac, which scenery offsets are measured past. */
export const KERB_M = 1.2;

/** Expand the layout's scenery runs into individual placements along the lap. */
export function placeScenery(
  track: SimTrack, layout: CircuitLayout, kinds: Readonly<Record<string, SceneryKind>>,
): SceneryPlacement[] {
  const out: SceneryPlacement[] = [];
  for (const run of layout.scenery) {
    const kind = kinds[run.sprite];
    if (!kind) throw new Error(`track "${track.name}": no scenery sprite called "${run.sprite}"`);
    const height = kind.heightM;
    const width = height * kind.aspect;
    const sides = run.side === 'both' ? [-1, 1] : run.side === 'left' ? [-1] : [1];
    for (let s = run.from; s < run.to; s += run.every) {
      const hw = halfWidthAt(track, s);
      for (const side of sides) {
        out.push({ sprite: run.sprite, s, lat: side * (hw + KERB_M + run.offset + width / 2), width, height });
      }
    }
  }
  return out;
}
