export interface TrafficCar { z: number; offset: number; speed: number; sprite: string; }

/** A fixed pool of AI cars moving down-track at constant speed. Deterministic;
 * `update` mutates each car in place (no allocation). Phase 4: constant-speed
 * lane traffic — no avoidance AI (that is Phase 7 behavioural work). */
export class Traffic {
  constructor(readonly cars: TrafficCar[], private trackLength: number) {}

  update(dt: number): void {
    const L = this.trackLength;
    for (const c of this.cars) {
      c.z += c.speed * dt;
      if (c.z >= L) c.z -= L;
      else if (c.z < 0) c.z += L;
    }
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
