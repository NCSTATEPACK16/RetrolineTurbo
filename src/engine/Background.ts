import { COLORS, LOGICAL_HEIGHT } from '../constants.js';
import type { Camera } from '../types/engine.js';
import type { RenderBackend } from './RenderBackend.js';

/**
 * Horizontal parallax shift for a layer (§7): camera pan scaled by the layer
 * speed, plus a curvature term. Pure and allocation-free.
 */
export function layerOffset(cameraX: number, curvature: number, speed: number): number {
  return cameraX * speed + curvature * speed * 200;
}

/**
 * Sky/ground backdrop drawn before the road each frame. Phase 2 draws two flat
 * bands split at the horizon; Phase 3 (Task 9) pans coloured layers with
 * {@link layerOffset}. Uses `fillBand` only — full-width horizontal fills.
 */
export class Background {
  render(camera: Camera, _curvatureAtCamera: number, backend: RenderBackend): void {
    const horizon = camera.horizon;
    backend.fillBand(0, horizon, COLORS.sky);
    backend.fillBand(horizon, LOGICAL_HEIGHT - horizon, COLORS.groundDark);
  }
}
