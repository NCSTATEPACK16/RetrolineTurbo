import { results, type RaceState } from '../sim/race.js';

/**
 * Results table at the end of a race (the in-race HUD is drawn on canvas by
 * view/hud). DOM text until the menus shell owns the post-race screens. Only
 * touches the DOM when the text changes.
 */
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export class RaceOverlay {
  private readonly table = document.createElement('div');
  private last = '';

  constructor(root: HTMLElement, private readonly names: readonly string[]) {
    Object.assign(this.table.style, {
      position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', whiteSpace: 'pre', pointerEvents: 'none',
      color: '#fee971', font: '700 18px/1.1 ui-monospace, monospace', textShadow: '2px 2px 0 #101018',
    });
    root.append(this.table);
  }

  update(race: RaceState, footer = 'Press Enter to race again'): void {
    let table = '';
    if (race.phase === 'finished') {
      table = 'RESULTS\n\n' + results(race)
        .map((row) => `${ORDINAL[row.position - 1]!.padEnd(4)} ${(this.names[row.car] ?? `Car ${row.car + 1}`).padEnd(10)} ${row.timeSeconds === null ? '--:--.--' : clock(row.timeSeconds)}`)
        .join('\n') + '\n\n' + footer;
    }
    if (table === this.last) return;
    this.last = table;
    this.table.textContent = table;
  }
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
