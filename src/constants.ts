/**
 * Engine-wide constants. Kept in one place so the retro look and the simulation
 * cadence are single-sourced.
 */

import { PALETTE } from './assets/palette.js';
import type { TrackConfig } from './types/engine.js';

/** Fixed logical framebuffer (research §4 / plan §2.4). Nearest-neighbour upscaled. */
export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 270;

/** Fixed physics timestep. Simulation is deterministic and decoupled from render. */
export const STEP_S = 1 / 60;
export const STEP_MS = 1000 / 60;

/**
 * Upper bound on the frame delta fed into the accumulator. A long stall (tab
 * backgrounded, GC pause, breakpoint) must not queue a huge burst of catch-up
 * steps — that "spiral of death" would make the freeze worse. We clamp instead.
 */
export const MAX_FRAME_MS = 250;

/**
 * Default projection intrinsics (plan §7). These are *seed defaults* for the
 * per-camera fields (`Camera.focalLength`, `.height`, `.horizon`) — the carrier
 * of truth is the `Camera`, not these constants. Exact numbers are provisional
 * and get retuned when the road first renders in Phase 2; the math is correct
 * regardless of the values.
 */
export const DEFAULT_FOCAL_LENGTH = 0.84; // d_screen (screen-plane distance)
export const DEFAULT_CAMERA_HEIGHT = 1000; // h_camera above the road plane (world units)

/**
 * Screen layout (research §5a). The horizon sits just above vertical centre so
 * the road gets the bottom ~56% — correct proportions for a racer. Moving this
 * moves the vanishing point for every projected segment; retune
 * DEFAULT_FOCAL_LENGTH alongside it if the road reads wrong.
 */
export const HORIZON_Y = 118; // Y_horizon; vanishing row for a level camera
export const HEADER_H = 40; // TX-1 blue header depth
export const HUD_MARGIN = 6; // safe inset from every edge (iOS notch)
export const HUD_ROW_Y = 248; // baseline row for the SCORE / SPEED corner readouts
export const PLAYER_CAR_BASE_Y = 232; // player car bottom edge
export const PLAYER_CAR_WIDTH = 120; // player car drawn width (~1/4 screen)
/** Car id the bake pipeline writes into cars.json; selects the player's body frames. */
export const PLAYER_CAR_ID = 'sports';

/**
 * Provisional track geometry (Jake Gordon's proven seed values). `roadWidth` is
 * the road's world *half*-width used directly as the `X_offset` of each edge in
 * projection. Retuned during the Phase 2 visual gate.
 */
export const DEFAULT_TRACK_CONFIG: TrackConfig = {
  roadWidth: 2000, // world half-width of the road surface
  segmentLength: 200, // world depth per segment
  drawDistance: 300, // segments projected per frame
  rumbleSegments: 5, // segments per rumble colour band
};

/**
 * Vehicle tuning (plan.md §7 PRD). Display/UI works in km/h; the world sim works
 * in world units (u/s). `KMH_PER_WORLD` is the single conversion (moved from HUD).
 * Feel numbers are provisional and retuned at the Phase 5 visual gate; the PRD
 * limits (gear caps, −60% skid grip, μ_offroad) are contractual and tested.
 */
export const KMH_PER_WORLD = 0.05; // world u/s → km/h display
export const WORLD_PER_KMH = 1 / KMH_PER_WORLD;

export const GEAR_MAX_KMH = [120, 290] as const; // Low, High top speeds
/** Top speed in world u/s — the highest gear's ceiling, converted once. Renderer
 * ramps the speed streaks against this rather than against a per-track number,
 * because the streaks are a camera effect and the car's ceiling never varies. */
export const TOP_SPEED_WORLD = GEAR_MAX_KMH[GEAR_MAX_KMH.length - 1]! * WORLD_PER_KMH;
export const GEAR_ACCEL_KMH_S = [60, 25] as const; // zero-speed accel per gear (Low torquey)
export const BRAKE_KMH_S = 180; // full-brake decel
export const HANDBRAKE_KMH_S = 270; // handbrake decel
export const COAST_KMH_S = 20; // engine-drag decel at zero throttle
export const MU_OFFROAD = 0.85; // per-second speed retention factor off-road
export const OFFROAD_MAX_KMH = 60; // off-road drag only bleeds speed above this
export const STEER_MAX_WPS = 2500; // lateral world u/s at full steer authority
/**
 * Curvature × speedRatio² lateral push (world u/s).
 *
 * MUST stay below STEER_MAX_WPS across the curvature band generate.ts emits
 * (|curve| ≤ 5), or the driver is shoved off the road with the stick pinned and
 * the car reads as "steering itself". At 600 the sharpest corner taken flat out
 * costs 5 × 600 = 3000 u/s against 2500 u/s of steering — the driver loses
 * ground slowly and must lift, which is the intended arcade tension. Gentle arcs
 * (curve 1) cost 24% of the stick and are held one-handed.
 */
export const CENTRIFUGAL = 600;
/** Steer lock-to-lock rate (units of −1..+1 per second). A key press is a 0→1
 * step; applying it raw darts the car. ~170ms to full lock stays responsive
 * while giving the driver a usable analogue band on a digital input. */
export const STEER_RATE_PER_S = 6;
/** Hard bound on |posX|, in road half-widths. The off-road μ only bleeds speed —
 * nothing else stops the car leaving the world, so a stuck steer input would
 * otherwise sail it somewhere it can never be driven back from. */
export const MAX_LATERAL_ROADWIDTHS = 2;
/** Gamepad stick deadzone. A worn stick rests off-centre; without this its drift
 * becomes a constant steer bias indistinguishable from the reported bug. */
export const PAD_STEER_DEADZONE = 0.15;

/**
 * Combined player+traffic half-width for the collision test, in world units.
 *
 * This is the centre-to-centre distance at which two cars are touching, so it
 * must stay well under the lane spacing (roadWidth 2000 over 3 lanes ≈ 1300 per
 * lane) or there is no gap wide enough to thread and every pass is a crash.
 */
export const CAR_COLLIDE_HALF_WIDTH = 460;
export const SKID_CURVE_THRESHOLD = 0.4; // |segment curve| that can trigger a skid
export const SKID_SPEED_KMH = 200; // min speed for a skid trigger
export const SKID_GRIP = 0.4; // steering grip while skidding (−60%)
export const SKID_SPEED_DECAY = 0.9; // per-second speed retention while skidding
export const SKID_RECOVERY_STEPS = 12; // consecutive counter-steer steps to recover

/**
 * Retro palette, derived from the shared master palette (`assets/palette.json`)
 * so the engine and the offline bake scripts clamp to identical values.
 * Key names are unchanged from the provisional set so no call site moves.
 */
export const COLORS = {
  sky: PALETTE.sky.night[0]!,
  groundLight: PALETTE.foliage[1]!,
  groundDark: PALETTE.foliage[0]!,
  road: PALETTE.road.surfaceA,
  roadDark: PALETTE.road.surfaceB,
  shoulder: PALETTE.road.shoulder,
  rumbleLight: PALETTE.kerb.white,
  rumbleDark: PALETTE.kerb.red,
  lane: PALETTE.lane,
} as const;
