import { LOGICAL_WIDTH, KMH_PER_WORLD, HEADER_H, HUD_MARGIN, HUD_ROW_Y } from '../constants.js';
import { PALETTE } from '../assets/palette.js';
import type { Camera, PlayerState } from '../types/engine.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { TrackManager } from '../engine/TrackManager.js';
import type { RouteState } from '../track/route.js';
import { drawText, textWidth } from './text.js';

export function speedToKmh(speed: number): number { return Math.round(speed * KMH_PER_WORLD); }

export function formatTime(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const tenth = Math.floor((t % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${tenth}`;
}

/**
 * TX-1 arcade header (1983 Tatsumi reference, spec §3 rec. 1): a solid deep-blue
 * banner across the top carrying the branching-route tree, colour-coded readouts,
 * and the gold "PASSED CARS" star gauge.
 *
 * Renders from caller-supplied state only — no simulation state of its own, and
 * no allocation per frame. Glyph colour comes from pre-baked palette variants in
 * the atlas (see FONT_COLORS), so coloured text costs the same as white text.
 */
export class HUD {
  static readonly HEADER_H = HEADER_H;
  static readonly HEADER_BG = PALETTE.ui.header;
  static readonly HEADER_EDGE = PALETTE.ui.headerEdge;
  static readonly STAR_SLOTS = 10;
  static readonly TREE_NODE = PALETTE.ui.treeNode; // scene not on the taken path
  static readonly TREE_PATH = PALETTE.ui.gold; // scene already visited (TX-1 yellow route line)
  static readonly TREE_ACTIVE = PALETTE.ui.cyan; // scene being driven now

  private static readonly LABEL = 1; // scale for the small magenta/cyan captions
  private static readonly VALUE = 2; // scale for the big readouts

  /** Star gauge width: STAR_SLOTS slots of a 7px face on an 8px pitch. */
  private static readonly STARS_W = 10 * 8;
  /** Header anchors, right-aligned inward from the safe margin. */
  private static readonly STARS_X = LOGICAL_WIDTH - HUD_MARGIN - HUD.STARS_W;
  private static readonly TIME_X = HUD.STARS_X - 76;

  constructor(private readonly atlas: SpriteAtlas) {}

  /** `route`, `passedCars` and `points` are optional so pre-route callers (and
   * the editor harness) can render the bare header. */
  /**
   * TX-1 composition (research §5a): everything that is *status* lives in the
   * shallow header band; the two readouts you watch while driving — SCORE and
   * SPEED — drop to the bottom corners where they never cross the road or the
   * backdrop plate.
   *
   * `_track` / `_camera` are unused now that the mini-map is gone, but stay in
   * the signature: Spec D wants the camera back for effect emission and
   * changing the shape would ripple into `main.ts` for no gain.
   */
  render(
    player: PlayerState, elapsedMs: number, _track: TrackManager, _camera: Camera,
    backend: RenderBackend, remainingMs?: number,
    route?: RouteState, passedCars = 0, points = 0,
  ): void {
    backend.fillBand(0, HUD.HEADER_H, HUD.HEADER_BG);
    backend.fillBand(HUD.HEADER_H, 1, HUD.HEADER_EDGE);

    // ── Header band ────────────────────────────────────────────────────────
    // stage — blue caption, white value, hard left against the safe margin
    this.label(backend, 'stage', HUD_MARGIN, 6, 'blue');
    this.value(backend, `${(route?.stage ?? 0) + 1}`, HUD_MARGIN, 16, 'white');

    // the 5-stage route pyramid, centred
    if (route) this.drawRouteTree(route, backend);

    // time — magenta caption, big red countdown, elapsed riding underneath
    this.label(backend, 'time', HUD.TIME_X, 6, 'magenta');
    if (remainingMs !== undefined) {
      this.value(backend, `${Math.ceil(remainingMs / 1000)}`, HUD.TIME_X, 16, 'red');
    }
    this.label(backend, formatTime(elapsedMs), HUD.TIME_X, 30, 'white');

    // passed cars — magenta caption over the gold star gauge, right-aligned
    this.label(backend, 'passed cars', HUD.STARS_X, 6, 'magenta');
    this.drawStarGauge(passedCars, HUD.STARS_X, 16, backend);

    // ── Bottom corners ─────────────────────────────────────────────────────
    // score, left — magenta caption over a cyan value
    this.label(backend, 'score', HUD_MARGIN, HUD_ROW_Y - 7, 'magenta');
    this.value(backend, `${points}`, HUD_MARGIN, HUD_ROW_Y, 'cyan');

    // gear then speed, right — both flush to the safe margin
    const gearText = `gear ${player.gear}`;
    this.label(
      backend, gearText,
      LOGICAL_WIDTH - HUD_MARGIN - textWidth(this.atlas, gearText, HUD.LABEL),
      HUD_ROW_Y - 7, 'white',
    );
    const speedText = `${speedToKmh(player.speed)}`;
    this.value(
      backend, speedText,
      LOGICAL_WIDTH - HUD_MARGIN - textWidth(this.atlas, speedText, HUD.VALUE),
      HUD_ROW_Y, 'cyan',
    );
  }

  private label(backend: RenderBackend, text: string, x: number, y: number, color: 'magenta' | 'cyan' | 'blue' | 'white'): void {
    drawText(backend, this.atlas, text, x, y, HUD.LABEL, color);
  }

  private value(backend: RenderBackend, text: string, x: number, y: number, color: 'cyan' | 'red' | 'white'): void {
    drawText(backend, this.atlas, text, x, y, HUD.VALUE, color);
  }

  /** Ten slots; one lights per overtaken car and the gauge saturates there. */
  private drawStarGauge(passedCars: number, x: number, y: number, backend: RenderBackend): void {
    const lit = Math.max(0, Math.min(HUD.STAR_SLOTS, Math.floor(passedCars)));
    for (let i = 0; i < HUD.STAR_SLOTS; i++) {
      const f = this.atlas.frame(i < lit ? 'star_on' : 'star_off');
      backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, x + i * (f.w + 1), y, f.w, f.h, 9999);
    }
  }

  /** The 5-stage pyramid as a compact node diagram: stage 1 at the top-left,
   * widening down, with the visited path and current scene picked out. */
  private drawRouteTree(route: RouteState, backend: RenderBackend): void {
    const cx0 = LOGICAL_WIDTH / 2, y0 = 6, pitchX = 5, pitchY = 5, half = 1;
    for (let s = 0; s < route.pyramid.length; s++) {
      const row = route.pyramid[s]!;
      const y = y0 + s * pitchY;
      for (let i = 0; i < row.length; i++) {
        const cx = cx0 + (i - (row.length - 1) / 2) * pitchX;
        const active = s === route.stage && i === route.sceneIdx;
        const visited = s < route.stage && route.visited[s] === i;
        const color = active ? HUD.TREE_ACTIVE : visited ? HUD.TREE_PATH : HUD.TREE_NODE;
        backend.drawQuad(cx, y, half, cx, y + 2, half, color);
      }
    }
  }
}
