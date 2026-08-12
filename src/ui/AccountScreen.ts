import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import type { RenderBackend } from '../engine/RenderBackend.js';
import type { SpriteAtlas } from '../engine/SpriteAtlas.js';
import { drawText } from './text.js';
import { linkEmail, setPassword, isAccountLinked } from '../net/account.js';

/**
 * F5 overlay: anonymous -> permanent account upgrade. Email/password entry
 * uses window.prompt — the bitmap font (a-z, 0-9, `:`, `-`) has no `@` glyph,
 * so an on-canvas field can't render an email address; this is the one
 * screen that deliberately steps outside the canvas for input.
 */
export class AccountScreen {
  private isOpen = false;
  private statusLine = '';
  private linked = false;
  lastAction: Promise<void> = Promise.resolve();

  constructor(private readonly atlas: SpriteAtlas) {}

  get open(): boolean { return this.isOpen; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) return;
    this.statusLine = '';
    this.lastAction = isAccountLinked().then((linked) => { this.linked = linked; });
  }

  handleKey(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'F5' || code === 'Escape') { this.isOpen = false; return true; }
    if (code === 'KeyE' && !this.linked) this.promptEmail();
    else if (code === 'KeyP' && !this.linked) this.promptPassword();
    return true;
  }

  private promptEmail(): void {
    const email = window.prompt('Email to link this save to:');
    if (!email) return;
    this.statusLine = 'sending confirmation...';
    this.lastAction = linkEmail(email).then((result) => {
      this.statusLine = result === 'ok'
        ? 'check your email, then press p to set a password'
        : `link failed (${result})`;
    });
  }

  private promptPassword(): void {
    const password = window.prompt('Set a password (after confirming your email):');
    if (!password) return;
    this.statusLine = 'saving password...';
    this.lastAction = setPassword(password).then((result) => {
      this.statusLine = result === 'ok' ? 'account linked' : `save failed (${result})`;
      if (result === 'ok') this.linked = true;
    });
  }

  render(backend: RenderBackend): void {
    if (!this.isOpen) return;
    backend.drawQuad(LOGICAL_WIDTH / 2, 60, 120, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 60, 120, '#101018');
    drawText(backend, this.atlas, 'account  f5 close', 60, 68);
    if (this.linked) {
      drawText(backend, this.atlas, 'this save is linked to an account', 60, 84);
    } else {
      drawText(backend, this.atlas, 'e link email   p set password', 60, 84);
    }
    if (this.statusLine) drawText(backend, this.atlas, this.statusLine, 60, 100);
  }
}
