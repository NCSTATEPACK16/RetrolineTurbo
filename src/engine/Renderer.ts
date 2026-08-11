import { scaleFor, projectX, projectY, accumulateSegment, clipToCrest } from '../math/projection.js';
import {
  LOGICAL_WIDTH, LOGICAL_HEIGHT, COLORS, DEFAULT_CAMERA_HEIGHT,
  PLAYER_CAR_WIDTH, PLAYER_CAR_BASE_Y,
} from '../constants.js';
import type { Camera, TrackConfig, SpriteFrame, PlayerState } from '../types/engine.js';
import type { RenderBackend } from './RenderBackend.js';
import type { TrackManager } from './TrackManager.js';
import type { Background } from './Background.js';
import type { Backdrop } from './Backdrop.js';
import type { SpriteAtlas } from './SpriteAtlas.js';
import type { Traffic } from './Traffic.js';
import { branchSpread, fillRoadOffsets } from './BranchRenderer.js';
import { bandMerges } from './roadBanding.js';
import { OVERLAY_CULL_STEP, quantisedWidth } from '../math/ladder.js';
import { overlayDest, type Rect } from './SpriteComposer.js';
import type { CarFrameSet } from './CarFrameSet.js';

/** Which baked car frame to draw: one of three authored angles, optionally mirrored. */
export interface CarFrameChoice { angle: number; flipX: boolean; skid: boolean }

/** Steer magnitudes at which the car swaps to the next authored steering frame. */
const STEER_FRAME_1 = 0.1;
const STEER_FRAME_2 = 0.5;

/**
 * Steering-frame selection.
 *
 * Three authored angles (0, 15, 30 degrees) cover both directions via horizontal
 * flip (research §3c), which halves the atlas. NaN falls through to the straight
 * frame because the render loop must never throw.
 */
export function selectCarFrame(steer: number, skidding: boolean): CarFrameChoice {
  const mag = Math.abs(steer);
  const angle = mag > STEER_FRAME_2 ? 2 : mag > STEER_FRAME_1 ? 1 : 0;
  return { angle, flipX: steer < 0, skid: skidding };
}

/** Nobody sees an exhaust tip on a 24px car (research §4b). */
export function overlaysVisible(step: number): boolean {
  return step < OVERLAY_CULL_STEP;
}

/** One overlay part and the body anchor it is pinned to. */
export interface BakedOverlay {
  /** Anchor name in the body frame, e.g. `wheelBL`. */
  anchor: string;
  set: CarFrameSet;
}

/**
 * The baked car artwork, handed over when the async atlas arrives.
 *
 * Overlays are separate frame sets rather than extra body variants: parts pinned
 * to anchors are what lets 80 upgrade parts share 12 car frames instead of
 * multiplying them (research §4b).
 *
 * Each wheel is its OWN overlay. Reusing one wheel sprite at four anchors was
 * tried and looks wrong — the far wheels are smaller and higher, and on a turned
 * car they show the rim face while the near ones show tread.
 *
 * `under` parts are drawn BEFORE the body so the bodywork occludes them. Wheels
 * are baked unoccluded (their pass hides the body), so drawing them on top paints
 * a whole wheel over the arch and the car reads as sitting on stilts. Painter
 * order is the only depth sorting available, and putting the body last restores
 * exactly the occlusion the single-pass render has.
 */
export interface BakedCar {
  image: CanvasImageSource;
  body: CarFrameSet;
  under: readonly BakedOverlay[];
  brake: CarFrameSet | null;
  /** Index into the body set's colour dimension. */
  color: number;
}

/** Vertical nudge, in px, when the car is on its outermost steering frame.
 * Body roll is faked by a vertical offset: rotating the sprite is the Mode-7
 * look the project avoids, and RenderBackend has no rotation by design. */
const ROLL_OFFSET_PX = 1;

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
    y: projectY(worldY, camera.height, scale, height, camera.horizon),
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
  // Baked car artwork and its scratch space. Pre-allocated so the overlay pass
  // allocates nothing per frame (hard rule 4).
  private bakedCar: BakedCar | null = null;
  private readonly anchorOut: [number, number] = [0, 0];
  private readonly overlayRect: Rect = { dx: 0, dy: 0, dw: 0, dh: 0 };

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
    player?: PlayerState,
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
          const merged = bandMerges(this.near.y - this.far.y, this.config.rumbleSegments);
          const dark = !merged && Math.floor((base + i) / this.config.rumbleSegments) % 2 === 1;

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

            // Shoulder: a thin band between kerb and grass, on BOTH phases, so
            // the kerb red never vibrates against the foliage green (§1d).
            backend.drawQuad(
              fx, this.far.y, this.far.w * 1.22,
              nx, this.near.y, this.near.w * 1.22,
              COLORS.shoulder,
            );
            // Kerb (wider, drawn before the road so the road overlays it).
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
            // Centre lane dash on light bands only — and never on a merged band,
            // where it would be sub-row noise.
            if (!dark && !merged) {
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
    this.drawPlayerCar(backend, player);
    // NOTE: present() is the caller's responsibility so the HUD can composite
    // onto the same logical frame before the blit (see main.ts render step).
  }

  private projectInto(
    out: Projected, worldXCenter: number, worldY: number, relZ: number, camera: Camera, roadHalfWidth: number,
  ): void {
    const scale = scaleFor(camera.focalLength, relZ);
    out.x = projectX(worldXCenter, camera.x, scale, LOGICAL_WIDTH);
    out.y = projectY(worldY, camera.height, scale, LOGICAL_HEIGHT, camera.horizon);
    out.w = scale * roadHalfWidth * (LOGICAL_WIDTH / 2);
  }

  /** Second, far→near pass: draw each visible segment's static sprites and any
   * traffic car mapped to it, painter-ordered and crest bottom-clipped.
   *
   * PERF: this rescans the whole traffic array for every visible segment, so it
   * is O(drawDistance x cars) — 300 x 4 = 1200 iterations/frame today, which is
   * nothing. At the ~60 cars the research describes it would be 18,000. Bucket
   * cars by segment index before the draw pass if the count passes ~12; do not
   * ship the naive loop at scale. */
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
    // The provisional world→px term now only picks a ladder step; it no longer
    // scales the blit, so the drawn size is always one of 12 pre-baked widths.
    // That is the whole anti-shimmer mechanism: with imageSmoothingEnabled off, a
    // continuously varying destination width resamples at a slightly different
    // ratio every frame and the pixels crawl.
    const ideal = scale * f.w * (LOGICAL_WIDTH / 2) * (roadHalfWidth / DEFAULT_CAMERA_HEIGHT);
    const dw = quantisedWidth(ideal);
    const dh = dw * (f.h / f.w);
    const cx = rec.x + rec.w * offset;                       // lateral: offset in road-half-widths
    const dx = cx - dw * (f.anchorX / f.w);
    const dy = rec.y - dh * (f.anchorY / f.h);
    backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, rec.maxy);
  }

  /** Hand over the baked car artwork once the async atlas has arrived. Null
   * restores the procedural placeholder, so a failed fetch degrades the picture
   * rather than the loop. */
  setBakedCar(car: BakedCar | null): void {
    this.bakedCar = car;
  }

  private drawPlayerCar(backend: RenderBackend, player?: PlayerState): void {
    const baked = this.bakedCar;
    if (!baked) {
      const f = this.atlas.frame('player');
      // Layout-locked size and position (research §5a). Spec C swaps the artwork
      // behind this without re-deriving where the car sits.
      const dw = PLAYER_CAR_WIDTH;
      const dh = dw * (f.h / f.w);
      const dx = (LOGICAL_WIDTH - dw) / 2;
      const dy = PLAYER_CAR_BASE_Y - dh;
      backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, LOGICAL_HEIGHT);
      return;
    }

    const choice = selectCarFrame(player?.steer ?? 0, player?.skidding ?? false);
    // The player car always sits on the largest ladder step, and each baked
    // frame is drawn at its NATIVE size — a turned car is genuinely wider on
    // screen, so forcing every angle to one width would squash it.
    const f = baked.body.frame(baked.color, choice.angle, 0);
    const dw = f.w;
    const dh = f.h;
    const dx = (LOGICAL_WIDTH - dw) / 2;
    const roll = choice.angle === 2 ? ROLL_OFFSET_PX : 0;
    const dy = PLAYER_CAR_BASE_Y - dh + roll;
    const showOverlays = overlaysVisible(0);

    // Wheels first, then the body over them: the wheel passes were baked with the
    // body hidden, so painting them last would cover the arches.
    if (showOverlays) {
      for (const part of baked.under) {
        if (!baked.body.anchor(choice.angle, part.anchor, this.anchorOut)) continue;
        const w = part.set.frame(0, choice.angle, 0);
        overlayDest(dx, dy, dw, dh, this.anchorOut[0], this.anchorOut[1],
          w.w, w.h, choice.flipX, this.overlayRect);
        const r = this.overlayRect;
        backend.drawSprite(baked.image, w.x, w.y, w.w, w.h,
          r.dx, r.dy, r.dw, r.dh, LOGICAL_HEIGHT, choice.flipX);
      }
    }

    backend.drawSprite(baked.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, LOGICAL_HEIGHT, choice.flipX);

    if (!showOverlays) return;
    if (baked.brake && player?.braking && baked.body.anchor(choice.angle, 'brake', this.anchorOut)) {
      const b = baked.brake.frame(0, choice.angle, 0);
      overlayDest(dx, dy, dw, dh, this.anchorOut[0], this.anchorOut[1],
        b.w, b.h, choice.flipX, this.overlayRect);
      const r = this.overlayRect;
      backend.drawSprite(baked.image, b.x, b.y, b.w, b.h,
        r.dx, r.dy, r.dw, r.dh, LOGICAL_HEIGHT, choice.flipX);
    }
  }
}
