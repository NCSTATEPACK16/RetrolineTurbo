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
