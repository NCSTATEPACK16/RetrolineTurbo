import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../../constants.js';
import type { RenderBackend } from '../../engine/RenderBackend.js';
import type { SpriteAtlas } from '../../engine/SpriteAtlas.js';
import type { SaveBackend } from '../../economy/save.js';
import { drawText } from '../../ui/text.js';
import { parseTrackFile, formatTrackFile, type ParsedTrack, type TrackFile, type TrackSpriteRule } from '../schema.js';
import { DEFAULT_TRACK_FILE } from '../tracks.js';
import { generateTrack } from '../generate.js';

export const TRACK_KEY_PREFIX = 'track:';
export const TRACK_INDEX_KEY = 'track-index';

type Field = 'length' | 'curve' | 'pitch' | 'preset';
const FIELDS: readonly Field[] = ['length', 'curve', 'pitch', 'preset'];

const PRESETS: readonly { name: string; rules: TrackSpriteRule[] }[] = [
  { name: 'none', rules: [] },
  { name: 'sparse', rules: [{ name: 'tree', offset: -1.8, every: 8 }, { name: 'rock', offset: 1.9, every: 10 }] },
  { name: 'trees', rules: [{ name: 'tree', offset: -1.6, every: 4 }, { name: 'tree', offset: 1.7, every: 5 }] },
  { name: 'mixed', rules: [{ name: 'tree', offset: -1.6, every: 6 }, { name: 'bush', offset: 1.8, every: 7 }, { name: 'rock', offset: -2.2, every: 9 }] },
];

const deepCopy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * In-game keyboard section editor (RemapScreen pattern). Owns a deep working
 * copy of a TrackFile; every mutation re-validates through parseTrackFile and,
 * on success, hands the ParsedTrack to `onTrackChange` (main.ts rebuilds the
 * live TrackManager). Pure state machine — clipboard/keydown wiring is the
 * caller's edge. Persistence via the SaveBackend seam (Phase 8: community tracks).
 */
export class EditorScreen {
  private isOpen = false;
  private workingFile: TrackFile = deepCopy(DEFAULT_TRACK_FILE);
  private selected = 0;
  private fieldIdx = 0;
  private presetIdx: (number | null)[] = DEFAULT_TRACK_FILE.sections.map(() => null);
  private seedValue = 1;
  private statusLine = '';
  private savedIds: string[] = [];
  private loadCycle = 0; // 0 = default, 1 = generated, 2+ = savedIds
  private loadToken = 0; // invalidates in-flight async loads on newer requests
  lastPersist: Promise<void> = Promise.resolve();
  lastLoad: Promise<void> = Promise.resolve();

  /** `onTrackChange` returns whether the track was activated in the world
   * (main.ts rejects config-mismatched tracks); false surfaces in `status`. */
  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly save: SaveBackend,
    private readonly onTrackChange: (track: ParsedTrack) => boolean,
  ) {}

  get open(): boolean { return this.isOpen; }
  get working(): TrackFile { return this.workingFile; }
  get seed(): number { return this.seedValue; }
  get status(): string { return this.statusLine; }

  private notify(): void {
    const r = parseTrackFile(this.workingFile);
    if (r.ok) {
      const activated = this.onTrackChange(r.track);
      this.statusLine = activated
        ? `${r.track.totalSegments} segments`
        : 'not activated: config mismatch';
    } else {
      this.statusLine = r.errors[0] ?? 'invalid track';
    }
  }

  private setWorking(file: TrackFile, presetIdx?: (number | null)[]): boolean {
    const r = parseTrackFile(file);
    if (!r.ok) {
      this.statusLine = r.errors[0] ?? 'invalid track';
      return false;
    }
    this.workingFile = deepCopy(file);
    this.presetIdx = presetIdx ?? file.sections.map(() => null);
    this.selected = Math.min(this.selected, file.sections.length - 1);
    const activated = this.onTrackChange(r.track);
    this.statusLine = activated
      ? `loaded ${file.trackId} (${r.track.totalSegments} segments)`
      : `loaded ${file.trackId} - not activated: config mismatch`;
    return true;
  }

  importJson(json: string): boolean {
    const r = parseTrackFile(json);
    if (!r.ok) {
      this.statusLine = r.errors[0] ?? 'invalid track';
      return false;
    }
    return this.setWorking(r.track.file);
  }

  exportJson(): string {
    return formatTrackFile(this.workingFile);
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) {
      if (code === 'F2') { this.isOpen = true; return true; }
      return false;
    }
    const secs = this.workingFile.sections;
    const sec = secs[this.selected]!;
    switch (code) {
      case 'F2':
      case 'Escape': this.isOpen = false; break;
      case 'ArrowUp': this.selected = (this.selected + secs.length - 1) % secs.length; break;
      case 'ArrowDown': this.selected = (this.selected + 1) % secs.length; break;
      case 'BracketLeft': this.fieldIdx = (this.fieldIdx + FIELDS.length - 1) % FIELDS.length; break;
      case 'BracketRight': this.fieldIdx = (this.fieldIdx + 1) % FIELDS.length; break;
      case 'ArrowLeft': this.adjust(sec, -1); break;
      case 'ArrowRight': this.adjust(sec, 1); break;
      case 'KeyN':
        secs.splice(this.selected + 1, 0, { length: 20, curve: 0, pitch: 0 });
        this.presetIdx.splice(this.selected + 1, 0, 0);
        this.selected++;
        this.notify();
        break;
      case 'KeyD':
        secs.splice(this.selected + 1, 0, deepCopy(sec));
        this.presetIdx.splice(this.selected + 1, 0, this.presetIdx[this.selected] ?? null);
        this.selected++;
        this.notify();
        break;
      case 'KeyX':
        if (secs.length > 1) {
          secs.splice(this.selected, 1);
          this.presetIdx.splice(this.selected, 1);
          this.selected = Math.min(this.selected, secs.length - 1);
          this.notify();
        }
        break;
      case 'KeyG': this.setWorking(generateTrack(this.seedValue)); break;
      case 'Equal': this.seedValue++; this.statusLine = `seed ${this.seedValue}`; break;
      case 'Minus': this.seedValue = Math.max(0, this.seedValue - 1); this.statusLine = `seed ${this.seedValue}`; break;
      case 'KeyS': this.persist(); break;
      case 'KeyL': this.cycleLoad(); break;
      default: break; // open screen swallows everything
    }
    return true;
  }

  private adjust(sec: TrackFile['sections'][number], dir: 1 | -1): void {
    const field = FIELDS[this.fieldIdx]!;
    if (field === 'length') sec.length = Math.max(1, sec.length + dir * 5);
    else if (field === 'curve') sec.curve = Math.round((sec.curve + dir * 0.5) * 10) / 10;
    else if (field === 'pitch') sec.pitch += dir * 5;
    else {
      const cur = this.presetIdx[this.selected] ?? null;
      // From custom (null): right enters at the first preset, left at the last.
      const next = cur === null
        ? (dir > 0 ? 0 : PRESETS.length - 1)
        : (cur + dir + PRESETS.length) % PRESETS.length;
      this.presetIdx[this.selected] = next;
      const rules = PRESETS[next]!.rules;
      if (rules.length === 0) delete sec.sprites;
      else sec.sprites = deepCopy(rules);
    }
    this.notify();
  }

  private persist(): void {
    const id = this.workingFile.trackId;
    if (!this.savedIds.includes(id)) this.savedIds.push(id);
    const json = formatTrackFile(this.workingFile);
    this.lastPersist = (async () => {
      await this.save.set(TRACK_KEY_PREFIX + id, json);
      await this.save.set(TRACK_INDEX_KEY, JSON.stringify(this.savedIds));
    })();
    this.statusLine = `saved ${id}`;
  }

  private cycleLoad(): void {
    this.loadCycle = (this.loadCycle + 1) % (2 + this.savedIds.length);
    const token = ++this.loadToken; // newer cycles invalidate in-flight loads
    if (this.loadCycle === 0) {
      this.setWorking(DEFAULT_TRACK_FILE);
    } else if (this.loadCycle === 1) {
      this.setWorking(generateTrack(this.seedValue));
    } else {
      const id = this.savedIds[this.loadCycle - 2]!;
      this.lastLoad = this.save.get(TRACK_KEY_PREFIX + id).then((json) => {
        if (token !== this.loadToken) return; // superseded by a newer cycle
        if (json === null || !this.importJson(json)) this.statusLine = `load failed: ${id}`;
      });
    }
  }

  /** Hydrate the saved-track index (called once at boot by main.ts). */
  async loadIndex(): Promise<void> {
    const raw = await this.save.get(TRACK_INDEX_KEY);
    if (raw === null) return;
    try {
      const ids: unknown = JSON.parse(raw);
      if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) this.savedIds = ids;
    } catch {
      /* corrupt index: keep empty */
    }
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 14, 226, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 14, 226, '#101018');
    const f = this.workingFile;
    drawText(backend, this.atlas, `editor ${f.trackId} seed ${this.seedValue}`, 20, 20);
    drawText(backend, this.atlas, `field ${FIELDS[this.fieldIdx]!} ${this.statusLine}`, 20, 32);
    const rows = 12;
    const first = Math.max(0, Math.min(this.selected - 5, f.sections.length - rows));
    for (let r = 0; r < Math.min(rows, f.sections.length); r++) {
      const i = first + r;
      const s = f.sections[i]!;
      const preset = this.presetIdx[i] === null ? 'custom' : PRESETS[this.presetIdx[i]!]!.name;
      const marker = i === this.selected ? '*' : ' ';
      drawText(backend, this.atlas, `${marker}${i} l${s.length} c${s.curve} p${s.pitch} ${preset}`, 20, 46 + r * 12);
    }
    drawText(backend, this.atlas, 'n add x del d dup g gen s save l load e i json', 20, LOGICAL_HEIGHT - 24);
  }
}
