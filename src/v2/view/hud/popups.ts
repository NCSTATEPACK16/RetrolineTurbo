import type { RaceState } from '../../sim/race.js';
import type { SimWorld } from '../../sim/world.js';

/**
 * Driver portrait pop-ups: after the player passes someone, gets passed, or
 * gets hit, show the other driver's face (happy, or angry) for a moment.
 * Pure state machine fed once per sim tick; the HUD just draws `current`.
 */
export type Mood = 'neutral' | 'happy' | 'angry';
export interface Popup { car: number; mood: Mood; ticks: number }

export const POPUP_TICKS = 120;

export class Popups {
  current: Popup | null = null;
  private lastPos = 0;
  private lastHits = 0;
  private lastTick = -1;

  /** `hits` = times the player has been struck by an item so far. */
  update(race: RaceState, world: SimWorld, player: number, hits: number): void {
    if (world.tick === this.lastTick) return;
    this.lastTick = world.tick;
    const pos = race.racers[player]!.position;
    if (this.current) {
      this.current.ticks--;
      if (this.current.ticks <= 0) this.current = null;
    }
    if (race.phase === 'racing') {
      if (hits > this.lastHits) {
        // Whoever is just ahead is enjoying this.
        this.show(race.order[Math.max(0, pos - 2)] ?? player, 'happy');
      } else if (this.lastPos && pos < this.lastPos) {
        // You passed them: they're not pleased.
        this.show(race.order[pos] ?? player, 'angry');
      } else if (this.lastPos && pos > this.lastPos) {
        this.show(race.order[pos - 2] ?? player, 'happy');
      }
    }
    this.lastPos = pos;
    this.lastHits = hits;
  }

  private show(car: number, mood: Mood): void {
    this.current = { car, mood, ticks: POPUP_TICKS };
  }
}
