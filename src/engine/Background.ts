import { COLORS, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../constants.js';
import type { Camera } from '../types/engine.js';
import type { RenderBackend } from './RenderBackend.js';
import { backdropPan, backdropTiles, type Backdrop } from './Backdrop.js';

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
  /** Pre-allocated plate x-positions — at most 2 copies cover the screen. */
  private readonly tileXs = [0, 0, 0];

  render(camera: Camera, curvatureAtCamera: number, backend: RenderBackend, backdrop?: Backdrop): void {
    const horizon = camera.horizon;

    if (backdrop) {
      this.renderBackdrop(camera, curvatureAtCamera, backend, backdrop, horizon);
      return;
    }
    // Sky pans slowest, a hill band faster — expressed as a colour phase shift
    // (full-width bands can't move in x; textured layers replace this in Phase 4).
    const skyPhase = Math.floor(Math.abs(layerOffset(camera.x, curvatureAtCamera, 0.001))) % 2;
    const hillPhase = Math.floor(Math.abs(layerOffset(camera.x, curvatureAtCamera, 0.003))) % 2;

    backend.fillBand(0, horizon * 0.6, skyPhase === 0 ? COLORS.sky : COLORS.groundDark);
    backend.fillBand(horizon * 0.6, horizon * 0.4, hillPhase === 0 ? COLORS.groundDark : COLORS.groundLight);
    backend.fillBand(horizon, LOGICAL_HEIGHT - horizon, COLORS.groundDark);
  }

  /**
   * Blit the horizon plate: sky colour above it, the plate resting on the
   * horizon, ground below. The plate is drawn at native scale (no filtering,
   * so the pixel art stays crisp) and wrapped by drawing at most two copies —
   * seamless because the prep script mirrors each plate onto itself.
   */
  private renderBackdrop(
    camera: Camera, curvature: number, backend: RenderBackend, backdrop: Backdrop, horizon: number,
  ): void {
    const top = horizon - backdrop.height;
    if (top > 0) backend.fillBand(0, top, backdrop.skyColor);

    const pan = backdropPan(camera.x, curvature, backdrop.width);
    const n = backdropTiles(pan, backdrop.width, LOGICAL_WIDTH, this.tileXs);
    for (let i = 0; i < n; i++) {
      backend.drawSprite(
        backdrop.image, 0, 0, backdrop.width, backdrop.height,
        this.tileXs[i]!, top, backdrop.width, backdrop.height, horizon,
      );
    }

    backend.fillBand(horizon, LOGICAL_HEIGHT - horizon, COLORS.groundDark);
  }
}
