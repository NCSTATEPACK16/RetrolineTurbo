import { scaleFor, projectX, projectY } from '../math/projection.js';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { Camera } from '../types/engine.js';

/** Screen-space projection of a road centre point: centre-x, row, half-width. */
export interface Projected {
  x: number;
  y: number;
  w: number;
}

/**
 * Project one road centre point to screen space using the Phase-1 primitives.
 * `roadHalfWidth` is the road's world half-width; the screen half-width carries
 * the same `W/2` NDC factor as {@link projectX}. Allocates — used by tests and
 * setup, never inside the per-frame render loop (see `Renderer.render`).
 */
export function projectSegment(
  worldXCenter: number,
  worldY: number,
  relZ: number,
  camera: Camera,
  roadHalfWidth: number,
  width: number = LOGICAL_WIDTH,
  height: number = LOGICAL_HEIGHT,
): Projected {
  const scale = scaleFor(camera.focalLength, relZ);
  return {
    x: projectX(worldXCenter, camera.x, scale, width),
    y: projectY(worldY, camera.height, scale, height),
    w: scale * roadHalfWidth * (width / 2),
  };
}
