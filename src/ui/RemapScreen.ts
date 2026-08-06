import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import type { SaveBackend } from '../economy/save.js';
import {
  DEFAULT_BINDINGS, parseBindings, rebind, serializeBindings,
  type Action, type Bindings, type InputManager,
} from '../input/InputManager.js';
import { drawText } from './text.js';

export const BINDINGS_KEY = 'bindings';

const ACTIONS: readonly Action[] = [
  'throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'gearUp', 'gearDown', 'nitro',
];

/** Stored bindings, or the defaults when absent/malformed. */
export async function loadBindings(backend: SaveBackend): Promise<Bindings> {
  const raw = await backend.get(BINDINGS_KEY);
  if (raw === null) return DEFAULT_BINDINGS;
  return parseBindings(raw) ?? DEFAULT_BINDINGS;
}

/**
 * Keyboard-driven rebinding screen. Pure state machine + render; persistence
 * goes through the SaveBackend seam (LocalStorage now, Supabase in Phase 8).
 * main.ts routes every keydown here first; a consumed key never reaches driving.
 */
export class RemapScreen {
  private isOpen = false;
  private isCapturing = false;
  private selected = 0;
  lastPersist: Promise<void> = Promise.resolve();

  constructor(
    private readonly atlas: SpriteAtlas,
    private readonly save: SaveBackend,
    private readonly input: InputManager,
  ) {}

  get open(): boolean { return this.isOpen; }
  get capturing(): boolean { return this.isCapturing; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.isCapturing = false;
  }

  /** Route a keydown code. Returns true when consumed (main.ts gates on this). */
  handleKey(code: string): boolean {
    if (!this.isOpen) {
      if (code === 'Tab') { this.toggle(); return true; }
      return false;
    }
    if (this.isCapturing) {
      if (code !== 'Escape') {
        const next = rebind(this.input.bindings, ACTIONS[this.selected]!, code);
        this.input.setBindings(next);
        this.lastPersist = this.save.set(BINDINGS_KEY, serializeBindings(next));
      }
      this.isCapturing = false;
      return true;
    }
    if (code === 'Escape' || code === 'Tab') this.toggle();
    else if (code === 'ArrowUp') this.selected = (this.selected + ACTIONS.length - 1) % ACTIONS.length;
    else if (code === 'ArrowDown') this.selected = (this.selected + 1) % ACTIONS.length;
    else if (code === 'Enter') this.isCapturing = true;
    return true; // open screen swallows everything
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    // Backdrop panel: one full-height trapezoid strip down the screen centre.
    backend.drawQuad(LOGICAL_WIDTH / 2, 20, 180, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 20, 180, '#101018');
    drawText(backend, this.atlas, 'controls  tab close', 70, 28);
    for (let i = 0; i < ACTIONS.length; i++) {
      const a = ACTIONS[i]!;
      const marker = i === this.selected ? (this.isCapturing ? 'press key' : '>') : ' ';
      const label = `${marker} ${a} ${this.input.bindings[a][0] ?? ''}`;
      drawText(backend, this.atlas, label, 70, 48 + i * 16);
    }
  }
}
