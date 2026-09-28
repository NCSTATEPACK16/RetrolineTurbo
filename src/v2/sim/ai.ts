import { Button, quantiseSteer, type InputFrame } from './input.js';
import type { CarParams, DriveTuning } from './car.js';
import type { SimTrack } from './track.js';
import { curvatureAt } from './track.js';
import type { CarState } from './world.js';
import { lineK, lineX, type RacingLine } from './racingLine.js';

/**
 * CPU driver: follows the racing line (plus its own lane offset), plans corner
 * speeds from the line's curvature, and brakes early enough to make them.
 * Pure and allocation-free: it reads the sim state and writes an InputFrame,
 * exactly like a human's controller would — CPUs get no physics privileges.
 */
export interface DriverBrain {
  /** Metres added to the racing line (lets the field spread across the road). */
  laneOffset: number;
  /** 0..1: how close to the physical corner-speed limit this driver dares to go. */
  cornerCommit: number;
  /** Metres per (m/s) of steering look-ahead. */
  lookAhead: number;
}

export const DEFAULT_BRAIN: DriverBrain = { laneOffset: 0, cornerCommit: 0.82, lookAhead: 0.45 };

const PLAN_STEP = 10;
const PLAN_DISTANCE = 140;

/** Fastest a car can hold through curvature `k` using its steering authority. */
export function cornerSpeed(k: number, p: CarParams, commit: number): number {
  const a = Math.abs(k);
  if (a < 1e-5) return p.topSpeed * 1.2;
  return Math.sqrt((p.lateralSpeed * commit) / (a * p.centrifugal));
}

/** Highest speed from which the car can still slow to every upcoming corner in time. */
export function plannedSpeed(car: CarState, p: CarParams, t: DriveTuning, brain: DriverBrain, line: RacingLine, track: SimTrack): number {
  const decel = t.brake * 0.6;
  let allowed = p.topSpeed * 1.2;
  for (let d = 0; d <= PLAN_DISTANCE; d += PLAN_STEP) {
    const k = Math.max(Math.abs(lineK(line, track, car.s + d)), Math.abs(curvatureAt(track, wrap(track, car.s + d))) * 0.85);
    const v = cornerSpeed(k, p, brain.cornerCommit);
    const reach = Math.sqrt(v * v + 2 * decel * d);
    if (reach < allowed) allowed = reach;
  }
  return allowed;
}

function wrap(track: SimTrack, s: number): number {
  const L = track.length;
  return s >= L ? s - L : s < 0 ? s + L : s;
}

export function driveCpu(
  car: CarState, p: CarParams, t: DriveTuning, brain: DriverBrain, line: RacingLine, track: SimTrack, out: InputFrame,
): InputFrame {
  // Steering: aim at the line a little ahead, and pre-load against the curve's push.
  const ahead = 4 + Math.max(0, car.speed) * brain.lookAhead;
  const target = lineX(line, track, car.s + ahead) + brain.laneOffset;
  const k = curvatureAt(track, car.s);
  const wantLateral = (target - car.x) * 1.6 + k * car.speed * car.speed * p.centrifugal;
  out.steer = quantiseSteer(wantLateral / p.lateralSpeed);

  // Speed: throttle, lift, or brake against the plan.
  const allowed = plannedSpeed(car, p, t, brain, line, track);
  if (car.speed > allowed + 1.5) out.buttons = Button.Brake;
  else if (car.speed > allowed) out.buttons = 0;
  else out.buttons = Button.Throttle;
  return out;
}
