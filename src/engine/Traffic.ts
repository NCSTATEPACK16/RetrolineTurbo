export interface TrafficCar { z: number; offset: number; speed: number; sprite: string; }

/** A fixed pool of AI cars moving down-track at constant speed. Deterministic;
 * `update` mutates each car in place (no allocation). Phase 4: constant-speed
 * lane traffic — no avoidance AI (that is Phase 7 behavioural work). */
export class Traffic {
  constructor(readonly cars: TrafficCar[], private readonly trackLength: number) {}

  update(dt: number): void {
    const L = this.trackLength;
    for (const c of this.cars) {
      c.z += c.speed * dt;
      if (c.z >= L) c.z -= L;
      else if (c.z < 0) c.z += L;
    }
  }
}
