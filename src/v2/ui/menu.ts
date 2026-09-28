/**
 * The DOM menu shell: a column of big option rows plus a GO button, driven by
 * keyboard, gamepad (via `nav`) or pointer. No text entry anywhere (hard rule
 * 7): every choice is picked from a list. Icons lead, words follow, so a
 * non-reader can still tell the rows apart.
 */
export interface MenuOption {
  /** Big glyph shown before the label. */
  icon: string;
  label: string;
  values: readonly string[];
  get(): number;
  set(i: number): void;
  /** Hidden rows are skipped (e.g. player 2's settings outside Versus). */
  visible?: () => boolean;
}

export type MenuNav = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

const CSS = `
.rt-menu { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: auto;
  font: 700 18px/1.2 ui-monospace, 'SF Mono', Menlo, monospace; color: #fcfcfc; text-transform: uppercase; }
.rt-menu[hidden] { display: none; }
.rt-menu .panel { background: rgba(16,16,24,0.82); border: 4px solid #fcfcfc; box-shadow: 0 0 0 4px #101018, 8px 8px 0 4px rgba(0,0,0,0.5);
  padding: 20px 24px; min-width: min(460px, calc(100vw - 32px)); max-width: calc(100vw - 32px); box-sizing: border-box; }
.rt-menu h1 { margin: 0 0 4px; font-size: 30px; color: #fee971; text-shadow: 3px 3px 0 #d02070; letter-spacing: 2px; text-align: center; }
.rt-menu .sub { text-align: center; color: #50d8f0; margin-bottom: 16px; font-size: 14px; }
.rt-menu .row { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 10px; padding: 6px 8px;
  border: 2px solid transparent; cursor: pointer; user-select: none; }
.rt-menu .row.sel { border-color: #fee971; background: rgba(254,233,113,0.12); }
.rt-menu .icon { font-size: 22px; text-align: center; }
.rt-menu .val { display: flex; align-items: center; gap: 8px; color: #fee971; }
.rt-menu .val button { font: inherit; color: #fcfcfc; background: none; border: 0; cursor: pointer; padding: 0 4px; }
.rt-menu .go { margin-top: 14px; text-align: center; font-size: 26px; padding: 8px; background: #d02070; border: 3px solid #fcfcfc;
  cursor: pointer; user-select: none; }
.rt-menu .go.sel { background: #f03030; outline: 3px solid #fee971; }
.rt-menu .hint { margin-top: 12px; text-align: center; font-size: 12px; color: #a0a0b0; text-transform: none; }
`;

export class Menu {
  readonly root = document.createElement('div');
  private readonly panel = document.createElement('div');
  private readonly title = document.createElement('h1');
  private readonly sub = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly go = document.createElement('div');
  private readonly hint = document.createElement('div');
  private options: MenuOption[] = [];
  private sel = 0;
  onGo: (() => void) | null = null;
  onBack: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    if (!document.getElementById('rt-menu-css')) {
      const style = document.createElement('style');
      style.id = 'rt-menu-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.root.className = 'rt-menu';
    this.panel.className = 'panel';
    this.sub.className = 'sub';
    this.go.className = 'go';
    this.hint.className = 'hint';
    this.panel.append(this.title, this.sub, this.list, this.go, this.hint);
    this.root.append(this.panel);
    parent.append(this.root);
    this.go.addEventListener('click', () => this.onGo?.());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(title: string, sub: string, options: MenuOption[], goLabel: string, hint = ''): void {
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.go.textContent = goLabel;
    this.hint.textContent = hint;
    this.options = options;
    this.sel = this.rows().length; // start on GO: one press and you're racing
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private rows(): MenuOption[] {
    return this.options.filter((o) => !o.visible || o.visible());
  }

  nav(n: MenuNav): void {
    if (!this.open) return;
    const rows = this.rows();
    const count = rows.length + 1; // + GO
    const opt = rows[this.sel];
    if (n === 'up') this.sel = (this.sel + count - 1) % count;
    else if (n === 'down') this.sel = (this.sel + 1) % count;
    else if ((n === 'left' || n === 'right') && opt) this.step(opt, n === 'left' ? -1 : 1);
    else if (n === 'ok') {
      if (opt) this.step(opt, 1);
      else this.onGo?.();
      return;
    } else if (n === 'back') {
      this.onBack?.();
      return;
    }
    this.render();
  }

  private step(opt: MenuOption, d: number): void {
    opt.set((opt.get() + d + opt.values.length) % opt.values.length);
    const count = this.rows().length;
    if (this.sel > count) this.sel = count; // a row may have hidden itself
    this.render();
  }

  private render(): void {
    const rows = this.rows();
    this.list.replaceChildren(
      ...rows.map((o, i) => {
        const row = document.createElement('div');
        row.className = 'row' + (i === this.sel ? ' sel' : '');
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = o.icon;
        const label = document.createElement('span');
        label.textContent = o.label;
        const val = document.createElement('span');
        val.className = 'val';
        const prev = document.createElement('button');
        prev.textContent = '◀';
        prev.setAttribute('aria-label', `previous ${o.label}`);
        const next = document.createElement('button');
        next.textContent = '▶';
        next.setAttribute('aria-label', `next ${o.label}`);
        const text = document.createElement('span');
        text.textContent = o.values[o.get()] ?? '';
        val.append(prev, text, next);
        prev.addEventListener('click', (e) => { e.stopPropagation(); this.sel = i; this.step(o, -1); });
        next.addEventListener('click', (e) => { e.stopPropagation(); this.sel = i; this.step(o, 1); });
        row.addEventListener('click', () => { this.sel = i; this.step(o, 1); });
        row.append(icon, label, val);
        return row;
      }),
    );
    this.go.classList.toggle('sel', this.sel === rows.length);
  }
}

/** Map a key code to a menu move (both halves of the keyboard work). */
export function keyNav(code: string): MenuNav | null {
  switch (code) {
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Enter': case 'Space': return 'ok';
    case 'Escape': case 'Backspace': return 'back';
    default: return null;
  }
}

/**
 * Gamepad → menu moves with edge detection and auto-repeat on held directions.
 * Standard mapping: d-pad or left stick to move, A (0) to pick, B (1) to go back.
 */
export class PadNav {
  private held: MenuNav | null = null;
  private wait = 0;

  poll(pad: { readonly buttons: readonly { pressed: boolean }[]; readonly axes: readonly number[] } | null, dt: number): MenuNav | null {
    if (!pad) {
      this.held = null;
      return null;
    }
    const b = (i: number): boolean => pad.buttons[i]?.pressed ?? false;
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    const now: MenuNav | null =
      b(12) || ay < -0.6 ? 'up' : b(13) || ay > 0.6 ? 'down' : b(14) || ax < -0.6 ? 'left' : b(15) || ax > 0.6 ? 'right'
        : b(0) || b(9) ? 'ok' : b(1) ? 'back' : null;
    if (now !== this.held) {
      this.held = now;
      this.wait = 0.4;
      return now;
    }
    if (now && now !== 'ok' && now !== 'back') {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = 0.15;
        return now;
      }
    }
    return null;
  }
}
