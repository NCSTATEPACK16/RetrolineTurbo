/**
 * Discrete sprite scale ladder (research §3b).
 *
 * `Renderer.blit` used to compute a continuous destination width from 1/z. With
 * `imageSmoothingEnabled = false` that resamples the source at a slightly
 * different ratio every frame, so pixels wink in and out as z changes — the
 * shimmer. The arcade hardware avoided it the same way: OutRun shipped five
 * hand-tweaked zoom copies of each sprite rather than scaling one.
 *
 * Snapping to fixed steps makes the car pop between sizes instead of crawling,
 * and at 60fps over 12 steps the pops are masked by road motion.
 *
 * Called once per visible sprite per frame — allocation-free by contract.
 */

/** Pre-baked sprite widths in px, largest first. */
export const LADDER = [120, 96, 76, 60, 48, 38, 30, 24, 19, 15, 12, 10] as const;

/** Below this step (<=30px wide) anchored overlays are culled (research §4b). */
export const OVERLAY_CULL_STEP = 6;

/**
 * Index of the ladder step nearest `idealWidthPx`. Nearest, not floor —
 * flooring biases every sprite small. Clamps at both ends; NaN and negatives
 * clamp to the smallest step, because the render loop must never throw.
 */
export function ladderStepFor(idealWidthPx: number): number {
  const last = LADDER.length - 1;
  if (!(idealWidthPx > LADDER[last]!)) return last; // also catches NaN
  if (idealWidthPx >= LADDER[0]!) return 0;
  // Linear scan over 12 entries: no allocation, no closure, predictable.
  for (let i = 0; i < last; i++) {
    const hi = LADDER[i]!;
    const lo = LADDER[i + 1]!;
    if (idealWidthPx >= lo) {
      return idealWidthPx - lo >= hi - idealWidthPx ? i : i + 1;
    }
  }
  return last;
}
