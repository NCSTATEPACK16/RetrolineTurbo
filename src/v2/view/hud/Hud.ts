import palette from '../../../assets/palette.json';
import type { RaceState } from '../../sim/race.js';
import { lapOf, RACE } from '../../sim/race.js';
import type { SimWorld } from '../../sim/world.js';
import { DT } from '../../sim/world.js';
import { COINS } from '../../sim/coins.js';
import type { Centerline } from '../centerline.js';
import { FONT, FONT_H, FONT_W, ICONS, ITEM_ICON, fitPoints, ordinal, positionColor, textWidthPx } from './pixels.js';
import { Popups, type Mood } from './popups.js';
import { PORTRAITS, PORTRAIT_SIZE, composePortrait } from './portraits.js';

/**
 * Icon-first race HUD drawn on its own canvas at the internal resolution and
 * upscaled by the same whole number as the game, so it is as chunky and crisp
 * as the scene. Everything a 5-year-old needs reads without words: a big
 * position number, a chequered flag with laps, the item in a box, a mini-map
 * with coloured dots, and a face that pops up when something happens.
 * Glyphs and icons are pre-rendered once; per-frame work is drawImage/fillRect.
 */
const KEY_COLORS: Record<string, string> = {
  w: palette.ui.white, k: palette.outline, y: palette.ui.gold, o: palette.sky.sunset[4]!, r: palette.ui.red,
  c: palette.ui.cyan, m: palette.ui.magenta, g: palette.chrome[2]!, b: palette.ui.blue,
  // Portrait-only keys.
  s: palette.body.red[4]!, t: palette.sky.sunset[4]!, n: palette.trunk, e: palette.foliage[1]!, E: palette.foliage[0]!,
  l: palette.chrome[1]!, O: palette.sky.canyon[4]!,
};

function bitmap(rows: readonly string[], color: (ch: string) => string | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0]!.length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = color(row[x]!);
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
  return c;
}

export interface HudRect { x: number; y: number; w: number; h: number }

export class Hud {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly glyphs = new Map<string, HTMLCanvasElement>(); // `${color}${ch}`
  private readonly icons = new Map<string, HTMLCanvasElement>();
  private readonly map = document.createElement('canvas');
  private mapFit: ReturnType<typeof fitPoints> = { scale: 1, ox: 0, oy: 0, minX: 0, minZ: 0 };
  /** Pop-ups per player (each split-screen half has its own). */
  private readonly popups = new Map<number, Popups>();
  private blink = 0;
  /** Portrait id per car (roster id, or 'player'); cached compositions by id+mood+paint. */
  private portraitIds: readonly string[] = [];
  private readonly faces = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement, center: Centerline, private readonly carColors: readonly string[]) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    for (const key of Object.keys(KEY_COLORS)) {
      for (const [ch, rows] of Object.entries(FONT)) this.glyphs.set(key + ch, bitmap(rows, (p) => (p === '#' ? KEY_COLORS[key]! : null)));
    }
    for (const [name, rows] of Object.entries(ICONS)) this.icons.set(name, bitmap(rows, (p) => KEY_COLORS[p] ?? null));
    this.setTrack(center);
  }

  /** Redraw the mini-map outline for a (new) circuit. */
  setTrack(center: Centerline): void {
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < center.count; i += 6) { xs.push(center.pos[i * 3]!); zs.push(center.pos[i * 3 + 2]!); }
    this.map.width = 64;
    this.map.height = 48;
    this.mapFit = fitPoints(xs, zs, 64, 48, 3);
    const mg = this.map.getContext('2d')!;
    mg.fillStyle = 'rgba(16,16,24,0.55)';
    mg.fillRect(0, 0, 64, 48);
    for (const [col, w] of [[palette.outline, 3], [palette.ui.white, 1]] as const) {
      mg.fillStyle = col;
      for (let i = 0; i < xs.length; i++) {
        const { x, y } = this.toMap(xs[i]!, zs[i]!);
        mg.fillRect(Math.round(x - (w - 1) / 2), Math.round(y - (w - 1) / 2), w, w);
      }
    }
  }

  private toMap(x: number, z: number): { x: number; y: number } {
    const f = this.mapFit;
    return { x: (x - f.minX) * f.scale + f.ox, y: (z - f.minZ) * f.scale + f.oy };
  }

  resize(width: number, height: number, cssScale: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width * cssScale}px`;
    this.canvas.style.height = `${height * cssScale}px`;
    this.g.imageSmoothingEnabled = false;
  }

  /** Who is driving each car, for the pop-up portraits. */
  setDrivers(portraitIds: readonly string[]): void {
    this.portraitIds = portraitIds;
  }

  /** Forget per-player pop-up state (call at the start of each race). */
  reset(): void {
    this.popups.clear();
  }

  clear(): void {
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private text(s: string, x: number, y: number, scale: number, color: string): void {
    let cx = x;
    for (const ch of s) {
      const gl = this.glyphs.get(color + ch);
      if (gl) this.g.drawImage(gl, cx, y, FONT_W * scale, FONT_H * scale);
      cx += (FONT_W + 1) * scale;
    }
  }

  private icon(name: string, x: number, y: number, scale = 1): void {
    const ic = this.icons.get(name);
    if (ic) this.g.drawImage(ic, x, y, 11 * scale, 11 * scale);
  }

  /** Draw one player's HUD inside `r` (the whole screen, or their half in split-screen). */
  draw(race: RaceState, world: SimWorld, center: Centerline, player: number, r: HudRect, junior: boolean, dt: number): void {
    const g = this.g;
    if (r.y === 0) this.blink += dt; // once per frame, not once per player
    const me = race.racers[player]!;
    const items = race.items;
    let popups = this.popups.get(player);
    if (!popups) this.popups.set(player, (popups = new Popups()));
    popups.update(race, world, player, items.hits[player]!);
    const compact = r.h < 180;

    if (race.phase !== 'countdown') {
      // Position: big number, small suffix, podium colours.
      const pc = positionColor(me.position);
      const big = compact ? 3 : 4;
      this.text(String(me.position), r.x + 5, r.y + 5, big, 'k');
      this.text(String(me.position), r.x + 4, r.y + 4, big, pc);
      this.text(ordinal(me.position), r.x + 6 + FONT_W * big, r.y + 4, 1, pc);
      // Laps: chequered flag + n/N.
      const ly = r.y + 8 + FONT_H * big;
      this.icon('flag', r.x + 4, ly);
      this.text(`${Math.min(race.laps, lapOf(me) + 1)}/${race.laps}`, r.x + 16, ly + 3, 1, 'w');
      // Coins held: gold when the buff is maxed.
      this.icon('coin', r.x + 4, ly + 13);
      const coins = race.coins.held[player]!;
      this.text(String(coins), r.x + 16, ly + 16, 1, coins >= COINS.max ? 'y' : 'w');
    }

    // Item slot, top centre.
    const bx = r.x + Math.round(r.w / 2) - 9, by = r.y + 4;
    g.fillStyle = palette.outline;
    g.fillRect(bx, by, 19, 19);
    g.fillStyle = items.enabled ? palette.ui.white : palette.chrome[1]!;
    g.fillRect(bx + 1, by + 1, 17, 1); g.fillRect(bx + 1, by + 17, 17, 1);
    g.fillRect(bx + 1, by + 1, 1, 17); g.fillRect(bx + 17, by + 1, 1, 17);
    const held = items.held[player]!;
    if (held) this.icon(ITEM_ICON[held]!, bx + 4, by + 4);

    if (junior) this.text('JR', r.x + r.w - 12, r.y + 4, 1, 'c');

    // Mini-map with every racer as a dot; you are the big red one.
    if (!compact) {
      const mx = r.x + r.w - 68, my = r.y + r.h - 52;
      g.drawImage(this.map, mx, my);
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < world.cars.length; i++) {
          if ((i === player) !== (pass === 1)) continue; // draw the player last, on top
          const c = world.cars[i]!;
          const k = Math.floor(((c.s % center.length) / center.length) * center.count) % center.count;
          const p = this.toMap(center.pos[k * 3]!, center.pos[k * 3 + 2]!);
          const size = i === player ? 4 : 3;
          g.fillStyle = palette.outline;
          g.fillRect(Math.round(mx + p.x - size / 2) - 1, Math.round(my + p.y - size / 2) - 1, size + 2, size + 2);
          g.fillStyle = this.carColors[i] ?? palette.ui.white;
          g.fillRect(Math.round(mx + p.x - size / 2), Math.round(my + p.y - size / 2), size, size);
        }
      }
    }

    // Portrait pop-up, bottom-left.
    const pop = popups.current;
    if (pop) this.face(r.x + 6, r.y + r.h - 38, pop.car, pop.mood);

    // Countdown and GO.
    const cx = r.x + r.w / 2, cy = r.y + r.h * 0.38;
    if (race.phase === 'countdown') {
      const n = String(Math.ceil((race.countdownTicks - race.tick) * DT));
      const s = compact ? 5 : 7;
      this.text(n, Math.round(cx - (textWidthPx(n) * s) / 2) + 2, Math.round(cy) + 2, s, 'k');
      this.text(n, Math.round(cx - (textWidthPx(n) * s) / 2), Math.round(cy), s, 'y');
    } else if (race.tick - race.countdownTicks < 50) {
      const s = compact ? 4 : 6;
      this.text('GO!', Math.round(cx - (textWidthPx('GO!') * s) / 2) + 2, Math.round(cy) + 2, s, 'k');
      this.text('GO!', Math.round(cx - (textWidthPx('GO!') * s) / 2), Math.round(cy), s, 'c');
    }

    // Wrong way: a blinking turn-around arrow.
    if (me.wrongWay > RACE.wrongWaySeconds && (this.blink % 0.5) < 0.3) this.icon('wrongWay', Math.round(cx - 11), r.y + (compact ? 26 : 30), 2);

    // Split-screen divider along the top of the lower half.
    if (r.y > 0) {
      g.fillStyle = palette.outline;
      g.fillRect(r.x, r.y - 1, r.w, 2);
    }
  }

  /** A driver's 16x16 portrait for a mood, composed once and cached. */
  portrait(car: number, mood: Mood): HTMLCanvasElement {
    const id = this.portraitIds[car] ?? 'player';
    const paint = this.carColors[car] ?? palette.ui.white;
    const key = `${id}|${mood}|${paint}`;
    let c = this.faces.get(key);
    if (!c) {
      const art = PORTRAITS[id] ?? PORTRAITS.player!;
      c = bitmap(composePortrait(art, mood), (p) => (p === '.' ? palette.sky.sunset[0]! : p === 'P' ? paint : KEY_COLORS[p] ?? null));
      this.faces.set(key, c);
    }
    return c;
  }

  /** Portrait pop-up: the face at 2x in a white frame. */
  private face(x: number, y: number, car: number, mood: Mood): void {
    const size = PORTRAIT_SIZE * 2;
    this.g.fillStyle = palette.outline;
    this.g.fillRect(x - 2, y - 2, size + 4, size + 4);
    this.g.fillStyle = palette.ui.white;
    this.g.fillRect(x - 1, y - 1, size + 2, size + 2);
    this.g.drawImage(this.portrait(car, mood), x, y, size, size);
  }
}
