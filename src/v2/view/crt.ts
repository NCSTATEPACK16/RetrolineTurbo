/**
 * Optional CRT look: scanlines and a soft vignette drawn by CSS over the
 * upscaled canvas, at display resolution (one dark line per internal row).
 * Costs no GPU time. Defaults off on narrow (phone) viewports.
 */
const KEY = 'retroline.v2.crt';

export function crtDefault(viewportWidth: number): boolean {
  return viewportWidth > 768;
}

export class CrtOverlay {
  private on: boolean;

  constructor(private readonly el: HTMLElement) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked: use the default */ }
    this.on = saved === null ? crtDefault(window.innerWidth) : saved === '1';
    this.apply();
  }

  get enabled(): boolean {
    return this.on;
  }

  set enabled(v: boolean) {
    this.on = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* not persisted; fine */ }
    this.apply();
  }

  /** Match the canvas' on-screen size; `scale` is the whole-number upscale (px per internal row). */
  fit(width: number, height: number, scale: number): void {
    this.el.style.width = `${width}px`;
    this.el.style.height = `${height}px`;
    this.el.style.setProperty('--row', `${scale}px`);
  }

  private apply(): void {
    this.el.hidden = !this.on;
  }
}
