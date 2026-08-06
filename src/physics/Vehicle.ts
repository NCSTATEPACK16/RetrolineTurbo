import type { PlayerState } from '../types/engine.js';
import {
  STEP_S, WORLD_PER_KMH,
  GEAR_MAX_KMH, GEAR_ACCEL_KMH_S, BRAKE_KMH_S, HANDBRAKE_KMH_S, COAST_KMH_S,
  MU_OFFROAD, OFFROAD_MAX_KMH,
  STEER_MAX_WPS, CENTRIFUGAL,
  SKID_CURVE_THRESHOLD, SKID_SPEED_KMH, SKID_GRIP, SKID_SPEED_DECAY, SKID_RECOVERY_STEPS,
} from '../constants.js';

/** Normalized per-step driver intent. Filled by InputManager; owned by physics
 * so the dependency points input → physics, not both ways. `gearUp`/`gearDown`
 * are edge-triggered (true for exactly one step per press). */
export interface Command {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // −1 (left) .. +1 (right)
  handbrake: boolean;
  gearUp: boolean;
  gearDown: boolean;
  nitro: boolean; // reserved (Phase 9 economy / Phase 10 juice)
}

/** All-neutral command. Callers allocate one and refill it per step (hard rule 4). */
export function createCommand(): Command {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, gearUp: false, gearDown: false, nitro: false };
}

/**
 * Deterministic arcade vehicle (plan.md §7 PRD). Fixed-step state machine:
 * every field is a number/boolean mutated in `step` — no allocation, no time
 * source of its own, no rendering knowledge. Implements the PlayerState seam
 * established in Phase 4, so collision/HUD/sprite consumers are unchanged.
 */
export class Vehicle implements PlayerState {
  z = 0; // world depth along the track
  x = 0; // world lateral position (track-centre-relative)
  speedKmh = 0;
  gear = 1; // 1 = Low, 2 = High (HUD displays this directly)

  private isSkidding = false;
  private skidDir = 0; // sign of the curvature that triggered the skid
  private recoverySteps = 0;

  constructor(private readonly roadWidth: number) {}

  /** World-units-per-second speed for PlayerState consumers. */
  get speed(): number {
    return this.speedKmh * WORLD_PER_KMH;
  }

  get skidding(): boolean {
    return this.isSkidding;
  }

  /** Advance one fixed step. `curvature` is the current segment's K_i. */
  step(cmd: Command, curvature: number, dt: number = STEP_S): void {
    // -- transmission -------------------------------------------------------
    if (cmd.gearUp && this.gear < GEAR_MAX_KMH.length) this.gear++;
    if (cmd.gearDown && this.gear > 1) this.gear--;
    const g = this.gear - 1;
    const gearMax = GEAR_MAX_KMH[g]!;

    // -- longitudinal -------------------------------------------------------
    if (cmd.handbrake) {
      this.speedKmh -= HANDBRAKE_KMH_S * dt;
    } else if (cmd.brake > 0) {
      this.speedKmh -= BRAKE_KMH_S * cmd.brake * dt;
    } else if (cmd.throttle > 0 && this.speedKmh < gearMax) {
      // Tapering accel curve: full torque at rest, zero at the gear cap.
      this.speedKmh += GEAR_ACCEL_KMH_S[g]! * cmd.throttle * (1 - this.speedKmh / gearMax) * dt;
    } else {
      this.speedKmh -= COAST_KMH_S * dt; // engine drag (also drains an over-cap downshift)
    }
    if (Math.abs(this.x) > this.roadWidth && this.speedKmh > OFFROAD_MAX_KMH) {
      this.speedKmh *= MU_OFFROAD ** dt;
    }
    if (this.isSkidding) this.speedKmh *= SKID_SPEED_DECAY ** dt;
    if (this.speedKmh < 0) this.speedKmh = 0;

    // -- skid trigger / recovery -------------------------------------------
    if (!this.isSkidding) {
      if (Math.abs(curvature) > SKID_CURVE_THRESHOLD && this.speedKmh > SKID_SPEED_KMH) {
        this.isSkidding = true;
        this.skidDir = Math.sign(curvature);
        this.recoverySteps = 0;
      }
    } else {
      // Counter-steer points into the curve (against the centrifugal shove).
      const counterSteering = cmd.steer * this.skidDir > 0;
      if (cmd.throttle < 0.05 && counterSteering) {
        if (++this.recoverySteps >= SKID_RECOVERY_STEPS) {
          this.isSkidding = false;
          this.skidDir = 0;
        }
      } else {
        this.recoverySteps = 0;
      }
    }

    // -- lateral ------------------------------------------------------------
    const grip = this.isSkidding ? SKID_GRIP : 1;
    const authority = Math.min(1, this.speedKmh / 60); // no curb-steering at rest
    this.x += cmd.steer * STEER_MAX_WPS * grip * authority * dt;
    const speedRatio = this.speedKmh / GEAR_MAX_KMH[GEAR_MAX_KMH.length - 1]!;
    this.x -= curvature * CENTRIFUGAL * speedRatio * speedRatio * dt;

    // -- longitudinal advance ----------------------------------------------
    this.z += this.speed * dt;
  }

  /** Apply a Collision.responseDelta (speed multiplier + lateral shove). */
  applyCollision(speedFactor: number, xPush: number): void {
    this.speedKmh *= speedFactor;
    this.x += xPush;
  }

  reset(): void {
    this.z = 0; this.x = 0; this.speedKmh = 0; this.gear = 1;
    this.isSkidding = false; this.skidDir = 0; this.recoverySteps = 0;
  }
}
