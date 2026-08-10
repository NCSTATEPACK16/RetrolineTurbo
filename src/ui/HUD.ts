import { LOGICAL_WIDTH, KMH_PER_WORLD } from '../constants.js';
import type { Camera, PlayerState } from '../types/engine.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { TrackManager } from '../engine/TrackManager.js';
import type { RouteState } from '../track/route.js';
import { drawText } from './text.js';

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
  static readonly HEADER_H = 24;
  static readonly HEADER_BG = '#000088';
  static readonly HEADER_EDGE = '#3333ff';
  static readonly STAR_SLOTS = 10;
  static readonly TREE_NODE = '#5060c0'; // scene not on the taken path
  static readonly TREE_PATH = '#ffcc00'; // scene already visited (TX-1 yellow route line)
  static readonly TREE_ACTIVE = '#40e0e0'; // scene being driven now

  private static readonly LABEL = 1; // scale for the small magenta/cyan captions
  private static readonly VALUE = 2; // scale for the big readouts

  constructor(private readonly atlas: SpriteAtlas) {}

  /** `route`, `passedCars` and `points` are optional so pre-route callers (and
   * the editor harness) can render the bare header. */
  render(
    player: PlayerState, elapsedMs: number, track: TrackManager, camera: Camera,
    backend: RenderBackend, remainingMs?: number,
    route?: RouteState, passedCars = 0, points = 0,
  ): void {
    backend.fillBand(0, HUD.HEADER_H, HUD.HEADER_BG);
    backend.fillBand(HUD.HEADER_H, 1, HUD.HEADER_EDGE);

    if (route) this.drawRouteTree(route, backend);

    // your score — magenta caption, cyan value
    this.label(backend, 'your score', 72, 4, 'magenta');
    this.value(backend, `${points}`, 72, 12, 'cyan');

    // stage — blue caption, white value
    this.label(backend, 'stage', 150, 4, 'blue');
    this.value(backend, `${(route?.stage ?? 0) + 1}`, 150, 12, 'white');

    // time — magenta caption, big red countdown; elapsed rides underneath it
    this.label(backend, 'time', 186, 4, 'magenta');
    if (remainingMs !== undefined) {
      this.value(backend, `${Math.ceil(remainingMs / 1000)}`, 186, 12, 'red');
    }
    this.label(backend, formatTime(elapsedMs), 186, 19, 'white');

    // speed — cyan caption and value, with the gear digit alongside
    this.label(backend, 'speed', 244, 4, 'cyan');
    this.value(backend, `${speedToKmh(player.speed)}`, 244, 12, 'cyan');
    this.label(backend, `gear ${player.gear}`, 244, 19, 'white');

    // passed cars — magenta caption over the gold star gauge
    this.label(backend, 'passed cars', 320, 4, 'magenta');
    this.drawStarGauge(passedCars, 320, 11, backend);

    this.drawMiniMap(track, camera, backend);
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
    const x0 = 6, y0 = 3, pitchX = 5, pitchY = 4, half = 1;
    for (let s = 0; s < route.pyramid.length; s++) {
      const row = route.pyramid[s]!;
      const y = y0 + s * pitchY;
      for (let i = 0; i < row.length; i++) {
        const cx = x0 + (i - (row.length - 1) / 2) * pitchX + 24;
        const active = s === route.stage && i === route.sceneIdx;
        const visited = s < route.stage && route.visited[s] === i;
        const color = active ? HUD.TREE_ACTIVE : visited ? HUD.TREE_PATH : HUD.TREE_NODE;
        backend.drawQuad(cx, y, half, cx, y + 2, half, color);
      }
    }
  }

  private drawMiniMap(track: TrackManager, camera: Camera, backend: RenderBackend): void {
    const base = Math.floor(camera.z / 200);
    const x0 = LOGICAL_WIDTH - 40, y0 = HUD.HEADER_H + 8;
    for (let i = 0; i < 20; i++) {
      const seg = track.segment(base + i * 4);
      const cx = x0 + seg.curve * 2;
      backend.drawQuad(cx, y0 + i * 2, 2, cx, y0 + i * 2 + 1, 2, '#e8e8f0');
    }
  }
}
