import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { PayoutLedger } from '../economy/payout.js';
import { drawText, textWidth } from './text.js';

const PANEL_TOP = 56;
const PANEL_BOTTOM = LOGICAL_HEIGHT - 30;
const PANEL_X = 60;
const PANEL_W = LOGICAL_WIDTH - PANEL_X * 2;
const LINE_H = 14;

/**
 * The post-race ledger. Not a toggled screen: main.ts shows it when the run
 * ends and clears it on restart, so it is pure display — it is handed a
 * finished PayoutLedger and never computes credits itself (which is also what
 * stops a re-render from re-awarding them).
 */
export class SummaryScreen {
  private title = '';
  private ledger: PayoutLedger | null = null;
  private balance = 0;

  constructor(private readonly atlas: SpriteAtlas) {}

  get visible(): boolean {
    return this.ledger !== null;
  }

  show(title: string, ledger: PayoutLedger, balance: number): void {
    this.title = title;
    this.ledger = ledger;
    this.balance = balance;
  }

  clear(): void {
    this.ledger = null;
  }

  render(backend: RenderBackend): void {
    const ledger = this.ledger;
    if (ledger === null) return;
    const cx = PANEL_X + PANEL_W / 2;
    const half = PANEL_W / 2;
    backend.drawQuad(cx, PANEL_TOP, half, cx, PANEL_BOTTOM, half, '#101018');

    const left = PANEL_X + 10;
    const right = PANEL_X + PANEL_W - 10;
    let y = PANEL_TOP + 10;
    drawText(backend, this.atlas, this.title, left, y, 2, 'gold');
    y += LINE_H + 4;

    for (const line of ledger.lines) {
      drawText(backend, this.atlas, line.label, left, y);
      const value = `${line.credits}`;
      drawText(backend, this.atlas, value, right - textWidth(this.atlas, value), y);
      y += LINE_H;
    }
    if (ledger.cleanMultiplier !== 1) {
      // Shown as the credits the multiplier added, not as "x1.1": the 3x5 font
      // has no period glyph (it renders '.' as a colon), so a decimal reads as
      // "x1:1" on screen. Credits also match every other row's units.
      const subtotal = ledger.lines.reduce((sum, l) => sum + l.credits, 0);
      const bonus = ledger.total - subtotal;
      drawText(backend, this.atlas, 'clean race', left, y, 2, 'gold');
      const value = `${bonus}`;
      drawText(backend, this.atlas, value, right - textWidth(this.atlas, value), y, 2, 'gold');
      y += LINE_H;
    }
    y += 4;
    drawText(backend, this.atlas, 'earned', left, y, 2, 'gold');
    const total = `${ledger.total}`;
    drawText(backend, this.atlas, total, right - textWidth(this.atlas, total), y, 2, 'gold');
    y += LINE_H;
    drawText(backend, this.atlas, 'credits', left, y);
    const bal = `${this.balance}`;
    drawText(backend, this.atlas, bal, right - textWidth(this.atlas, bal), y);
    y += LINE_H + 4;
    drawText(backend, this.atlas, 'f6 garage   r restart', left, y);
  }
}
