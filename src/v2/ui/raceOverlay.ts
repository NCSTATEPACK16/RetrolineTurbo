import { DT } from '../sim/world.js';
import { RACE, lapOf, results, type RaceState } from '../sim/race.js';
import { ITEM_NAMES } from '../sim/items.js';

/**
 * Minimal race text: countdown, lap, position, wrong-way banner, results.
 * Stand-in until the icon-first HUD (v2-16) replaces it. Only touches the DOM
 * when a value changes, so it costs nothing per frame in steady state.
 */
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export class RaceOverlay {
  private readonly big = document.createElement('div');
  private readonly info = document.createElement('div');
  private readonly banner = document.createElement('div');
  private readonly table = document.createElement('div');
  private last = { big: '', info: '', banner: '', table: '' };

  constructor(root: HTMLElement, private readonly names: readonly string[]) {
    const base = { position: 'absolute', color: '#fee971', font: '700 20px/1.1 ui-monospace, monospace', textShadow: '2px 2px 0 #101018', pointerEvents: 'none' };
    Object.assign(this.big.style, base, { inset: '0', display: 'grid', placeItems: 'center', fontSize: '64px' });
    Object.assign(this.info.style, base, { top: '12px', left: '16px', whiteSpace: 'pre' });
    Object.assign(this.banner.style, base, { top: '30%', left: '0', right: '0', textAlign: 'center', color: '#f03030', fontSize: '32px' });
    Object.assign(this.table.style, base, { inset: '0', display: 'grid', placeItems: 'center', fontSize: '18px', whiteSpace: 'pre' });
    root.append(this.big, this.info, this.banner, this.table);
  }

  update(race: RaceState, player: number, junior = false, pure = false): void {
    const r = race.racers[player]!;
    let big = '';
    if (race.phase === 'countdown') {
      const left = (race.countdownTicks - race.tick) * DT;
      big = String(Math.ceil(left));
    } else if (race.tick - race.countdownTicks < 45) big = 'GO!';
    const lap = Math.min(race.laps, lapOf(r) + 1);
    const held = ITEM_NAMES[race.items.held[player]!] ?? '';
    const info = (race.phase === 'countdown' ? '' : `LAP ${lap}/${race.laps}   ${ORDINAL[r.position - 1]}`) +
      (junior ? '   JR' : '') + (pure ? '   PURE' : '') + (held ? `\n[${held}]` : '');
    const banner = r.wrongWay > RACE.wrongWaySeconds ? 'WRONG WAY!' : '';
    let table = '';
    if (race.phase === 'finished') {
      table = 'RESULTS\n\n' + results(race)
        .map((row) => `${ORDINAL[row.position - 1]!.padEnd(4)} ${(this.names[row.car] ?? `Car ${row.car + 1}`).padEnd(10)} ${row.timeSeconds === null ? '--:--.--' : clock(row.timeSeconds)}`)
        .join('\n') + '\n\nPress Enter to race again';
    }
    this.set('big', this.big, big);
    this.set('info', this.info, info);
    this.set('banner', this.banner, banner);
    this.set('table', this.table, table);
  }

  private set(key: keyof RaceOverlay['last'], el: HTMLElement, text: string): void {
    if (this.last[key] === text) return;
    this.last[key] = text;
    el.textContent = text;
  }
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
