import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { PART_CATEGORIES, type CarMetrics, type Part, type PartCategory } from '../types/inventory.js';
import { PART_CATALOG } from '../economy/partCurves.js';
import { resolveMetrics } from '../economy/Garage.js';
import type { GarageState, PartState } from '../economy/GarageState.js';
import { drawText, textWidth } from './text.js';

const PANEL_X = 20;
const PANEL_TOP = 34;
const PANEL_BOTTOM = LOGICAL_HEIGHT - 12;
const PANEL_W = LOGICAL_WIDTH - PANEL_X * 2;
const ROWS = 8; // visible part rows; the list scrolls under the selection
const ROW_H = 12;
const LIST_X = PANEL_X + 8;
const LIST_TOP = PANEL_TOP + 34;
const BAR_X = PANEL_X + PANEL_W - 110;
const BAR_MAX_W = 44; // widest diff bar, in logical pixels
const METRICS: readonly (keyof CarMetrics)[] = ['speed', 'accel', 'handling', 'grip'];

const STATE_LABEL: Record<PartState, string> = {
  locked: 'locked',
  unaffordable: 'need c',
  purchasable: 'buy',
  owned: 'owned',
  equipped: 'fitted',
};

/**
 * The F6 shop. Follows the LeaderboardScreen/AccountScreen contract: an `open`
 * getter, `toggle`, a `handleKey` that swallows everything while open, and a
 * render that draws only through the backend. The stat-diff bars call the same
 * `resolveMetrics` the physics uses, so what the bars promise is what the car
 * does.
 */
export class GarageScreen {
  private isOpen = false;
  private categoryIdx = 0;
  /** Selected row per category — pre-allocated, never rebuilt (hard rule 4). */
  private readonly rowIdx = [0, 0, 0, 0];
  private readonly diff: CarMetrics = { speed: 0, accel: 0, handling: 0, grip: 0 };
  /** Loadout scratch for the diff preview: reused, never allocated per frame. */
  private readonly preview = { engine: null, transmission: null, suspension: null, wheels: null } as {
    engine: string | null; transmission: string | null; suspension: string | null; wheels: string | null;
  };

  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly garage: GarageState,
    private readonly catalog: readonly Part[] = PART_CATALOG,
    private readonly onChange: () => void = () => {},
  ) {}

  get open(): boolean {
    return this.isOpen;
  }

  private get category(): PartCategory {
    return PART_CATEGORIES[this.categoryIdx]!;
  }

  private get rows(): Part[] {
    return this.catalog.filter((p) => p.category === this.category);
  }

  /** The part under the cursor. Exposed for tests and for main.ts diagnostics. */
  get highlighted(): Part {
    return this.rows[this.rowIdx[this.categoryIdx]!]!;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F6' || code === 'Escape') {
      this.isOpen = false;
      return true;
    }
    const count = PART_CATEGORIES.length;
    if (code === 'ArrowLeft') this.categoryIdx = (this.categoryIdx + count - 1) % count;
    else if (code === 'ArrowRight') this.categoryIdx = (this.categoryIdx + 1) % count;
    else if (code === 'ArrowUp') this.rowIdx[this.categoryIdx] = Math.max(0, this.rowIdx[this.categoryIdx]! - 1);
    else if (code === 'ArrowDown') {
      this.rowIdx[this.categoryIdx] = Math.min(this.rows.length - 1, this.rowIdx[this.categoryIdx]! + 1);
    } else if (code === 'Enter') this.confirm();
    return true; // an open screen swallows everything
  }

  /** Buy if it can be bought, then fit it. A locked part is a no-op. */
  private confirm(): void {
    const part = this.highlighted;
    const state = this.garage.partState(part);
    if (state === 'locked' || state === 'unaffordable' || state === 'equipped') return;
    if (state === 'purchasable' && !this.garage.buy(part)) return;
    if (!this.garage.equip(part)) return;
    this.onChange();
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    const cx = PANEL_X + PANEL_W / 2;
    const half = PANEL_W / 2;
    backend.drawQuad(cx, PANEL_TOP, half, cx, PANEL_BOTTOM, half, '#101018');

    drawText(backend, this.atlas, `garage   credits ${this.garage.credits}`, LIST_X, PANEL_TOP + 6, 2, 'gold');
    // Category carousel: the selected one is gold, the rest plain.
    let x = LIST_X;
    for (let i = 0; i < PART_CATEGORIES.length; i++) {
      const name = PART_CATEGORIES[i]!;
      drawText(backend, this.atlas, name, x, PANEL_TOP + 20, 2, i === this.categoryIdx ? 'gold' : 'white');
      x += textWidth(this.atlas, name) + 8;
    }

    const rows = this.rows;
    const selected = this.rowIdx[this.categoryIdx]!;
    const first = Math.max(0, Math.min(rows.length - ROWS, selected - Math.floor(ROWS / 2)));
    for (let i = 0; i < ROWS && first + i < rows.length; i++) {
      const part = rows[first + i]!;
      const y = LIST_TOP + i * ROW_H;
      const isSelected = first + i === selected;
      const state = this.garage.partState(part);
      drawText(backend, this.atlas, `${isSelected ? '-' : ' '}${part.name}`, LIST_X, y, 2,
        isSelected ? 'gold' : 'white');
      const tail = state === 'purchasable' || state === 'unaffordable'
        ? `${part.cost}` : STATE_LABEL[state];
      drawText(backend, this.atlas, tail, BAR_X - 8 - textWidth(this.atlas, tail), y);
    }

    this.renderDiff(backend);
  }

  /** Red/green bars: highlighted part's resolved metrics minus the fitted ones. */
  private renderDiff(backend: RenderBackend): void {
    const part = this.highlighted;
    const now = resolveMetrics(this.garage.equipped, this.catalog);
    this.preview.engine = this.garage.equipped.engine;
    this.preview.transmission = this.garage.equipped.transmission;
    this.preview.suspension = this.garage.equipped.suspension;
    this.preview.wheels = this.garage.equipped.wheels;
    this.preview[part.category] = part.id;
    const next = resolveMetrics(this.preview, this.catalog);
    this.diff.speed = next.speed - now.speed;
    this.diff.accel = next.accel - now.accel;
    this.diff.handling = next.handling - now.handling;
    this.diff.grip = next.grip - now.grip;

    for (let i = 0; i < METRICS.length; i++) {
      const key = METRICS[i]!;
      const y = LIST_TOP + i * ROW_H;
      drawText(backend, this.atlas, key, BAR_X, y);
      const delta = this.diff[key];
      // Bars grow from a fixed origin: right for a gain, left for a loss.
      const originX = BAR_X + 60;
      const halfW = Math.max(0.5, Math.min(BAR_MAX_W, Math.abs(delta)) / 2);
      const barCx = delta >= 0 ? originX + halfW : originX - halfW;
      const color = delta > 0 ? '#33cc55' : delta < 0 ? '#cc3333' : '#555566';
      backend.drawQuad(barCx, y, halfW, barCx, y + 8, halfW, color);
    }
  }
}
