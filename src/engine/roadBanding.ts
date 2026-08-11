/**
 * Horizon band merging — the anti-strobe rule (research §1d).
 *
 * Band *phase* is already tied to world Z in the Renderer loop
 * (`Math.floor((base + i) / rumbleSegments) % 2`), which is what stops
 * screen-space strobing. What that alone does not handle is the horizon: as
 * segments compress toward the vanishing point a whole rumble group eventually
 * projects to under one framebuffer row, and alternating it flickers.
 *
 * Merging below a floor gives the solid blur at the horizon that OutRun has.
 * Pure and primitive-only so it costs nothing in the render loop.
 */

/** A rumble group shorter than this many framebuffer rows must not alternate. */
export const MIN_BAND_ROWS = 2;

/**
 * True when a rumble group is too short on screen to alternate without strobing.
 * `segmentScreenHeight` is one segment's projected height in framebuffer rows.
 * Total over all input: degenerate values merge (the safe, non-flickering side).
 */
export function bandMerges(segmentScreenHeight: number, rumbleSegments: number): boolean {
  const groupRows = segmentScreenHeight * rumbleSegments;
  // NaN and negatives fall through to `true` — merging never flickers.
  return !(groupRows >= MIN_BAND_ROWS);
}
