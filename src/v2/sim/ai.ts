import { Button, quantiseSteer, type InputFrame } from './input.js';
import type { CarParams, DriveTuning } from './car.js';
import { driftTier } from './car.js';
import type { SimTrack } from './track.js';
import { arcDelta, curvatureAt, halfWidthAt } from './track.js';
import type { CarState, SimWorld } from './world.js';
import { lineK, lineX, type RacingLine } from './racingLine.js';

/**
 * CPU drivers. They race through the same InputFrame as a human — no physics
 * privileges — layered as: racing line + corner-speed planning, a personality,
 * awareness of other cars and hazards, drift use, and seeded mistakes.
 * Everything a CPU remembers lives in its CpuDriver, so races stay
 * deterministic and replayable. Allocation-free per tick.
 */
export interface Personality {
  /** 0..1: corner commitment, braking precision. */
  skill: number;
  /** 0..1: defends, blocks, leans on people. */
  aggression: number;
  /** 0..1: fires items early and often (used by the item layer). */
  itemUse: number;
  /** Mistakes per minute of racing. */
  mistakeRate: number;
  /** 0..1: drifts corners and holds them for bigger tiers. */
  driftSkill: number;
  /** Preferred offset from the racing line, metres. */
  laneOffset: number;
}

export const DEFAULT_PERSONALITY: Personality = { skill: 0.6, aggression: 0.4, itemUse: 0.5, mistakeRate: 1, driftSkill: 0.5, laneOffset: 0 };

export interface CpuDriver {
  personality: Personality;
  /** Scales skill for rubber-banding (1 = the driver's own ability). */
  skillScale: number;
  /** Scales mistake rate for rubber-banding. */
  mistakeScale: number;
  /** xorshift32 state. */
  rng: number;
  /** Seconds left of the current mistake, and which kind (1 run wide, 2 lift). */
  mistake: number;
  mistakeKind: number;
  /** Current extra lateral offset for passing/defending, eased. */
  tactic: number;
  /** Seconds left committed to the current pass. */
  passTime: number;
  passSide: number;
  /** Mistakes made so far (for tests and tuning). */
  mistakes: number;
}

export function createCpuDriver(personality: Personality, seed: number): CpuDriver {
  return {
    personality: { ...personality }, skillScale: 1, mistakeScale: 1, rng: (seed >>> 0) || 0x9e3779b9,
    mistake: 0, mistakeKind: 0, tactic: 0, passTime: 0, passSide: 0, mistakes: 0,
  };
}

/** Deterministic uniform [0, 1). */
export function nextRandom(d: CpuDriver): number {
  let x = d.rng;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  d.rng = x;
  return x / 4294967296;
}

/** A thing on the track to steer around (oil slicks and the like, from the item layer). */
export interface Hazard { active: boolean; s: number; x: number; radius: number; /** Seconds left before it vanishes. */ life: number }

export const AI = {
  dt: 1 / 60,
  commitBase: 0.7,
  commitPerSkill: 0.22,
  planStep: 10,
  planDistance: 140,
  steerGain: 1.6,
  /** Look this far ahead for a car to pass, metres. */
  passLook: 22,
  passOffset: 2.6,
  passCommit: 2.5,
  defendLook: 14,
  defendMax: 2.2,
  hazardLook: 45,
  tacticEase: 2.5,
  mistakeSeconds: 0.8,
  driftMinCurvature: 0.012,
} as const;

/** Fastest a car can hold through curvature `k` using its steering authority. */
export function cornerSpeed(k: number, p: CarParams, commit: number): number {
  const a = Math.abs(k);
  if (a < 1e-5) return p.topSpeed * 1.2;
  return Math.sqrt((p.lateralSpeed * commit) / (a * p.centrifugal));
}

function wrap(track: SimTrack, s: number): number {
  const L = track.length;
  return s >= L ? s - L : s < 0 ? s + L : s;
}

/** Highest speed from which the car can still slow to every upcoming corner in time. */
export function plannedSpeed(car: CarState, p: CarParams, t: DriveTuning, commit: number, line: RacingLine, track: SimTrack): number {
  const decel = t.brake * 0.6;
  let allowed = p.topSpeed * 1.2;
  for (let d = 0; d <= AI.planDistance; d += AI.planStep) {
    const k = Math.max(Math.abs(lineK(line, track, car.s + d)), Math.abs(curvatureAt(track, wrap(track, car.s + d))) * 0.85);
    const v = cornerSpeed(k, p, commit);
    const reach = Math.sqrt(v * v + 2 * decel * d);
    if (reach < allowed) allowed = reach;
  }
  return allowed;
}

/** Commitment for this driver right now, with rubber-banding and any mistake applied. */
function commitOf(d: CpuDriver): number {
  const skill = Math.min(1.2, d.personality.skill * d.skillScale);
  let c = AI.commitBase + AI.commitPerSkill * skill;
  if (d.mistake > 0 && d.mistakeKind === 1) c += 0.35; // overcooks the corner and runs wide
  return c;
}

function stepMistakes(d: CpuDriver): void {
  if (d.mistake > 0) {
    d.mistake -= AI.dt;
    return;
  }
  const perTick = ((d.personality.mistakeRate * d.mistakeScale) / 60) * AI.dt;
  if (nextRandom(d) < perTick) {
    d.mistake = AI.mistakeSeconds * (0.6 + nextRandom(d) * 0.8);
    d.mistakeKind = nextRandom(d) < 0.6 ? 1 : 2;
    d.mistakes++;
  }
}

/** Passing and defending: pick a lateral tactic offset from nearby cars. */
function tacticFor(world: SimWorld, i: number, d: CpuDriver, track: SimTrack, baseX: number): number {
  const me = world.cars[i]!;
  // Committed to a pass: hold the side until it's done.
  if (d.passTime > 0) {
    d.passTime -= AI.dt;
    return d.passSide * AI.passOffset;
  }
  let target = 0;
  let nearestAhead: number = AI.passLook;
  let nearestBehind: number = AI.defendLook;
  for (let j = 0; j < world.cars.length; j++) {
    if (j === i) continue;
    const o = world.cars[j]!;
    const ds = arcDelta(track, me.s, o.s);
    const dx = o.x - me.x;
    if (ds > 0 && ds < nearestAhead && Math.abs(dx) < 2.4 && o.speed < me.speed + 1) {
      // Slower car in my lane ahead: go round on the side with more road.
      nearestAhead = ds;
      const hw = halfWidthAt(track, me.s);
      const roomRight = hw - o.x, roomLeft = o.x + hw;
      d.passSide = roomRight >= roomLeft ? 1 : -1;
      d.passTime = AI.passCommit;
      target = d.passSide * AI.passOffset;
    } else if (ds < 0 && -ds < nearestBehind && o.speed > me.speed - 0.5 && d.personality.aggression > 0.45 && d.passTime <= 0) {
      // Someone closing behind: an aggressive driver slides across to cover their line.
      nearestBehind = -ds;
      const want = o.x - baseX;
      target = Math.max(-AI.defendMax, Math.min(AI.defendMax, want)) * d.personality.aggression;
    }
  }
  return target;
}

/** Nudge the target line away from any active hazard ahead. */
function avoidHazards(me: CarState, targetX: number, hazards: readonly Hazard[], track: SimTrack): number {
  let x = targetX;
  for (let h = 0; h < hazards.length; h++) {
    const hz = hazards[h]!;
    if (!hz.active) continue;
    const ds = arcDelta(track, me.s, hz.s);
    if (ds <= 0 || ds > AI.hazardLook) continue;
    const clear = hz.radius + 1.6;
    if (Math.abs(x - hz.x) < clear) x = x >= hz.x ? hz.x + clear : hz.x - clear;
  }
  const hw = halfWidthAt(track, me.s) - 1;
  return x > hw ? hw : x < -hw ? -hw : x;
}

/** What a CPU can see of the item layer: slicks to dodge, and what it's holding. */
export interface ItemView { readonly hazards: readonly Hazard[]; readonly held?: Int8Array; readonly prevItem?: Uint8Array }

const NO_HAZARDS: readonly Hazard[] = [];

/** Item ids (mirrors items.ts; kept numeric here to avoid a sim import cycle). */
const I_BOOST = 1, I_OIL = 2, I_SHIELD = 3, I_MAGNET = 4, I_SEEKER = 5;

/** Should this CPU fire its item this tick? Scaled by its item-happiness. */
function wantsItem(world: SimWorld, i: number, d: CpuDriver, line: RacingLine, track: SimTrack, item: number): boolean {
  const u = d.personality.itemUse;
  const me = world.cars[i]!;
  const r = nextRandom(d);
  let behind = Infinity, ahead = Infinity;
  for (let j = 0; j < world.cars.length; j++) {
    if (j === i) continue;
    const gap = arcDelta(track, me.s, world.cars[j]!.s);
    if (gap > 0 && gap < ahead) ahead = gap;
    if (gap < 0 && -gap < behind) behind = -gap;
  }
  const straight = Math.abs(lineK(line, track, me.s + 40)) < 0.004;
  switch (item) {
    case I_BOOST: return straight && r < (0.02 + 0.1 * u);
    case I_OIL: return behind < 15 ? r < 0.05 + 0.2 * u : r < 0.002;
    case I_SHIELD: return r < 0.004 + 0.02 * u;
    case I_MAGNET: return ahead < 50 && straight && r < 0.05 + 0.1 * u;
    case I_SEEKER: return r < 0.05 + 0.1 * u;
    default: return false;
  }
}

export function driveCpu(
  world: SimWorld, i: number, d: CpuDriver, line: RacingLine, track: SimTrack, items: ItemView | null, out: InputFrame,
): InputFrame {
  const hazards = items?.hazards ?? NO_HAZARDS;
  const car = world.cars[i]!;
  const p = world.params[i]!;
  const t = world.tuning;
  stepMistakes(d);

  // Where to be: racing line + personal lane + tactics (eased), clear of hazards.
  const ahead = 4 + Math.max(0, car.speed) * 0.45;
  const base = lineX(line, track, car.s + ahead) + d.personality.laneOffset;
  const want = tacticFor(world, i, d, track, base);
  d.tactic += (want - d.tactic) * Math.min(1, AI.tacticEase * AI.dt);
  let target = avoidHazards(car, base + d.tactic, hazards, track);
  if (d.mistake > 0 && d.mistakeKind === 1) {
    // Overcooked it: carried too much speed and is running out toward the edge of the corner.
    const k = lineK(line, track, car.s + ahead);
    target = (k > 0 ? -1 : 1) * (halfWidthAt(track, car.s) + 2);
  }

  // Steering, pre-loaded against the curve's push.
  const k = curvatureAt(track, car.s);
  const correction = (target - car.x) * AI.steerGain;
  if (car.drift === 0) {
    out.steer = quantiseSteer((correction + k * car.speed * car.speed * p.centrifugal) / p.lateralSpeed);
  } else {
    // Mid-drift the car carves inward on its own and the curve pushes less (see world.ts): steer to trim that arc.
    const push = k * car.speed * car.speed * p.centrifugal * t.driftCentrifugal;
    out.steer = quantiseSteer((correction + push - car.drift * t.driftInward) / (p.lateralSpeed * 0.6));
  }

  // Speed plan.
  const allowed = plannedSpeed(car, p, t, commitOf(d), line, track);
  let buttons: number;
  if (d.mistake > 0 && d.mistakeKind === 2) buttons = 0; // lifted: lost concentration
  else if (car.speed > allowed + 1.5) buttons = Button.Brake;
  else if (car.speed > allowed) buttons = 0;
  else buttons = Button.Throttle;

  // Drifting: skilled drivers hop into real corners and hold for bigger tiers.
  const corner = Math.abs(lineK(line, track, car.s + 15));
  if (car.drift === 0) {
    if (corner > AI.driftMinCurvature && car.speed > t.driftMinSpeed + 4 && d.personality.driftSkill > 0.25 && Math.abs(out.steer) > 40 &&
      (car.prevButtons & Button.Drift) === 0) buttons |= Button.Drift;
  } else {
    const goal = d.personality.driftSkill > 0.75 ? 3 : d.personality.driftSkill > 0.45 ? 2 : 1;
    const keep = corner > AI.driftMinCurvature * 0.6 && driftTier(car.driftCharge, t) < goal;
    if (keep) buttons |= Button.Drift;
  }
  const holding = items?.held?.[i] ?? 0;
  if (holding !== 0 && !items?.prevItem?.[i] && wantsItem(world, i, d, line, track, holding)) buttons |= Button.Item;
  out.buttons = buttons;
  return out;
}
