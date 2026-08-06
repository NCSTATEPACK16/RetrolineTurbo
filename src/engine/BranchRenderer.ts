import type { BranchPoint } from '../types/engine.js';

/**
 * Pure branch-fork geometry (plan.md §7). The road's world-x centre offsets
 * during a split are derived from an eased spread that grows from 0 at
 * `startSegment` to `maxSpread` at the node. Rendering stays in the segment
 * model: the Renderer draws the same trapezoid span once per offset.
 */

/** Spread (world units) at a segment index: 0 before the window, eased t²
 * growth inside it, `maxSpread` at and after the node. */
export function branchSpread(segIdx: number, branch: BranchPoint, maxSpread: number): number {
  const t = (segIdx - branch.startSegment) / branch.splitDurationSegments;
  if (t <= 0) return 0;
  if (t >= 1) return maxSpread;
  return maxSpread * t * t;
}

/** Fill the pre-allocated `out` with per-road centre offsets; returns the road
 * count. Zero spread collapses to one centred road. No allocation (hard rule 4). */
export function fillRoadOffsets(out: number[], ways: 2 | 3, spread: number): number {
  if (spread === 0) {
    out[0] = 0;
    return 1;
  }
  if (ways === 2) {
    out[0] = -spread;
    out[1] = spread;
    return 2;
  }
  out[0] = -spread;
  out[1] = 0;
  out[2] = spread;
  return 3;
}

/** The chosen road's world-x centre offset at the node — the hand-off translate
 * subtracts this so the player continues on the new scene's centre-line. */
export function chosenOffsetAtNode(choice: number, ways: 2 | 3, maxSpread: number): number {
  if (ways === 2) return choice === 0 ? -maxSpread : maxSpread;
  return (choice - 1) * maxSpread;
}
