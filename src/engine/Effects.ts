import { LOGICAL_HEIGHT, LOGICAL_WIDTH, PLAYER_CAR_BASE_Y } from '../constants.js';
import type { PlayerState, SpriteFrame } from '../types/engine.js';
import type { AtlasFrameMeta } from './AtlasManifest.js';
import type { RenderBackend } from './RenderBackend.js';

/**
 * Alpha-blended extras (Spec D §4): skid dust, exhaust flame on a gear change,
 * and speed streaks. These are the effects the 16-bit hardware could not do —
 * the SNES had no per-sprite alpha — which is exactly why they are the thing
 * that makes the picture read as "arcade" rather than "emulator".
 *
 * `effects.png` is the DROPPABLE atlas in Spec B's lifecycle split. Every path
 * through this module is a no-op when the atlas is absent, and the caller holds
 * a `null` until one arrives. Nothing here is load-bearing for the game loop.
 *
 * Allocation-free by contract (hard rule 4): the particle pool is fixed-size and
 * lives in parallel arrays allocated once at construction.
 */

/** Effect frame names, as they appear in `effects.json`. */
export const EFFECT_NAMES = ['dust', 'flame', 'streak'] as const;
export type EffectName = (typeof EFFECT_NAMES)[number];

/** Fixed pool size. Overflow recycles the oldest rather than growing. */
export const MAX_PARTICLES = 24;

/** Fraction of top speed at which streaks begin to appear. */
export const STREAK_SPEED_FRACTION = 0.6;

/** Number of streaks drawn down each side of the screen. */
const STREAK_COUNT = 6;

const DUST_LIFE = 0.45;   // seconds — long enough to trail, short enough to not smear
const FLAME_LIFE = 0.18;  // a shift bark, not a jet
const DUST_INTERVAL = 0.03;
const DUST_RISE = 26;     // px/sec the puff drifts up the screen as it ages
const DUST_SPREAD = 18;   // px of lateral scatter either side of the wheels

/** Loaded effect artwork: one image plus its animation frames per name. */
export interface EffectSet {
  image: CanvasImageSource;
  frames: Readonly<Record<string, readonly SpriteFrame[]>>;
}

/**
 * Resolve manifest frames into per-name animation strips, once, at load.
 *
 * Names absent from the atlas simply end up absent here — a truncated or
 * hand-edited `effects.json` costs the effect, never the frame.
 */
export function buildEffectSet(image: CanvasImageSource, metas: readonly AtlasFrameMeta[]): EffectSet {
  const byName: Record<string, SpriteFrame[]> = {};
  for (const m of metas) {
    (byName[m.car] ??= [])[m.step] = {
      x: m.x, y: m.y, w: m.w, h: m.h,
      anchorX: Math.floor(m.w / 2), anchorY: Math.floor(m.h / 2), // effects pivot centrally
    };
  }
  // Drop the holes a sparse or partial bake would leave, so the render path can
  // index without a per-draw existence check.
  for (const name of Object.keys(byName)) byName[name] = byName[name]!.filter(Boolean);
  return { image, frames: byName };
}

/**
 * Streak opacity for a given speed. Zero below the threshold and ramping from
 * there, because a hard on/off at the threshold pops every time the car crosses
 * it — which, at the threshold, is constantly.
 */
export function streakAlpha(speed: number, maxSpeed: number): number {
  if (!(maxSpeed > 0) || !Number.isFinite(maxSpeed)) return 0;
  const t = (speed / maxSpeed - STREAK_SPEED_FRACTION) / (1 - STREAK_SPEED_FRACTION);
  if (!(t > 0)) return 0; // also catches NaN
  return t > 1 ? 1 : t;
}

/** Particle opacity from its age. Linear: at these lifetimes nothing subtler reads. */
export function particleAlpha(age: number, life: number): number {
  if (!(life > 0)) return 0;
  const t = 1 - age / life;
  if (!(t > 0)) return 0; // also catches NaN
  return t > 1 ? 1 : t;
}

export class Effects {
  // Parallel arrays, allocated once. A pool of particle objects would allocate
  // on every spawn and hand the GC a per-frame job in the render loop.
  private readonly px = new Float64Array(MAX_PARTICLES);
  private readonly py = new Float64Array(MAX_PARTICLES);
  private readonly age = new Float64Array(MAX_PARTICLES);
  private readonly life = new Float64Array(MAX_PARTICLES);
  private readonly kind = new Uint8Array(MAX_PARTICLES); // 0 = dust, 1 = flame
  private count = 0;

  private lastGear = Number.NaN; // NaN so the first update never reads as a shift
  private dustCooldown = 0;
  private rng = 0x2545f491; // deterministic scatter; effects must not desync a replay

  /** Live particle count. Read by tests and by nothing in the render path. */
  get live(): number { return this.count; }

  /**
   * Advance the pool and spawn from the player's state.
   *
   * `dt` is defended rather than trusted: the fixed-timestep loop feeds a
   * constant, but a tab-restore or a debugger pause can still deliver a garbage
   * value, and a NaN written into the pool would persist for the whole session.
   */
  update(dt: number, player?: PlayerState): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;

    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] = this.age[i]! + step;
      this.py[i] = this.py[i]! - DUST_RISE * step * (this.kind[i] === 0 ? 1 : 0.4);
      if (this.age[i]! >= this.life[i]!) this.retire(i);
    }
    if (!player || step === 0) return;

    const gear = player.gear;
    if (Number.isFinite(gear) && Number.isFinite(this.lastGear) && gear !== this.lastGear) {
      this.spawn(1, LOGICAL_WIDTH / 2, PLAYER_CAR_BASE_Y - 4, FLAME_LIFE);
    }
    if (Number.isFinite(gear)) this.lastGear = gear;

    this.dustCooldown -= step;
    if (player.skidding && this.dustCooldown <= 0) {
      this.dustCooldown = DUST_INTERVAL;
      // One puff per wheel line, scattered, so a skid reads as a pair of trails
      // rather than a single plume centred on the car.
      for (const side of [-1, 1]) {
        const jitter = (this.next() - 0.5) * DUST_SPREAD;
        this.spawn(0, LOGICAL_WIDTH / 2 + side * 22 + jitter, PLAYER_CAR_BASE_Y - 2, DUST_LIFE);
      }
    }
  }

  /**
   * Draw the live pool plus the speed streaks. A `null` set means the atlas
   * never arrived: draw nothing, throw nothing.
   */
  render(backend: RenderBackend, set: EffectSet | null, player?: PlayerState, maxSpeed = 0): void {
    if (!set) return;

    for (let i = 0; i < this.count; i++) {
      const name: EffectName = this.kind[i] === 0 ? 'dust' : 'flame';
      const strip = set.frames[name];
      if (!strip || strip.length === 0) continue;
      const a = particleAlpha(this.age[i]!, this.life[i]!);
      if (a <= 0) continue;
      // Frame index walks the strip with age, so the shape animates while the
      // alpha fades — one baked strip covers both without a per-frame opacity set.
      const fi = Math.min(strip.length - 1, Math.floor((this.age[i]! / this.life[i]!) * strip.length));
      const f = strip[fi]!;
      backend.drawSprite(
        set.image, f.x, f.y, f.w, f.h,
        Math.round(this.px[i]! - f.anchorX), Math.round(this.py[i]! - f.anchorY),
        f.w, f.h, LOGICAL_HEIGHT, false, a,
      );
    }

    if (!player) return;
    const sa = streakAlpha(player.speed, maxSpeed);
    if (sa <= 0) return;
    const strip = set.frames['streak'];
    if (!strip || strip.length === 0) return;
    const f = strip[0]!;
    // Fixed screen positions down both edges: streaks are a camera effect, not
    // world geometry, so they must not shift with the car or the road.
    for (let i = 0; i < STREAK_COUNT; i++) {
      const y = LOGICAL_HEIGHT - ((i + 1) * LOGICAL_HEIGHT) / (STREAK_COUNT + 1);
      for (const side of [0, 1]) {
        const x = side === 0 ? 6 + (i % 3) * 5 : LOGICAL_WIDTH - 6 - f.w - (i % 3) * 5;
        // No flip: the streak is a symmetric bar, and asking for one would put
        // the draw on the backend's transform path for nothing.
        backend.drawSprite(set.image, f.x, f.y, f.w, f.h, x, Math.round(y), f.w, f.h,
          LOGICAL_HEIGHT, false, sa);
      }
    }
  }

  private spawn(kind: number, x: number, y: number, life: number): void {
    // A full pool recycles the most-expired slot. Refusing the spawn instead
    // would freeze the effect exactly when it is busiest, which is when it is
    // most visible. Retirement uses swap-with-last, so the arrays are NOT
    // age-ordered and the slot has to be found rather than assumed.
    const at = this.count < MAX_PARTICLES ? this.count++ : this.mostExpired();
    this.px[at] = x;
    this.py[at] = y;
    this.age[at] = 0;
    this.life[at] = life;
    this.kind[at] = kind;
  }

  private mostExpired(): number {
    let best = 0;
    let bestFrac = -1;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const frac = this.life[i]! > 0 ? this.age[i]! / this.life[i]! : Infinity;
      if (frac > bestFrac) { bestFrac = frac; best = i; }
    }
    return best;
  }

  /** Swap-with-last removal. Order is not load-bearing: everything is additive. */
  private retire(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.px[i] = this.px[last]!;
      this.py[i] = this.py[last]!;
      this.age[i] = this.age[last]!;
      this.life[i] = this.life[last]!;
      this.kind[i] = this.kind[last]!;
    }
  }

  /** xorshift32 — deterministic, allocation-free, and good enough for scatter. */
  private next(): number {
    let x = this.rng;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.rng = x;
    return x / 0x100000000;
  }
}
