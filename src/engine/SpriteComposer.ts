/**
 * Anchored-overlay geometry (research §4b).
 *
 * Upgrade parts (wheels, exhaust, spoiler, brake lights) draw as separate quads
 * pinned to points on the car body, so 80 parts do not require 80 car sprites.
 *
 * Anchors are stored normalised 0..1 against the largest frame, so ONE anchor per
 * overlay per steering angle covers all 12 ladder steps with no per-step table.
 * That is free to adopt here: `Renderer.blit` already positions via normalised
 * fractions (`f.anchorX / f.w`).
 *
 * Deliberately NOT on RenderBackend: the backend takes primitives and knows only
 * pixels (hard rule 2 / RenderBackend.ts contract comment). Composition lives
 * with the Renderer.
 */

export interface Rect { dx: number; dy: number; dw: number; dh: number }

/**
 * Destination rect for an overlay anchored to an already-placed body.
 *
 * `ax`/`ay` are normalised 0..1 in the body frame; the overlay is centred on the
 * anchor. When `flipX`, `ax` mirrors to `1 - ax` — research §4b calls this "the
 * one line usually forgotten that causes overlays to detach on left turns".
 *
 * Writes into `out`; allocates nothing.
 */
export function overlayDest(
  bodyDx: number, bodyDy: number, bodyDw: number, bodyDh: number,
  ax: number, ay: number,
  overlayDw: number, overlayDh: number,
  flipX: boolean,
  out: Rect,
): void {
  const mx = flipX ? 1 - ax : ax;
  out.dw = overlayDw;
  out.dh = overlayDh;
  out.dx = bodyDx + bodyDw * mx - overlayDw / 2;
  out.dy = bodyDy + bodyDh * ay - overlayDh / 2;
}
