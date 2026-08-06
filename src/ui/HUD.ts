import { LOGICAL_WIDTH } from '../constants.js';
import type { Camera, PlayerState } from '../types/engine.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { TrackManager } from '../engine/TrackManager.js';

const KMH_PER_WORLD = 0.05; // world units/s → km/h display (provisional; retuned at gate)

export function speedToKmh(speed: number): number { return Math.round(speed * KMH_PER_WORLD); }

export function formatTime(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const tenth = Math.floor((t % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${tenth}`;
}

/** Renders the HUD from PlayerState only — no simulation state of its own. Draws
 * digits/colon from the bitmap-font atlas frames and a curvature mini-map strip. */
export class HUD {
  private static readonly SCALE = 2;
  constructor(private readonly atlas: SpriteAtlas) {}

  render(player: PlayerState, elapsedMs: number, track: TrackManager, camera: Camera, backend: RenderBackend): void {
    this.drawString(backend, `${speedToKmh(player.speed)}`, 6, 6);          // speedo
    this.drawString(backend, `${player.gear}`, 6, 18);                       // gear
    this.drawString(backend, formatTime(elapsedMs), LOGICAL_WIDTH - 70, 6);  // timer
    this.drawMiniMap(track, camera, backend);
  }

  private drawString(backend: RenderBackend, text: string, x: number, y: number): void {
    const S = HUD.SCALE;
    let cx = x;
    for (const ch of text) {
      const name = ch === ':' ? 'glyph_colon' : ch === '.' ? 'glyph_colon' : `digit_${ch}`;
      const f = this.atlas.frame(name);
      backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, cx, y, f.w * S, f.h * S, 9999);
      cx += (f.w + 1) * S;
    }
  }

  private drawMiniMap(track: TrackManager, camera: Camera, backend: RenderBackend): void {
    const base = Math.floor(camera.z / 200);
    const x0 = LOGICAL_WIDTH - 40, y0 = 30;
    for (let i = 0; i < 20; i++) {
      const seg = track.segment(base + i * 4);
      const cx = x0 + seg.curve * 2;
      backend.drawQuad(cx, y0 + i * 2, 2, cx, y0 + i * 2 + 1, 2, '#e8e8f0');
    }
  }
}
