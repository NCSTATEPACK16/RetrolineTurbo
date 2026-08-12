/** Points awarded per traffic car overtaken (TX-1 "PASSED CARS" gauge). */
export const OVERTAKE_POINTS = 100;

/** Running race score. Pure counter — no time source, no rendering knowledge —
 * so the HUD reads it and (Phase 9) the payout logic consumes it unchanged. */
export class ScoreState {
  private cars = 0;
  private pts = 0;
  private hits = 0;

  get passedCars(): number { return this.cars; }
  get points(): number { return this.pts; }

  /** Trackside collisions this run — zero earns the clean-race multiplier. */
  get collisions(): number { return this.hits; }

  /** Record one collision event (one per hit, not per contact frame). */
  addCollision(): void {
    this.hits++;
  }

  /** Record `n` cars overtaken this step (0 is a no-op). */
  addOvertakes(n: number): void {
    this.cars += n;
    this.pts += n * OVERTAKE_POINTS;
  }

  reset(): void {
    this.cars = 0;
    this.pts = 0;
    this.hits = 0;
  }
}
