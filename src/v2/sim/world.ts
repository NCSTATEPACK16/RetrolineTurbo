import { Button, STEER_MAX, held, type InputFrame } from './input.js';
import { curvatureAt, halfWidthAt, type SimTrack } from './track.js';
import { DEFAULT_STATS, DRIVE_TUNING, GEAR_TOPS, driftTier, statsToParams, tierBoost, type CarParams, type DriveTuning } from './car.js';

/** Fixed simulation step: 60Hz. */
export const DT = 1 / 60;

/** Metres of verge beyond the road edge before the barrier. */
export const OFFROAD_MARGIN = 6;

export interface CarState {
  /** Arc length along the centreline, in [0, track.length). */
  s: number;
  /** Lateral offset from the centreline in metres; + is right. */
  x: number;
  /** Forward speed in m/s. */
  speed: number;
  /** Smoothed steering position, -1..1. */
  steer: number;
  /** Raw start-line crossings (forward minus backward). Race laps come from checkpoints in race.ts. */
  lap: number;
  /** Seconds of boost remaining (mini-turbo, items, rocket start). */
  boostTime: number;
  /** Drift direction: -1 left, 0 none, 1 right. */
  drift: number;
  /** Gear index 0..4. */
  gear: number;
  /** Engine speed as a fraction of the current gear's limit, 0..1. */
  rpm: number;
  /** Seconds left of the drive cut during a gear change. */
  shiftCut: number;
  /** Seconds left of a perfect-shift torque kick (manual only). */
  kick: number;
  /** Seconds of mini-turbo charge built this drift. */
  driftCharge: number;
  /** Seconds left of the hop (visual; drifts start with one). */
  hop: number;
  /** Last tick's buttons, for edge detection. */
  prevButtons: number;
}

export interface SimWorld {
  tick: number;
  readonly cars: CarState[];
  /** Per-car physical parameters (from stats + parts). */
  readonly params: CarParams[];
  /** Scaling constants shared by the whole race (the DEV overlay edits these live). */
  tuning: DriveTuning;
}

export function createCar(): CarState {
  return { s: 0, x: 0, speed: 0, steer: 0, lap: 0, boostTime: 0, drift: 0, gear: 0, rpm: 0, shiftCut: 0, kick: 0, driftCharge: 0, hop: 0, prevButtons: 0 };
}

export function createWorld(carCount = 1, params?: readonly CarParams[], tuning: DriveTuning = DRIVE_TUNING): SimWorld {
  const cars: CarState[] = [];
  const ps: CarParams[] = [];
  for (let i = 0; i < carCount; i++) {
    cars.push(createCar());
    ps.push({ ...(params?.[i] ?? statsToParams(DEFAULT_STATS, false, tuning)) });
  }
  return { tick: 0, cars, params: ps, tuning };
}

/** Copy `src` car state into `dst` in place — the previous snapshot for interpolation, without allocating. */
export function copyWorld(dst: SimWorld, src: SimWorld): void {
  dst.tick = src.tick;
  for (let i = 0; i < src.cars.length; i++) Object.assign(dst.cars[i]!, src.cars[i]!);
}

function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return v + maxDelta > target ? target : v + maxDelta;
  return v - maxDelta < target ? target : v - maxDelta;
}

function pressed(car: CarState, input: InputFrame, button: number): boolean {
  return held(input, button) && (car.prevButtons & button) === 0;
}

/** Gearbox: automatic by default; manual rewards an upshift in the sweet spot with a short torque kick. */
function stepGearbox(car: CarState, p: CarParams, input: InputFrame, t: DriveTuning): void {
  const gearTop = (g: number): number => GEAR_TOPS[g]! * p.topSpeed;
  const shiftTo = (g: number): void => {
    car.gear = g;
    car.shiftCut = t.shiftCut;
  };
  if (car.shiftCut > 0) car.shiftCut = Math.max(0, car.shiftCut - DT);
  const last = GEAR_TOPS.length - 1;
  if (p.manual) {
    if (pressed(car, input, Button.ShiftUp) && car.gear < last) {
      const rpm = car.rpm;
      shiftTo(car.gear + 1);
      if (rpm >= t.perfectShiftLo && rpm <= t.perfectShiftHi) car.kick = t.perfectKickTime;
    }
    if (pressed(car, input, Button.ShiftDown) && car.gear > 0) shiftTo(car.gear - 1);
  } else if (car.shiftCut === 0) {
    if (car.rpm >= t.autoUpshift && car.gear < last) shiftTo(car.gear + 1);
    else if (car.gear > 0 && car.speed < gearTop(car.gear - 1) * t.autoDownshift) shiftTo(car.gear - 1);
  }
  if (car.kick > 0) car.kick = Math.max(0, car.kick - DT);
  const r = car.speed / gearTop(car.gear);
  car.rpm = r > 1 ? 1 : r;
}

/** Engine drive multiplier for the current gear state (0 during a shift, 0 at the limiter). */
function torque(car: CarState, t: DriveTuning): number {
  if (car.shiftCut > 0) return 0;
  if (car.rpm >= 1) return 0; // limiter: this gear can't go faster
  let k = car.gear > 0 && car.rpm < 0.3 ? t.lowRevTorque : 1;
  if (car.kick > 0) k *= t.perfectKick;
  return k;
}

/**
 * Hop-drift: tap drift while steering to hop into a slide toward that side.
 * Holding it tightens your line and charges the mini-turbo (faster when you
 * steer into the drift); releasing fires a boost sized by the tier reached.
 */
function stepDrift(car: CarState, p: CarParams, input: InputFrame, offroad: boolean, t: DriveTuning): void {
  if (car.hop > 0) car.hop = Math.max(0, car.hop - DT);
  const steer = input.steer / STEER_MAX;
  if (car.drift === 0) {
    if (pressed(car, input, Button.Drift)) {
      car.hop = t.hopTime;
      if (car.speed >= t.driftMinSpeed && Math.abs(steer) >= t.driftSteerMin) {
        car.drift = steer > 0 ? 1 : -1;
        car.driftCharge = 0;
      }
    }
    return;
  }
  const ended = !held(input, Button.Drift) || held(input, Button.Brake) || car.speed < t.driftMinSpeed * 0.66;
  if (ended) {
    // Only a clean release (not a brake or a stall) cashes in the charge.
    if (!held(input, Button.Drift) && car.speed >= t.driftMinSpeed * 0.66) {
      const boost = tierBoost(driftTier(car.driftCharge, t), t) * p.miniTurbo;
      if (boost > car.boostTime) car.boostTime = boost;
    }
    car.drift = 0;
    car.driftCharge = 0;
    return;
  }
  if (!offroad) car.driftCharge += (steer * car.drift > 0.2 ? t.driftChargeHard : t.driftChargeSoft) * DT;
}

function stepCar(car: CarState, p: CarParams, input: InputFrame, track: SimTrack, t: DriveTuning): void {
  stepGearbox(car, p, input, t);

  // Longitudinal.
  const hw = halfWidthAt(track, car.s);
  const offroad = car.x > hw || car.x < -hw;
  stepDrift(car, p, input, offroad, t);
  const boosting = car.boostTime > 0;
  const top = boosting ? p.topSpeed * t.boostSpeed : p.topSpeed;
  let a = 0;
  if (car.speed < 0 || (car.speed === 0 && held(input, Button.Brake) && !held(input, Button.Throttle))) {
    // Reverse: hold brake from a standstill; throttle brakes you back to zero.
    if (held(input, Button.Brake)) a -= t.reverseAccel;
    else a += held(input, Button.Throttle) ? t.brake : t.coastDrag;
    car.speed += a * DT;
    if (car.speed < -t.reverseMax) car.speed = -t.reverseMax;
    if (car.speed > 0) car.speed = 0;
  } else {
    if (held(input, Button.Throttle) || boosting) {
      const room = 1 - car.speed / top;
      a += p.accel * (room > 0 ? room : 0) * torque(car, t);
      if (boosting && room > 0) a += Math.min(t.boostAccel, (top - car.speed) / DT); // never overshoot the boosted cap
    }
    if (held(input, Button.Brake)) a -= t.brake;
    if (!held(input, Button.Throttle) && !boosting) a -= t.coastDrag;
    if (offroad) {
      const cap = p.offroadCap * p.topSpeed;
      if (a > 0) a *= t.offroadDrive; // wheels spin in the sand
      if (car.speed > cap) a -= (car.speed - cap) * t.offroadBleed;
    }
    if (car.drift !== 0) a -= t.driftDrag;
    if (car.speed > top) a -= (car.speed - top) * 2; // settle back after a boost ends
    car.speed += a * DT;
    if (car.speed < 0) car.speed = 0;
  }
  if (car.boostTime > 0) car.boostTime = Math.max(0, car.boostTime - DT);

  // Lateral: steering moves you across the road, curves push you outward.
  car.steer = approach(car.steer, input.steer / STEER_MAX, p.steerRate * DT);
  const grip = car.speed < 0 ? -0.5 : car.speed < 8 ? car.speed / 8 : 1;
  const k = curvatureAt(track, car.s);
  let lateral = car.steer * p.lateralSpeed * grip;
  let centrifugal = k * car.speed * car.speed * p.centrifugal;
  if (car.drift !== 0) {
    // Sliding: the car carves inward on its own and the curve pushes less; steering trims the arc.
    lateral = car.drift * t.driftInward + car.steer * p.lateralSpeed * 0.6;
    centrifugal *= t.driftCentrifugal;
  }
  car.x += (lateral - centrifugal) * DT;
  const edge = hw + OFFROAD_MARGIN;
  if (car.x > edge || car.x < -edge) {
    car.x = car.x > 0 ? edge : -edge;
    car.speed *= 0.985; // scrubbing the barrier
  }

  // Advance and wrap.
  car.s += car.speed * DT;
  if (car.s >= track.length) {
    car.s -= track.length;
    car.lap++;
  } else if (car.s < 0) {
    car.s += track.length;
    car.lap--;
  }
  car.prevButtons = input.buttons;
}

/** Advance the world one fixed step; `inputs[i]` drives car i. */
export function stepWorld(world: SimWorld, track: SimTrack, inputs: readonly InputFrame[]): void {
  for (let i = 0; i < world.cars.length; i++) stepCar(world.cars[i]!, world.params[i]!, inputs[i]!, track, world.tuning);
  world.tick++;
}

// FNV-1a over the raw float64 bits of every state field. Shared scratch buffer: allocation-free.
const scratch = new DataView(new ArrayBuffer(8));
function mix(h: number, v: number): number {
  scratch.setFloat64(0, v);
  for (let i = 0; i < 8; i++) {
    h ^= scratch.getUint8(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Deterministic 32-bit fingerprint of the whole world state. */
export function hashWorld(world: SimWorld): number {
  let h = 0x811c9dc5;
  h = mix(h, world.tick);
  for (const c of world.cars) {
    h = mix(h, c.s); h = mix(h, c.x); h = mix(h, c.speed); h = mix(h, c.steer); h = mix(h, c.lap);
    h = mix(h, c.boostTime); h = mix(h, c.drift); h = mix(h, c.gear); h = mix(h, c.rpm);
    h = mix(h, c.shiftCut); h = mix(h, c.kick); h = mix(h, c.driftCharge); h = mix(h, c.hop); h = mix(h, c.prevButtons);
  }
  return h;
}
