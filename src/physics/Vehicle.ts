import type { PlayerState } from '../types/engine.js';
import {
  STEP_S, WORLD_PER_KMH,
  GEAR_MAX_KMH, GEAR_ACCEL_KMH_S, BRAKE_KMH_S, HANDBRAKE_KMH_S, COAST_KMH_S,
  MU_OFFROAD, OFFROAD_MAX_KMH,
  STEER_MAX_WPS, CENTRIFUGAL,
  SKID_CURVE_THRESHOLD, SKID_SPEED_KMH, SKID_GRIP, SKID_SPEED_DECAY, SKID_RECOVERY_STEPS,
  STEER_RATE_PER_S, MAX_LATERAL_ROADWIDTHS,
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
 * The four tunables a Phase 9 parts loadout can shift. Everything else about the
 * car (brake rates, off-road drag, skid thresholds) stays a module constant —
 * parts alter the metric surface described in the spec, nothing more.
 */
export interface VehicleParams {
  gearMaxKmh: readonly [number, number];
  gearAccelKmhS: readonly [number, number];
  steerMaxWps: number;
  centrifugal: number;
}

/** Stock car: reproduces the pre-Phase-9 handling exactly. */
export const DEFAULT_VEHICLE_PARAMS: VehicleParams = {
  gearMaxKmh: GEAR_MAX_KMH,
  gearAccelKmhS: GEAR_ACCEL_KMH_S,
  steerMaxWps: STEER_MAX_WPS,
  centrifugal: CENTRIFUGAL,
};

/**
 * Deterministic arcade vehicle (plan.md §7 PRD). Fixed-step state machine:
 * every field is a number/boolean mutated in `step` — no allocation, no time
 * source of its own, no rendering knowledge. Implements the PlayerState seam
 * established in Phase 4, so collision/HUD/sprite consumers are unchanged.
 */
export class Vehicle implements PlayerState {
  private posZ = 0; // world depth along the track
  private posX = 0; // world lateral position (track-centre-relative)
  private kmh = 0;
  private gearIdx = 1; // 1 = Low, 2 = High (HUD displays this directly)

  private isSkidding = false;
  private skidDir = 0; // sign of the curvature that triggered the skid
  private recoverySteps = 0;
  private lastSteer = 0; // last commanded steer, clamped; drives the sprite frame
  private appliedSteer = 0; // lastSteer eased over STEER_RATE_PER_S; drives the physics
  private lastBraking = false; // brake or handbrake held; lights the brake overlay

  constructor(
    private readonly roadWidth: number,
    private readonly params: VehicleParams = DEFAULT_VEHICLE_PARAMS,
  ) {}

  // Read-only state: mutation happens only via step/applyCollision/reset.
  get z(): number { return this.posZ; }
  get x(): number { return this.posX; }
  get speedKmh(): number { return this.kmh; }
  get gear(): number { return this.gearIdx; }

  /** World-units-per-second speed for PlayerState consumers. */
  get speed(): number {
    return this.kmh * WORLD_PER_KMH;
  }

  get skidding(): boolean {
    return this.isSkidding;
  }

  /** 1 at the moment a skid triggers, easing toward 0 as `recoverySteps` counts
   * up toward `SKID_RECOVERY_STEPS` (recovery resets the counter every step the
   * driver isn't actively counter-steering, so this reads as "still sliding"
   * for as long as the skid is uncontrolled, and only fades on a genuine,
   * sustained recovery attempt). Always 0 when not skidding. */
  get skidMagnitude(): number {
    if (!this.isSkidding) return 0;
    const m = 1 - this.recoverySteps / SKID_RECOVERY_STEPS;
    return m < 0 ? 0 : m;
  }

  /** Steer the driver actually applied last step, clamped to -1..1.
   * Reported rather than derived from lateral velocity so the sprite follows the
   * stick immediately — a car that visually straightens mid-corner reads as a bug. */
  get steer(): number {
    return this.lastSteer;
  }

  /** Brake or handbrake held on the last step. Drives the brake-light overlay. */
  get braking(): boolean {
    return this.lastBraking;
  }

  /** Advance one fixed step. `curvature` is the current segment's K_i.
   * `roadCenterX` is the nearest road centre-line's world-x (non-zero during a
   * branch split, where the drivable roads diverge from the track centre) so
   * the off-road test follows the actual road, not the abstract centre. */
  step(cmd: Command, curvature: number, dt: number = STEP_S, roadCenterX = 0): void {
    // Record the driver's intent for the sprite layer. The sprite tracks the
    // *command* so the car leans the instant the key goes down; the physics
    // below tracks `appliedSteer`, which eases toward it. That split is
    // deliberate — an instantly-leaning sprite over a car that takes ~170ms to
    // commit is what makes a digital input read as responsive but not darty.
    this.lastSteer = cmd.steer < -1 ? -1 : cmd.steer > 1 ? 1 : cmd.steer;
    this.lastBraking = cmd.brake > 0 || cmd.handbrake;

    // Rate-limited approach, not a lerp: the time to full lock is the same
    // whatever the step size, so the ramp stays deterministic under any dt.
    const maxDelta = STEER_RATE_PER_S * dt;
    const steerErr = this.lastSteer - this.appliedSteer;
    this.appliedSteer += steerErr > maxDelta ? maxDelta : steerErr < -maxDelta ? -maxDelta : steerErr;

    // -- transmission -------------------------------------------------------
    if (cmd.gearUp && this.gearIdx < this.params.gearMaxKmh.length) this.gearIdx++;
    if (cmd.gearDown && this.gearIdx > 1) this.gearIdx--;
    const g = this.gearIdx - 1;
    const gearMax = this.params.gearMaxKmh[g]!;

    // -- longitudinal -------------------------------------------------------
    if (cmd.handbrake) {
      this.kmh -= HANDBRAKE_KMH_S * dt;
    } else if (cmd.brake > 0) {
      this.kmh -= BRAKE_KMH_S * cmd.brake * dt;
    } else if (cmd.throttle > 0 && this.kmh < gearMax) {
      // Tapering accel curve: full torque at rest, zero at the gear cap.
      this.kmh += this.params.gearAccelKmhS[g]! * cmd.throttle * (1 - this.kmh / gearMax) * dt;
    } else {
      this.kmh -= COAST_KMH_S * dt; // engine drag (also drains an over-cap downshift)
    }
    if (Math.abs(this.posX - roadCenterX) > this.roadWidth && this.kmh > OFFROAD_MAX_KMH) {
      this.kmh *= MU_OFFROAD ** dt;
    }
    if (this.isSkidding) this.kmh *= SKID_SPEED_DECAY ** dt;
    if (this.kmh < 0) this.kmh = 0;

    // -- skid trigger / recovery -------------------------------------------
    if (!this.isSkidding) {
      if (Math.abs(curvature) > SKID_CURVE_THRESHOLD && this.kmh > SKID_SPEED_KMH) {
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
    const authority = Math.min(1, this.kmh / 60); // no curb-steering at rest
    this.posX += this.appliedSteer * this.params.steerMaxWps * grip * authority * dt;
    const speedRatio = this.kmh / this.params.gearMaxKmh[this.params.gearMaxKmh.length - 1]!;
    this.posX -= curvature * this.params.centrifugal * speedRatio * speedRatio * dt;
    // Nothing else bounds posX — off-road only bleeds speed — so without this a
    // held or stuck steer input walks the car away from the world forever.
    const limit = this.roadWidth * MAX_LATERAL_ROADWIDTHS;
    if (this.posX > limit) this.posX = limit;
    else if (this.posX < -limit) this.posX = -limit;

    // -- longitudinal advance ----------------------------------------------
    this.posZ += this.speed * dt;
  }

  /** World-shift at a scene hand-off (route fork): the new track's origin
   * replaces the old node. Pure translation — speed/gear/skid are untouched,
   * so determinism is preserved (translation commutes with stepping). */
  translate(dz: number, dx: number): void {
    this.posZ += dz;
    this.posX += dx;
  }

  /** Apply a Collision.responseDelta (speed multiplier + lateral shove). */
  applyCollision(speedFactor: number, xPush: number): void {
    this.kmh *= speedFactor;
    this.posX += xPush;
  }

  reset(): void {
    this.posZ = 0; this.posX = 0; this.kmh = 0; this.gearIdx = 1;
    this.isSkidding = false; this.skidDir = 0; this.recoverySteps = 0;
    this.lastSteer = 0; this.appliedSteer = 0; this.lastBraking = false;
  }
}
