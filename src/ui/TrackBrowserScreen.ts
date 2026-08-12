import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { drawText } from './text.js';
import { parseTrackFile, type ParsedTrack } from '../track/schema.js';
import { browsePublicTracks, fetchTrack, type PublicTrackSummary } from '../net/tracks.js';

/**
 * F4 overlay: browse and load community tracks (retroline.tracks, is_public).
 * Loading re-validates through parseTrackFile and hands off through the same
 * `onTrackChange` contract EditorScreen uses, so a config-mismatched track
 * surfaces "not activated" instead of desyncing the world.
 */
export class TrackBrowserScreen {
  private isOpen = false;
  private tracks: PublicTrackSummary[] = [];
  private selected = 0;
  private statusLine = '';
  private loading = false;
  lastFetch: Promise<void> = Promise.resolve();
  lastLoad: Promise<void> = Promise.resolve();

  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly onTrackChange: (track: ParsedTrack) => boolean,
  ) {}

  get open(): boolean { return this.isOpen; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) return;
    this.loading = true;
    this.tracks = [];
    this.selected = 0;
    this.statusLine = '';
    this.lastFetch = browsePublicTracks().then((rows) => {
      this.tracks = rows;
      this.loading = false;
      if (rows.length === 0) this.statusLine = 'no public tracks yet';
    });
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F4' || code === 'Escape') { this.isOpen = false; return true; }
    if (this.tracks.length === 0) return true;
    if (code === 'ArrowUp') this.selected = (this.selected + this.tracks.length - 1) % this.tracks.length;
    else if (code === 'ArrowDown') this.selected = (this.selected + 1) % this.tracks.length;
    else if (code === 'Enter') this.loadSelected();
    return true;
  }

  private loadSelected(): void {
    const summary = this.tracks[this.selected];
    if (!summary) return;
    this.statusLine = 'loading...';
    this.lastLoad = fetchTrack(summary.id).then((file) => {
      if (!file) { this.statusLine = 'load failed'; return; }
      const r = parseTrackFile(file);
      if (!r.ok) { this.statusLine = r.errors[0] ?? 'invalid track'; return; }
      const activated = this.onTrackChange(r.track);
      this.statusLine = activated ? `loaded ${summary.name}` : `${summary.name}: not activated (config mismatch)`;
    });
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 30, 160, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 30, 160, '#101018');
    drawText(backend, this.atlas, 'community tracks  f4 close  enter load', 30, 38);
    if (this.loading) { drawText(backend, this.atlas, 'loading', 30, 54); return; }
    if (this.statusLine) drawText(backend, this.atlas, this.statusLine, 30, 54);
    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i]!;
      const marker = i === this.selected ? '>' : ' ';
      drawText(backend, this.atlas, `${marker}${t.name} plays ${t.plays}`, 30, 68 + i * 12);
    }
  }
}
