/**
 * `sprite` stays for the procedural fallback and for track-file compatibility;
 * `variant` is the integer index into the baked car atlas's colour dimension, so
 * the draw path never builds a frame name string per car per frame (hard rule 4).
 */
export interface TrafficCar { z: number; offset: number; speed: number; sprite: string; variant: number; }

/** A fixed pool of AI cars moving down-track at constant speed. Deterministic;
 * `update` mutates each car in place (no allocation). Phase 4: constant-speed
 * lane traffic — no avoidance AI (that is Phase 7 behavioural work). */
export class Traffic {
  /** Previous (car.z − playerZ) per car, index-aligned with `cars`. Allocated
   * once at construction so overtake bookkeeping stays alloc-free (hard rule 4). */
  private readonly prevDelta: number[];

  constructor(readonly cars: TrafficCar[], private trackLength: number) {
    this.prevDelta = new Array(cars.length).fill(Number.NaN);
  }

  update(dt: number): void {
    const L = this.trackLength;
    for (const c of this.cars) {
      c.z += c.speed * dt;
      if (c.z >= L) c.z -= L;
      else if (c.z < 0) c.z += L;
    }
  }

  /** New overtakes since the last call: cars whose depth relative to the player
   * crossed from ahead (+) to behind (−). The first call only takes a baseline.
   * A relative jump larger than half the track is a z-wrap (or a scene hand-off),
   * not a pass — it re-baselines instead of scoring. */
  countOvertakes(playerZ: number): number {
    let passed = 0;
    const halfLength = this.trackLength / 2;
    for (let i = 0; i < this.cars.length; i++) {
      const delta = this.cars[i]!.z - playerZ;
      const prev = this.prevDelta[i]!;
      if (!Number.isNaN(prev) && Math.abs(delta - prev) <= halfLength && prev > 0 && delta <= 0) {
        passed++;
      }
      this.prevDelta[i] = delta;
    }
    return passed;
  }

  /** Re-scope the pool to a new track (route scene hand-off): shift every car
   * by `dz` (the same world-shift the player got) and wrap into `trackLength`. */
  rescope(dz: number, trackLength: number): void {
    this.trackLength = trackLength;
    for (const c of this.cars) {
      c.z = ((c.z + dz) % trackLength + trackLength) % trackLength;
    }
  }
}
