import { scaleFor, projectX, projectY, accumulateSegment, clipToCrest } from '../math/projection.js';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, COLORS } from '../constants.js';
import type { Camera, TrackConfig } from '../types/engine.js';
import type { RenderBackend } from './RenderBackend.js';
import type { TrackManager } from './TrackManager.js';
import type { Background } from './Background.js';

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

/** Segments nearer than this (world units ahead of the camera) are clipped out. */
const CAM_CLIP_Z = 1;

/**
 * Scanline segment-projection renderer. Walks the active segments near→far,
 * projecting each with the Phase-1 primitives, accumulating curve (`dx`) and
 * pitch (`dy`) via `accumulateSegment`, and issuing `RenderBackend` draw calls
 * directly — no per-frame draw-list, no `ctx`. Reuses two scratch `Projected`
 * objects so the hot loop allocates nothing (hard rule 4).
 */
export class Renderer {
  private readonly near: Projected = { x: 0, y: 0, w: 0 };
  private readonly far: Projected = { x: 0, y: 0, w: 0 };

  constructor(private readonly config: TrackConfig) {}

  render(
    camera: Camera,
    track: TrackManager,
    backend: RenderBackend,
    background?: Background,
    curvatureAtCamera: number = 0,
  ): void {
    backend.clear(COLORS.sky);
    background?.render(camera, curvatureAtCamera, backend);

    const { segmentLength, drawDistance, roadWidth } = this.config;
    const base = Math.floor(camera.z / segmentLength);

    // Curve/pitch accumulator, integrated near→far from the camera segment.
    let acc = { x: 0, dx: 0, y: 0 };
    let maxy = LOGICAL_HEIGHT; // occlusion clip: nothing drawn below the frame yet
    let havePrev = false;

    for (let i = 0; i < drawDistance; i++) {
      const seg = track.segment(base + i);
      acc = accumulateSegment(acc, seg.curve, seg.pitch);

      const relZ = base * segmentLength + i * segmentLength - camera.z;
      if (relZ < CAM_CLIP_Z) {
        havePrev = false; // don't bridge a quad across the camera plane
        continue;
      }

      // Project this segment's centre into `far`; the previous one lives in `near`.
      this.projectInto(this.far, acc.x, acc.y, relZ, camera, roadWidth);

      if (havePrev) {
        const clip = clipToCrest(maxy, this.far.y);
        if (clip.visible) {
          maxy = clip.clip;
          const dark = Math.floor((base + i) / this.config.rumbleSegments) % 2 === 1;
          // Quad top = far edge (smaller y), bottom = near edge (larger y).
          backend.drawQuad(
            this.far.x, this.far.y, this.far.w,
            this.near.x, this.near.y, this.near.w,
            dark ? COLORS.roadDark : COLORS.road,
          );
        }
      }

      // Roll `far` → `near` for the next span without allocating.
      this.near.x = this.far.x;
      this.near.y = this.far.y;
      this.near.w = this.far.w;
      havePrev = true;
    }

    backend.present();
  }

  private projectInto(
    out: Projected, worldXCenter: number, worldY: number, relZ: number, camera: Camera, roadHalfWidth: number,
  ): void {
    const scale = scaleFor(camera.focalLength, relZ);
    out.x = projectX(worldXCenter, camera.x, scale, LOGICAL_WIDTH);
    out.y = projectY(worldY, camera.height, scale, LOGICAL_HEIGHT);
    out.w = scale * roadHalfWidth * (LOGICAL_WIDTH / 2);
  }
}
