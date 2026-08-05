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
  render(camera: Camera, curvatureAtCamera: number, backend: RenderBackend): void {
    const horizon = camera.horizon;
    // Sky pans slowest, a hill band faster — expressed as a colour phase shift
    // (full-width bands can't move in x; textured layers replace this in Phase 4).
    const skyPhase = Math.floor(Math.abs(layerOffset(camera.x, curvatureAtCamera, 0.001))) % 2;
    const hillPhase = Math.floor(Math.abs(layerOffset(camera.x, curvatureAtCamera, 0.003))) % 2;

    backend.fillBand(0, horizon * 0.6, skyPhase === 0 ? COLORS.sky : COLORS.groundDark);
    backend.fillBand(horizon * 0.6, horizon * 0.4, hillPhase === 0 ? COLORS.groundDark : COLORS.groundLight);
    backend.fillBand(horizon, LOGICAL_HEIGHT - horizon, COLORS.groundDark);
  }
}
