import { results, type RaceState } from '../sim/race.js';
import { pointsFor, standings, type CupState } from '../sim/cup.js';

/**
 * Between-race screens: race results, the cup table and the trophy. DOM text
 * until the roster's portraits land; the in-race HUD is drawn on canvas by
 * view/hud. Only touches the DOM when the text changes.
 */
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const TROPHY = ['GOLD', 'SILVER', 'BRONZE'];

export class RaceOverlay {
  private readonly wrap = document.createElement('div');
  private readonly table = document.createElement('div');
  private last = '';

  constructor(root: HTMLElement, public names: readonly string[]) {
    Object.assign(this.wrap.style, { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', pointerEvents: 'none' });
    Object.assign(this.table.style, {
      whiteSpace: 'pre', color: '#fee971', font: '700 18px/1.25 ui-monospace, monospace', textShadow: '2px 2px 0 #101018',
      background: 'rgba(16,16,24,0.85)', border: '4px solid #fcfcfc', boxShadow: '0 0 0 4px #101018', padding: '16px 22px',
      maxWidth: 'calc(100vw - 32px)', overflowX: 'auto', boxSizing: 'border-box',
    });
    this.wrap.hidden = true;
    this.wrap.append(this.table);
    root.append(this.wrap);
  }

  private name(car: number): string {
    return (this.names[car] ?? `Car ${car + 1}`).padEnd(10);
  }

  /** Finishing order and times; with a cup, the points each car just earned. */
  raceText(race: RaceState, cup: CupState | null): string {
    const head = cup ? `${cup.def.name.toUpperCase()}  RACE ${cup.round}/${cup.def.rounds.length}\n\n` : 'RESULTS\n\n';
    return head + results(race)
      .map((row) => `${ORDINAL[row.position - 1]!.padEnd(4)} ${this.name(row.car)} ${row.timeSeconds === null ? '--:--.--' : clock(row.timeSeconds)}` +
        (cup ? `  +${pointsFor(row.position)}` : ''))
      .join('\n');
  }

  /** The cup table so far. */
  standingsText(cup: CupState): string {
    return 'CUP POINTS\n\n' + standings(cup).map((s) => `${String(s.place).padStart(2)}  ${this.name(s.car)} ${String(s.points).padStart(3)}`).join('\n');
  }

  /** The end-of-cup trophy line for `car`. */
  trophyText(cup: CupState, car: number): string {
    const place = standings(cup).find((s) => s.car === car)!.place;
    return place <= 3 ? `${TROPHY[place - 1]} TROPHY!  ${this.names[car] ?? ''} ${ORDINAL[place - 1]}` : `${this.names[car] ?? ''} FINISHED ${ORDINAL[place - 1]}`;
  }

  show(text: string): void {
    if (text === this.last) return;
    this.last = text;
    this.table.textContent = text;
    this.wrap.hidden = text === '';
  }

  hide(): void {
    this.show('');
  }
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
