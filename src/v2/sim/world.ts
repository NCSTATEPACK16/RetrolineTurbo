import { Button, STEER_MAX, held, type InputFrame } from './input.js';
import { curvatureAt, type SimTrack } from './track.js';

/** Fixed simulation step: 60Hz. */
export const DT = 1 / 60;

/**
 * Tracer-bullet car constants (metres, seconds). The full six-stat driving
 * model replaces these in issue v2-07; they exist so the skeleton drives.
 */
export const CAR = {
  topSpeed: 42, // m/s (~150 km/h)
  accel: 14, // m/s^2 at standstill, tapering to 0 at top speed
  brake: 30,
  coastDrag: 3,
  steerRate: 4, // steer units/s the wheel travels toward the input
  lateralSpeed: 9, // m/s of sideways travel at full lock and speed
  centrifugal: 0.55, // outward push per unit curvature x speed^2
  offroadDrag: 18, // extra m/s^2 of decel off the tarmac
  offroadMargin: 6, // metres of verge beyond the road edge
} as const;

export interface CarState {
  /** Arc length along the centreline, in [0, track.length). */
  s: number;
  /** Lateral offset from the centreline in metres; + is right. */
  x: number;
  /** Forward speed in m/s. */
  speed: number;
  /** Smoothed steering position, -1..1. */
  steer: number;
  lap: number;
}

export interface SimWorld {
  tick: number;
  readonly cars: CarState[];
}

export function createWorld(carCount = 1): SimWorld {
  const cars: CarState[] = [];
  for (let i = 0; i < carCount; i++) cars.push({ s: 0, x: 0, speed: 0, steer: 0, lap: 0 });
  return { tick: 0, cars };
}

/** Copy `src` into `dst` in place — used to keep the previous snapshot for interpolation without allocating. */
export function copyWorld(dst: SimWorld, src: SimWorld): void {
  dst.tick = src.tick;
  for (let i = 0; i < src.cars.length; i++) {
    const a = dst.cars[i]!;
    const b = src.cars[i]!;
    a.s = b.s; a.x = b.x; a.speed = b.speed; a.steer = b.steer; a.lap = b.lap;
  }
}

function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return v + maxDelta > target ? target : v + maxDelta;
  return v - maxDelta < target ? target : v - maxDelta;
}

function stepCar(car: CarState, input: InputFrame, track: SimTrack): void {
  // Longitudinal.
  const offroad = car.x > track.halfWidth || car.x < -track.halfWidth;
  let a = 0;
  if (held(input, Button.Throttle)) a += CAR.accel * (1 - car.speed / CAR.topSpeed);
  if (held(input, Button.Brake)) a -= CAR.brake;
  if (!held(input, Button.Throttle)) a -= CAR.coastDrag;
  if (offroad) a -= CAR.offroadDrag * (car.speed / CAR.topSpeed);
  car.speed += a * DT;
  if (car.speed < 0) car.speed = 0;

  // Lateral: steering moves you across the road, curves push you outward.
  car.steer = approach(car.steer, input.steer / STEER_MAX, CAR.steerRate * DT);
  const grip = car.speed < 8 ? car.speed / 8 : 1;
  const k = curvatureAt(track, car.s);
  car.x += (car.steer * CAR.lateralSpeed * grip - k * car.speed * car.speed * CAR.centrifugal) * DT;
  const edge = track.halfWidth + CAR.offroadMargin;
  if (car.x > edge) car.x = edge;
  else if (car.x < -edge) car.x = -edge;

  // Advance and wrap.
  car.s += car.speed * DT;
  if (car.s >= track.length) {
    car.s -= track.length;
    car.lap++;
  }
}

/** Advance the world one fixed step. Car 0 is driven by `input`; others idle until the AI lands. */
export function stepWorld(world: SimWorld, track: SimTrack, input: InputFrame, idle: InputFrame): void {
  for (let i = 0; i < world.cars.length; i++) stepCar(world.cars[i]!, i === 0 ? input : idle, track);
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
  }
  return h;
}
