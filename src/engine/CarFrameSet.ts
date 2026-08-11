import type { SpriteFrame } from '../types/engine.js';
import type { AtlasFrameMeta } from './AtlasManifest.js';

const EMPTY_FRAME: SpriteFrame = { x: 0, y: 0, w: 1, h: 1, anchorX: 0, anchorY: 0 };

/**
 * Dense integer-indexed car frame lookup.
 *
 * Manifest ids like "gt_red_a0_s3" are parsed exactly once, at build time. The
 * render path then indexes with integers only — no string is constructed per
 * sprite per frame (hard rule 4). This is the one place the `glyphFrameName`
 * pattern from text.ts must NOT be copied.
 */
export class CarFrameSet {
  constructor(
    /** frames[colorIdx][angleIdx][stepIdx] */
    private readonly table: SpriteFrame[][][],
    private readonly colorNames: string[],
    /** anchors[angleIdx][name] — shared across colours and steps (normalised). */
    private readonly anchorsByAngle: Record<string, readonly [number, number]>[],
  ) {}

  get colors(): number { return this.table.length; }
  get angles(): number { return this.table[0]?.length ?? 0; }

  /** Index for a colour name, or 0 when unknown. */
  colorIndex(name: string): number {
    const i = this.colorNames.indexOf(name);
    return i < 0 ? 0 : i;
  }

  /** Frame at (colour, angle, step). Clamps; never throws. */
  frame(color: number, angle: number, step: number): SpriteFrame {
    const byAngle = this.table[clamp(color, this.table.length)];
    if (!byAngle) return EMPTY_FRAME;
    const bySteps = byAngle[clamp(angle, byAngle.length)];
    if (!bySteps) return EMPTY_FRAME;
    return bySteps[clamp(step, bySteps.length)] ?? EMPTY_FRAME;
  }

  /**
   * Nearest step that actually exists in this set — props bake a sparse ladder.
   *
   * Cars bake all 12 rungs, but a prop is only seen across a narrow distance
   * range, so baking every rung spends atlas on frames nobody looks at. A sparse
   * set leaves holes in the step array, and `frame()` would resolve a hole to the
   * 1x1 empty frame — a prop that silently vanishes at some distances. Snap the
   * request onto a baked rung first.
   *
   * Allocation-free and called at most once per sprite per frame (hard rule 4);
   * the scan is over ~12 entries, so a precomputed map would cost more than it saves.
   */
  nearestStep(color: number, angle: number, want: number): number {
    const bySteps = this.table[clamp(color, this.table.length)]?.[
      clamp(angle, this.table[clamp(color, this.table.length)]?.length ?? 0)
    ];
    if (!bySteps) return want;
    const target = Number.isFinite(want) ? want : 0;
    let best = -1;
    let bestGap = Infinity;
    for (let i = 0; i < bySteps.length; i++) {
      if (!bySteps[i]) continue;
      const gap = Math.abs(i - target);
      if (gap < bestGap) { best = i; bestGap = gap; }
      if (gap === 0) break; // sorted ascending, so an exact hit is final
    }
    return best < 0 ? want : best;
  }

  /** Writes the normalised anchor into `out`. False when the name is unknown. */
  anchor(angle: number, name: string, out: [number, number]): boolean {
    const pt = this.anchorsByAngle[clamp(angle, this.anchorsByAngle.length)]?.[name];
    if (!pt) return false;
    out[0] = pt[0];
    out[1] = pt[1];
    return true;
  }
}

function clamp(i: number, len: number): number {
  if (!(i > 0)) return 0; // also catches NaN
  return i >= len ? Math.max(0, len - 1) : Math.floor(i);
}

/** Resolve manifest frames into the dense integer table. Called once, at load. */
export function buildCarFrameSet(frames: AtlasFrameMeta[]): CarFrameSet {
  const colorNames: string[] = [];
  for (const f of frames) if (!colorNames.includes(f.color)) colorNames.push(f.color);

  const table: SpriteFrame[][][] = [];
  const anchorsByAngle: Record<string, readonly [number, number]>[] = [];

  for (const f of frames) {
    const ci = colorNames.indexOf(f.color);
    (table[ci] ??= [])[f.angle] ??= [];
    table[ci]![f.angle]![f.step] = {
      x: f.x, y: f.y, w: f.w, h: f.h,
      anchorX: Math.floor(f.w / 2), anchorY: f.h, // base-centre, matching billboard()
    };
    if (!anchorsByAngle[f.angle]) anchorsByAngle[f.angle] = f.anchors;
  }
  return new CarFrameSet(table, colorNames, anchorsByAngle);
}
