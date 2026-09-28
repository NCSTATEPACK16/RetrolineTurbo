import * as THREE from 'three';
import { STAT_KEYS, STAT_MAX, type CarStats } from '../sim/car.js';
import { PARTS, PART_BY_ID, PAINTS, HORNS, PART_SLOTS, buildStats, type CarBuild, type PartSlot } from '../sim/parts.js';
import { buy, equip, isUnlocked, owns, type Profile } from '../sim/economy.js';
import type { CarKit } from '../view/carKit.js';
import type { MenuNav } from './menu.js';

/**
 * The garage (PRD section 8): browse a part in each slot and see it on the
 * car and in the stat bars before you buy. Owned parts equip as you browse;
 * others show a price (or the trophy that unlocks them) and buy on OK.
 * Choices only, no text entry. The preview is its own tiny WebGL canvas,
 * rendered low-res and upscaled like the game.
 */
type Row = PartSlot | 'paint' | 'horn' | 'done';
const ROWS: readonly Row[] = [...PART_SLOTS, 'paint', 'horn', 'done'];
const ROW_ICON: Readonly<Record<Row, string>> = {
  body: '🚗', wheels: '🛞', engine: '⚙️', spoiler: '🪽', exhaust: '🔥', paint: '🎨', horn: '📯', done: '✔',
};
const STAT_LABEL: Readonly<Record<(typeof STAT_KEYS)[number], string>> = {
  speed: 'SPD', accel: 'ACC', handling: 'HDL', weight: 'WGT', offroad: 'OFF', miniTurbo: 'MT',
};

/** Per stat: how many bar segments are kept, gained and lost going from `now` to `next`. */
export function statDiff(now: CarStats, next: CarStats): { key: string; keep: number; gain: number; lose: number }[] {
  return STAT_KEYS.map((key) => {
    const a = now[key], b = next[key];
    return { key, keep: Math.min(a, b), gain: Math.max(0, b - a), lose: Math.max(0, a - b) };
  });
}

const CSS = `
.rt-garage { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: auto;
  font: 700 16px/1.2 ui-monospace, 'SF Mono', Menlo, monospace; color: #fcfcfc; text-transform: uppercase; }
.rt-garage[hidden] { display: none; }
.rt-garage .panel { background: rgba(16,16,24,0.9); border: 4px solid #fcfcfc; box-shadow: 0 0 0 4px #101018;
  padding: 16px; display: grid; grid-template-columns: auto 1fr; gap: 16px; max-width: calc(100vw - 32px); box-sizing: border-box; }
@media (max-width: 720px) { .rt-garage .panel { grid-template-columns: 1fr; } }
.rt-garage h2 { margin: 0 0 8px; color: #fee971; font-size: 22px; display: flex; justify-content: space-between; gap: 16px; }
.rt-garage canvas { width: 320px; height: 200px; image-rendering: pixelated; background: #1e1a5b; border: 2px solid #5a5a6a; max-width: 100%; }
.rt-garage .bars { margin-top: 8px; display: grid; grid-template-columns: 40px 1fr; gap: 3px 8px; font-size: 12px; }
.rt-garage .bar { display: flex; gap: 2px; }
.rt-garage .seg { width: 20px; height: 10px; background: #2a2a32; }
.rt-garage .seg.k { background: #e8e8f0; } .rt-garage .seg.g { background: #58b85a; } .rt-garage .seg.l { background: #f03030; }
.rt-garage .row { display: grid; grid-template-columns: 30px 90px 1fr auto; align-items: center; gap: 8px; padding: 5px 6px;
  border: 2px solid transparent; cursor: pointer; user-select: none; }
.rt-garage .row.sel { border-color: #fee971; background: rgba(254,233,113,0.12); }
.rt-garage .name { color: #fee971; display: flex; gap: 8px; align-items: center; }
.rt-garage .name button { font: inherit; color: #fcfcfc; background: none; border: 0; cursor: pointer; padding: 0 2px; }
.rt-garage .tag { font-size: 12px; color: #a0a0b0; }
.rt-garage .tag.buy { color: #58b85a; } .rt-garage .tag.poor { color: #f03030; }
.rt-garage .hint { margin-top: 8px; font-size: 12px; color: #a0a0b0; text-transform: none; }
`;

export class Garage {
  readonly root = document.createElement('div');
  private readonly panel = document.createElement('div');
  private readonly credits = document.createElement('span');
  private readonly list = document.createElement('div');
  private readonly bars = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 160 / 100, 0.1, 50);
  private readonly car = new THREE.Group();
  private kit: CarKit | null = null;
  private paintMat: THREE.MeshToonMaterial | null = null;
  private sel = ROWS.length - 1;
  /** The part being looked at in each slot (defaults to what is equipped). */
  private browse: Record<Row, number> = { body: 0, wheels: 0, engine: 0, spoiler: 0, exhaust: 0, paint: 0, horn: 0, done: 0 };
  private spin = 0;
  onDone: (() => void) | null = null;
  /** Called after anything changes the profile (to save it). */
  onChange: (() => void) | null = null;

  constructor(parent: HTMLElement, private readonly profile: Profile) {
    if (!document.getElementById('rt-garage-css')) {
      const style = document.createElement('style');
      style.id = 'rt-garage-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.root.className = 'rt-garage';
    this.root.hidden = true;
    this.panel.className = 'panel';
    const left = document.createElement('div');
    this.canvas.width = 160;
    this.canvas.height = 100;
    this.bars.className = 'bars';
    left.append(this.canvas, this.bars);
    const right = document.createElement('div');
    const h = document.createElement('h2');
    const title = document.createElement('span');
    title.textContent = 'Garage';
    h.append(title, this.credits);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '▲▼ pick a part · ◀▶ look · Enter / A buy · Esc back';
    right.append(h, this.list, hint);
    this.panel.append(left, right);
    this.root.append(this.panel);
    parent.append(this.root);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(160, 100, false);
    } catch { /* no second WebGL context: stats still work */ }
    this.scene.background = new THREE.Color('#1e1a5b');
    this.scene.add(new THREE.HemisphereLight(0xfff0e0, 0x404050, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1, 2, 1);
    this.scene.add(sun, this.car);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 12), new THREE.MeshBasicMaterial({ color: '#441d7f' }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.camera.position.set(0, 2.1, 6.4);
    this.camera.lookAt(0, 0.45, 0);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setKit(kit: CarKit): void {
    this.kit = kit;
    this.paintMat = kit.paint('#ffffff');
    if (this.open) this.render();
  }

  show(): void {
    this.syncBrowse();
    this.sel = ROWS.length - 1;
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private options(row: Row): readonly string[] {
    if (row === 'paint') return PAINTS.map((p) => p.id);
    if (row === 'horn') return HORNS.map((h) => h.id);
    if (row === 'done') return [];
    return PARTS.filter((p) => p.slot === row).map((p) => p.id);
  }

  private syncBrowse(): void {
    for (const row of ROWS) {
      if (row === 'done') continue;
      this.browse[row] = Math.max(0, this.options(row).indexOf(this.profile.build[row]));
    }
  }

  /** The build as it would be with the browsed part in the selected slot. */
  private candidate(): CarBuild {
    const b = { ...this.profile.build };
    const row = ROWS[this.sel]!;
    if (row !== 'done') b[row] = this.options(row)[this.browse[row]]!;
    return b;
  }

  nav(n: MenuNav): void {
    if (!this.open) return;
    const row = ROWS[this.sel]!;
    if (n === 'up' || n === 'down') {
      this.syncBrowse(); // leaving a row: show what's equipped again
      this.sel = (this.sel + (n === 'up' ? ROWS.length - 1 : 1)) % ROWS.length;
    } else if (n === 'left' || n === 'right') {
      if (row === 'done') return;
      const count = this.options(row).length;
      this.browse[row] = (this.browse[row] + (n === 'left' ? count - 1 : 1)) % count;
      const id = this.options(row)[this.browse[row]]!;
      if (equip(this.profile, row, id)) this.onChange?.(); // owned parts, paints and horns equip as you look
    } else if (n === 'ok') {
      if (row === 'done') return this.onDone?.();
      const id = this.options(row)[this.browse[row]]!;
      if (row !== 'paint' && row !== 'horn' && buy(this.profile, id) === 'ok') {
        equip(this.profile, row, id);
        this.onChange?.();
      }
    } else if (n === 'back') {
      return this.onDone?.();
    }
    this.render();
  }

  private render(): void {
    this.credits.textContent = `💰 ${this.profile.credits}`;
    const cand = this.candidate();
    this.list.replaceChildren(...ROWS.map((row, i) => this.renderRow(row, i)));
    // Stat bars: what you have vs what you're looking at.
    const diff = statDiff(buildStats(this.profile.build), buildStats(cand));
    this.bars.replaceChildren(...diff.flatMap((d) => {
      const label = document.createElement('span');
      label.textContent = STAT_LABEL[d.key as keyof typeof STAT_LABEL];
      const bar = document.createElement('span');
      bar.className = 'bar';
      for (let s = 0; s < STAT_MAX; s++) {
        const seg = document.createElement('span');
        seg.className = 'seg' + (s < d.keep ? ' k' : s < d.keep + d.gain ? ' g' : s < d.keep + d.lose ? ' l' : '');
        bar.append(seg);
      }
      return [label, bar];
    }));
    if (this.kit && this.paintMat) {
      this.paintMat.color.set(PAINTS.find((p) => p.id === cand.paint)?.color ?? '#ffffff');
      this.kit.assemble(cand, this.car, this.paintMat);
    }
  }

  private renderRow(row: Row, i: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'row' + (i === this.sel ? ' sel' : '');
    el.addEventListener('click', () => {
      if (row === 'done') return this.onDone?.();
      if (this.sel !== i) { this.syncBrowse(); this.sel = i; this.render(); } else this.nav('ok');
    });
    const icon = document.createElement('span');
    icon.textContent = ROW_ICON[row];
    const label = document.createElement('span');
    label.textContent = row === 'done' ? 'Done' : row;
    el.append(icon, label);
    if (row === 'done') return el;
    const id = this.options(row)[this.browse[row]]!;
    const name = document.createElement('span');
    name.className = 'name';
    const prev = document.createElement('button');
    prev.textContent = '◀';
    prev.setAttribute('aria-label', `previous ${row}`);
    const next = document.createElement('button');
    next.textContent = '▶';
    next.setAttribute('aria-label', `next ${row}`);
    const text = document.createElement('span');
    text.textContent = row === 'paint' ? PAINTS.find((p) => p.id === id)!.name : row === 'horn' ? HORNS.find((h) => h.id === id)!.name : PART_BY_ID.get(id)!.name;
    for (const [b, d] of [[prev, 'left'], [next, 'right']] as const) {
      b.addEventListener('click', (e) => { e.stopPropagation(); this.sel = i; this.nav(d); });
    }
    name.append(prev, text, next);
    const tag = document.createElement('span');
    tag.className = 'tag';
    if (row === 'paint' || row === 'horn' || owns(this.profile, id)) tag.textContent = this.profile.build[row] === id ? '✔' : '';
    else {
      const part = PART_BY_ID.get(id)!;
      if (part.unlock) tag.textContent = isUnlocked(this.profile, part) ? '' : `🔒 ${['🥇', '🥈', '🥉'][part.unlock.place - 1]}`;
      else {
        tag.textContent = `💰 ${part.price}`;
        tag.classList.add(this.profile.credits >= part.price ? 'buy' : 'poor');
      }
    }
    el.append(name, tag);
    return el;
  }

  /** Turn the car on its stand; call every frame while open. */
  frame(dt: number): void {
    if (!this.open || !this.renderer) return;
    this.spin += dt * 0.8;
    this.car.rotation.y = this.spin;
    this.renderer.render(this.scene, this.camera);
  }
}
