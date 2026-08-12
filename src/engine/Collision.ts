import type { PlayerState } from '../types/engine.js';
import type { TrafficCar } from './Traffic.js';

/** Player is off the road surface when beyond the road half-width either side. */
export function isOffRoad(playerX: number, roadWidth: number): boolean {
  return Math.abs(playerX) > roadWidth;
}

/** First car overlapping the player in depth (±1 segment) and lateral world-x. */
export function hitCar(
  player: PlayerState,
  cars: readonly TrafficCar[],
  cfg: { roadWidth: number; segmentLength: number; carHalfWidthPx: number },
): TrafficCar | null {
  for (const c of cars) {
    if (Math.abs(c.z - player.z) > cfg.segmentLength) continue;
    const carWorldX = c.offset * cfg.roadWidth;
    if (Math.abs(carWorldX - player.x) < cfg.carHalfWidthPx) return c;
  }
  return null;
}

/** Pure kinematic response to apply to the throwaway harness (Phase 5: to Vehicle). */
export function responseDelta(event: { offRoad: boolean; hit: boolean }): { speedFactor: number; xPush: number } {
  if (event.hit) return { speedFactor: 0.6, xPush: 400 };   // hard slow + shove
  if (event.offRoad) return { speedFactor: 0.9, xPush: 0 }; // drag, no shove
  return { speedFactor: 1, xPush: 0 };
}

/** Which way a hit shoves the player: away from the car that was struck.
 * Keying the shove off the player's own sign instead pushes toward the road
 * centre, which on a left-lane hit drives the player back into the car. */
export function shoveSign(playerX: number, carWorldX: number): 1 | -1 {
  // An exact overlap has no "away", so pick a side rather than returning 0 and
  // silently swallowing the response.
  return playerX < carWorldX ? -1 : 1;
}

/**
 * One response per contact.
 *
 * `hitCar` reports an overlap every step it lasts, and at speed a single bump
 * spans several steps (a ±1-segment window is 400 world units deep; top speed
 * covers ~97 per step). Applying the response each of those steps compounds the
 * 0.6 speed factor into a near-stop and counts one bump as four collisions,
 * which quietly voids the clean-race payout multiplier.
 */
export class ContactLatch {
  private touching: TrafficCar | null = null;

  /** True on the first step of a new contact; false while it persists. */
  enter(car: TrafficCar | null): boolean {
    const isNew = car !== null && car !== this.touching;
    this.touching = car;
    return isNew;
  }

  reset(): void {
    this.touching = null;
  }
}
