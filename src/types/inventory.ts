/**
 * Phase 9 economy domain types. Parts shift a car off a median 50/100 baseline
 * on four metrics; one part per category may be equipped at a time.
 */

export type PartCategory = 'engine' | 'transmission' | 'suspension' | 'wheels';

/** Carousel order in the Garage shop. */
export const PART_CATEGORIES: readonly PartCategory[] = ['engine', 'transmission', 'suspension', 'wheels'];

export interface Part {
  id: string;
  name: string;
  category: PartCategory;
  /** 1..20. Higher tiers are sharper specializations, not strict upgrades. */
  tier: number;
  cost: number;
  /** Deepest route stage (0-based) the player must have reached to buy this. */
  unlockStage: number;
  speedMod: number;
  accelMod: number;
  handlingMod: number;
  gripMod: number;
}

/** One equipped part id per category; null means the stock (no-op) fitting. */
export interface EquippedLoadout {
  engine: string | null;
  transmission: string | null;
  suspension: string | null;
  wheels: string | null;
}

/** Resolved 0..100 metric surface. 50 on every axis is the stock car. */
export interface CarMetrics {
  speed: number;
  accel: number;
  handling: number;
  grip: number;
}

export function emptyLoadout(): EquippedLoadout {
  return { engine: null, transmission: null, suspension: null, wheels: null };
}
