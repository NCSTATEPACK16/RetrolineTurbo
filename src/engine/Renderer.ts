import { scaleFor, projectX, projectY, accumulateSegment, clipToCrest } from '../math/projection.js';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, COLORS, DEFAULT_CAMERA_HEIGHT } from '../constants.js';
import type { Camera, TrackConfig, SpriteFrame } from '../types/engine.js';
import type { RenderBackend } from './RenderBackend.js';
import type { TrackManager } from './TrackManager.js';
import type { Background } from './Background.js';
import type { Backdrop } from './Backdrop.js';
import type { SpriteAtlas } from './SpriteAtlas.js';
import type { Traffic } from './Traffic.js';
import { branchSpread, fillRoadOffsets } from './BranchRenderer.js';

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
 * Per-segment projection record, filled in the road loop and consumed by the
 * far→near sprite pass. Pre-allocated once (one per draw-distance slot) so the
 * second pass allocates nothing (hard rule 4).
 */
interface ProjRecord {
  valid: boolean;
  x: number;
  y: number;
  w: number;
  relZ: number;
  maxy: number;
  base: number;
}

/**
 * Scanline segment-projection renderer. Walks the active segments near→far,
 * projecting each with the Phase-1 primitives, accumulating curve (`dx`) and
 * pitch (`dy`) via `accumulateSegment`, and issuing `RenderBackend` draw calls
 * directly — no per-frame draw-list, no `ctx`. Reuses two scratch `Projected`
 * objects and a pre-allocated `ProjRecord[]` so the hot loop allocates nothing
 * (hard rule 4). After the road loop, a far→near pass draws depth-sorted
 * roadside sprites and traffic, bottom-clipped against the hill crest.
 */
export class Renderer {
  /** World-units spread at full separation, in road half-widths (provisional; gate-tuned). */
  static readonly MAX_SPREAD_ROADWIDTHS = 2.5;

  private readonly near: Projected = { x: 0, y: 0, w: 0 };
  private readonly far: Projected = { x: 0, y: 0, w: 0 };
  private readonly records: ProjRecord[];
  // Branch bookkeeping — pre-allocated so the fork pass allocates nothing.
  private readonly offsetsFar = [0, 0, 0];
  private readonly offsetsNear = [0, 0, 0];
  private roadsFar = 1;
  private roadsNear = 1;
  private spreadFar = 0;
  private spreadNear = 0;

  constructor(private readonly config: TrackConfig, private readonly atlas: SpriteAtlas) {
    this.records = Array.from({ length: config.drawDistance }, () => (
      { valid: false, x: 0, y: 0, w: 0, relZ: 0, maxy: LOGICAL_HEIGHT, base: 0 }));
  }

  render(
    camera: Camera,
    track: TrackManager,
    backend: RenderBackend,
    background?: Background,
    traffic?: Traffic,
    curvatureAtCamera: number = 0,
    backdrop?: Backdrop,
  ): void {
    backend.clear(COLORS.sky);
    background?.render(camera, curvatureAtCamera, backend, backdrop);

    const { segmentLength, drawDistance, roadWidth } = this.config;
    const base = Math.floor(camera.z / segmentLength);

    // Curve/pitch accumulator, integrated near→far from the camera segment.
    let acc = { x: 0, dx: 0, y: 0 };
    let maxy = LOGICAL_HEIGHT; // occlusion clip: nothing drawn below the frame yet
    let havePrev = false;

    const branch = track.activeBranch;
    const maxSpread = roadWidth * Renderer.MAX_SPREAD_ROADWIDTHS;
    this.spreadNear = 0;
    this.roadsNear = 1;
    this.offsetsNear[0] = 0;

    for (let i = 0; i < drawDistance; i++) {
      const seg = track.segment(base + i);
      acc = accumulateSegment(acc, seg.curve, seg.pitch);

      const rec = this.records[i]!;
      rec.valid = false; // reset; set true only when the span is actually drawn

      const relZ = base * segmentLength + i * segmentLength - camera.z;
      if (relZ < CAM_CLIP_Z) {
        havePrev = false; // don't bridge a quad across the camera plane
        continue;
      }
      // A forked track hands off at its node; drawing wrapped-around segments
      // past the end would paint the scene's opening at full spread. End the
      // road at the horizon instead (route mode swaps scenes before it shows).
      if (branch && base + i >= track.length) break;

      // Fork geometry for this segment (single centred road when no branch).
      this.spreadFar = branch ? branchSpread(base + i, branch, maxSpread) : 0;
      this.roadsFar = branch
        ? fillRoadOffsets(this.offsetsFar, branch.ways, this.spreadFar)
        : (this.offsetsFar[0] = 0, 1);

      // Project this segment's centre into `far`; the previous one lives in `near`.
      this.projectInto(this.far, acc.x, acc.y, relZ, camera, roadWidth);

      if (havePrev) {
        const clip = clipToCrest(maxy, this.far.y);
        if (clip.visible) {
          maxy = clip.clip;
          const dark = Math.floor((base + i) / this.config.rumbleSegments) % 2 === 1;

          // Median wedge between the diverging inner edges, once a gap exists
          // on both ends of the span (roads overlay its edges).
          if (this.spreadFar > roadWidth && this.spreadNear > roadWidth) {
            backend.drawQuad(
              this.far.x, this.far.y, this.far.w * ((this.spreadFar - roadWidth) / roadWidth),
              this.near.x, this.near.y, this.near.w * ((this.spreadNear - roadWidth) / roadWidth),
              COLORS.groundDark,
            );
          }

          // Each branch road is the same trapezoid span shifted by its offset
          // (screen offset = projected half-width × worldOffset / roadWidth).
          for (let r = 0; r < this.roadsFar; r++) {
            const offFarPx = this.far.w * (this.offsetsFar[r]! / roadWidth);
            const offNearPx = this.near.w * ((this.roadsNear > r ? this.offsetsNear[r]! : 0) / roadWidth);
            const fx = this.far.x + offFarPx;
            const nx = this.near.x + offNearPx;

            // Rumble (wider, drawn first so the road overlays it).
            backend.drawQuad(
              fx, this.far.y, this.far.w * 1.15,
              nx, this.near.y, this.near.w * 1.15,
              dark ? COLORS.rumbleDark : COLORS.rumbleLight,
            );
            // Road surface.
            backend.drawQuad(
              fx, this.far.y, this.far.w,
              nx, this.near.y, this.near.w,
              dark ? COLORS.roadDark : COLORS.road,
            );
            // Centre lane line on light bands only.
            if (!dark) {
              backend.drawQuad(
                fx, this.far.y, this.far.w * 0.04,
                nx, this.near.y, this.near.w * 0.04,
                COLORS.lane,
              );
            }
          }

          // Record the projected far point (centre-line) for the sprite pass.
          rec.valid = true;
          rec.x = this.far.x; rec.y = this.far.y; rec.w = this.far.w;
          rec.relZ = relZ; rec.maxy = maxy; rec.base = base + i;
        }
      }

      // Roll `far` → `near` (and the fork state) for the next span, no allocation.
      this.near.x = this.far.x;
      this.near.y = this.far.y;
      this.near.w = this.far.w;
      this.spreadNear = this.spreadFar;
      this.roadsNear = this.roadsFar;
      this.offsetsNear[0] = this.offsetsFar[0]!;
      this.offsetsNear[1] = this.offsetsFar[1]!;
      this.offsetsNear[2] = this.offsetsFar[2]!;
      havePrev = true;
    }

    this.drawSprites(camera, track, backend, traffic);
    this.drawPlayerCar(backend);
    // NOTE: present() is the caller's responsibility so the HUD can composite
    // onto the same logical frame before the blit (see main.ts render step).
  }

  private projectInto(
    out: Projected, worldXCenter: number, worldY: number, relZ: number, camera: Camera, roadHalfWidth: number,
  ): void {
    const scale = scaleFor(camera.focalLength, relZ);
    out.x = projectX(worldXCenter, camera.x, scale, LOGICAL_WIDTH);
    out.y = projectY(worldY, camera.height, scale, LOGICAL_HEIGHT);
    out.w = scale * roadHalfWidth * (LOGICAL_WIDTH / 2);
  }

  /** Second, far→near pass: draw each visible segment's static sprites and any
   * traffic car mapped to it, painter-ordered and crest bottom-clipped. */
  private drawSprites(camera: Camera, track: TrackManager, backend: RenderBackend, traffic?: Traffic): void {
    const { segmentLength, roadWidth, drawDistance } = this.config;
    for (let i = drawDistance - 1; i >= 0; i--) {          // far → near
      const rec = this.records[i]!;
      if (!rec.valid) continue;
      const seg = track.segment(rec.base);
      for (const sp of seg.sprites) this.blit(backend, this.atlas.frame(sp.name), rec, sp.offset, camera, roadWidth);
      if (traffic) for (const car of traffic.cars) {
        if (Math.floor(car.z / segmentLength) === rec.base) {
          this.blit(backend, this.atlas.frame(car.sprite), rec, car.offset, camera, roadWidth);
        }
      }
    }
  }

  private blit(backend: RenderBackend, f: SpriteFrame, rec: ProjRecord, offset: number, camera: Camera, roadHalfWidth: number): void {
    const scale = scaleFor(camera.focalLength, rec.relZ);
    const dw = scale * f.w * (LOGICAL_WIDTH / 2) * (roadHalfWidth / DEFAULT_CAMERA_HEIGHT); // provisional world→px sprite scale, retuned at gate
    const dh = dw * (f.h / f.w);
    const cx = rec.x + rec.w * offset;                       // lateral: offset in road-half-widths
    const dx = cx - dw * (f.anchorX / f.w);
    const dy = rec.y - dh * (f.anchorY / f.h);
    backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, rec.maxy);
  }

  private drawPlayerCar(backend: RenderBackend): void {
    const f = this.atlas.frame('player');
    const dw = f.w * 3, dh = f.h * 3;                         // fixed foreground scale (provisional)
    const dx = (LOGICAL_WIDTH - dw) / 2;
    const dy = LOGICAL_HEIGHT - dh - 6;
    backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, LOGICAL_HEIGHT);
  }
}
