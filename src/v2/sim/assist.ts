import { Button, STEER_MAX, held, quantiseSteer, type InputFrame } from './input.js';
import { curvatureAt, halfWidthAt, type SimTrack } from './track.js';
import type { CarParams, DriveTuning } from './car.js';
import type { CarState } from './world.js';

/**
 * Junior assist (PRD section 2): per player, so a 5-year-old on Junior can race
 * a parent on 150cc in split-screen. It works by rewriting that player's input
 * each tick inside the sim, so it is deterministic and replays exactly.
 */
export const Assist = {
  /** Holds the throttle for you (brake still works). */
  AutoAccel: 1 << 0,
  /** Steering is nudged back toward the road and pre-loaded against corners. */
  RoadKeep: 1 << 1,
  /** Drifts itself through real corners for free mini-turbos. */
  AutoDrift: 1 << 2,
  /** Hazards wobble you instead of spinning you out (read by the item layer). */
  NoSpin: 1 << 3,
} as const;

export const JUNIOR = Assist.AutoAccel | Assist.RoadKeep | Assist.AutoDrift | Assist.NoSpin;

export const ASSIST = {
  /** Start nudging this far inside the road edge, metres. */
  edgeMargin: 1.8,
  edgeGain: 0.45,
  /** Fraction of the corner's push the assist steers against for you. */
  cornerHelp: 0.7,
  driftCurvature: 0.012,
} as const;

export function applyAssist(
  flags: number, car: CarState, p: CarParams, t: DriveTuning, track: SimTrack, src: InputFrame, out: InputFrame,
): InputFrame {
  out.steer = src.steer;
  out.buttons = src.buttons;
  if (flags === 0) return out;

  if (flags & Assist.AutoAccel && !held(src, Button.Brake)) out.buttons |= Button.Throttle;

  const k = curvatureAt(track, car.s);
  if (flags & Assist.RoadKeep) {
    let steer = src.steer / STEER_MAX;
    // Carry part of the corner for them...
    steer += ((k * car.speed * car.speed * p.centrifugal) / p.lateralSpeed) * ASSIST.cornerHelp;
    // ...and lean them off the edge before they get there.
    const hw = halfWidthAt(track, car.s) - ASSIST.edgeMargin;
    if (car.x > hw) steer -= (car.x - hw) * ASSIST.edgeGain;
    else if (car.x < -hw) steer += (-hw - car.x) * ASSIST.edgeGain;
    out.steer = quantiseSteer(steer);
  }

  if (flags & Assist.AutoDrift) {
    const corner = Math.abs(k) > ASSIST.driftCurvature && car.speed > t.driftMinSpeed + 3;
    const intoCorner = out.steer * k > 0;
    if (car.drift === 0) {
      // Tap to hop in (a fresh press each time, like a real thumb).
      if (corner && intoCorner && (car.prevButtons & Button.Drift) === 0) out.buttons |= Button.Drift;
    } else if (corner) {
      out.buttons |= Button.Drift; // hold through the bend; letting go on exit fires the boost
    }
  }
  return out;
}
