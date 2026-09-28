/**
 * Driving model v2: six player-facing stats (1..10, Mario Kart 8-style) mapped
 * through one tested function onto the physical parameters the sim steps with.
 * DRIVE_TUNING holds every scaling constant so the F8 overlay can edit them live.
 */
export interface CarStats {
  speed: number;
  accel: number;
  handling: number;
  weight: number;
  offroad: number;
  miniTurbo: number;
}

export const STAT_KEYS = ['speed', 'accel', 'handling', 'weight', 'offroad', 'miniTurbo'] as const;
export const STAT_MIN = 1;
export const STAT_MAX = 10;

export const DEFAULT_STATS: CarStats = { speed: 5, accel: 5, handling: 5, weight: 5, offroad: 5, miniTurbo: 5 };

export interface DriveTuning {
  topSpeedBase: number; topSpeedPerStat: number;
  accelBase: number; accelPerStat: number; accelWeightPenalty: number;
  lateralBase: number; lateralPerStat: number;
  steerRateBase: number; steerRatePerStat: number;
  centrifugalBase: number; centrifugalPerHandling: number; centrifugalPerWeight: number;
  massBase: number; massPerStat: number;
  offroadCapBase: number; offroadCapPerStat: number; offroadBleed: number; offroadDrive: number;
  miniTurboBase: number; miniTurboPerStat: number;
  brake: number; coastDrag: number;
  boostSpeed: number; boostAccel: number;
  /** Gearbox. */
  /** autoDownshift: drop a gear below this fraction of the lower gear's top speed. */
  shiftCut: number; autoUpshift: number; autoDownshift: number;
  perfectShiftLo: number; perfectShiftHi: number; perfectKick: number; perfectKickTime: number;
  lowRevTorque: number;
}

export const DRIVE_TUNING: DriveTuning = {
  topSpeedBase: 36, topSpeedPerStat: 1.2,
  accelBase: 9, accelPerStat: 1.3, accelWeightPenalty: 0.02,
  lateralBase: 7, lateralPerStat: 0.5,
  steerRateBase: 3, steerRatePerStat: 0.3,
  centrifugalBase: 0.7, centrifugalPerHandling: 0.03, centrifugalPerWeight: 0.01,
  massBase: 0.8, massPerStat: 0.08,
  offroadCapBase: 0.35, offroadCapPerStat: 0.04, offroadBleed: 4, offroadDrive: 0.5,
  miniTurboBase: 0.6, miniTurboPerStat: 0.08,
  brake: 30, coastDrag: 3,
  boostSpeed: 1.15, boostAccel: 12,
  shiftCut: 0.12, autoUpshift: 0.93, autoDownshift: 0.75,
  perfectShiftLo: 0.88, perfectShiftHi: 0.97, perfectKick: 1.25, perfectKickTime: 1.2,
  lowRevTorque: 0.8,
};

/** Fraction of top speed at which each of the five gears tops out. */
export const GEAR_TOPS = [0.28, 0.46, 0.64, 0.82, 1] as const;

export interface CarParams {
  topSpeed: number;
  accel: number;
  lateralSpeed: number;
  steerRate: number;
  centrifugal: number;
  mass: number;
  /** Fraction of top speed you can hold on grass/sand. */
  offroadCap: number;
  /** Multiplier on mini-turbo boost duration. */
  miniTurbo: number;
  /** Manual gearbox (shift buttons) instead of automatic. */
  manual: boolean;
}

export function clampStat(v: number): number {
  return v < STAT_MIN ? STAT_MIN : v > STAT_MAX ? STAT_MAX : v;
}

export function statsToParams(stats: CarStats, manual = false, t: DriveTuning = DRIVE_TUNING): CarParams {
  const s = (k: keyof CarStats): number => clampStat(stats[k]);
  return {
    topSpeed: t.topSpeedBase + t.topSpeedPerStat * s('speed'),
    accel: (t.accelBase + t.accelPerStat * s('accel')) * (1 - t.accelWeightPenalty * (s('weight') - 5)),
    lateralSpeed: t.lateralBase + t.lateralPerStat * s('handling'),
    steerRate: t.steerRateBase + t.steerRatePerStat * s('handling'),
    centrifugal: t.centrifugalBase - t.centrifugalPerHandling * s('handling') - t.centrifugalPerWeight * s('weight'),
    mass: t.massBase + t.massPerStat * s('weight'),
    offroadCap: t.offroadCapBase + t.offroadCapPerStat * s('offroad'),
    miniTurbo: t.miniTurboBase + t.miniTurboPerStat * s('miniTurbo'),
    manual,
  };
}
