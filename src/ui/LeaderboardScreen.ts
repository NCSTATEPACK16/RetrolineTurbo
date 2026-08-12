import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { drawText } from './text.js';
import { formatTime } from './HUD.js';
import { fetchLeaderboard, type LeaderboardEntry } from '../net/leaderboard.js';

/** F3 overlay: top `race_results` times for the given trackId. Pure display —
 * main.ts supplies the trackId (from `routeIdentity`) and owns the keybind,
 * following the RemapScreen contract. */
export class LeaderboardScreen {
  private isOpen = false;
  private entries: LeaderboardEntry[] = [];
  private loading = false;
  lastFetch: Promise<void> = Promise.resolve();

  constructor(private readonly atlas: SpriteAtlas) {}

  get open(): boolean { return this.isOpen; }

  /** Open (or close, on repeat) and kick off a fetch for `trackId` on open. */
  toggle(trackId: string): void {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) return;
    this.loading = true;
    this.entries = [];
    this.lastFetch = fetchLeaderboard(trackId).then((rows) => {
      this.entries = rows;
      this.loading = false;
    });
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F3' || code === 'Escape') this.isOpen = false;
    return true; // open screen swallows everything
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 40, 140, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 40, 140, '#101018');
    drawText(backend, this.atlas, 'leaderboard  f3 close', 40, 48);
    if (this.loading) {
      drawText(backend, this.atlas, 'loading', 40, 64);
      return;
    }
    if (this.entries.length === 0) {
      drawText(backend, this.atlas, 'no times yet', 40, 64);
      return;
    }
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      drawText(backend, this.atlas, `${i + 1} ${formatTime(e.timeMs)}${e.isYou ? ' you' : ''}`, 40, 64 + i * 12);
    }
  }
}
