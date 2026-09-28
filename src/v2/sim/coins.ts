import { arcDelta, halfWidthAt, wrapS, type SimTrack } from './track.js';
import type { SimWorld } from './world.js';

/**
 * Coins (PRD section 4): lines of coins on the tarmac. Each one held adds a
 * little top speed, capped at COINS.max, Mario Kart-style; a spin-out drops a
 * few. Every coin picked up also counts toward the race's credits.
 */
export const COINS = {
  max: 10,
  /** Top-speed gain per coin held (so +2.5% at the cap). */
  speedPerCoin: 0.0025,
  reach: 1.4,
  respawn: 12,
  /** Coins dropped when a car spins out. */
  lostOnSpin: 3,
} as const;

/** A row of coins down the track, as the track file authors it. */
export interface CoinLine { s: number; x: number; count: number; spacing: number }

export interface CoinState {
  readonly s: Float64Array;
  readonly x: Float64Array;
  /** Seconds until each coin is back (0 = on the track). */
  readonly respawn: Float64Array;
  /** Per car: coins held now (0..max) and picked up this race (for credits). */
  readonly held: Uint8Array;
  readonly collected: Uint16Array;
  /** Per car: top speed with no coins, so the buff never compounds. */
  readonly baseTop: Float64Array;
  readonly wasSpinning: Uint8Array;
}

export function createCoins(track: SimTrack, lines: readonly CoinLine[], world: SimWorld): CoinState {
  const s: number[] = [], x: number[] = [];
  for (const line of lines) {
    for (let k = 0; k < line.count; k++) {
      const at = wrapS(track, line.s + k * line.spacing);
      const hw = halfWidthAt(track, at) - 0.5;
      s.push(at);
      x.push(Math.max(-hw, Math.min(hw, line.x)));
    }
  }
  const n = world.cars.length;
  return {
    s: Float64Array.from(s), x: Float64Array.from(x), respawn: new Float64Array(s.length),
    held: new Uint8Array(n), collected: new Uint16Array(n),
    baseTop: Float64Array.from(world.params, (p) => p.topSpeed), wasSpinning: new Uint8Array(n),
  };
}

/** Top speed with `coins` held. */
export function coinTopSpeed(base: number, coins: number): number {
  return base * (1 + COINS.speedPerCoin * Math.min(COINS.max, coins));
}

/** One tick: pick-ups, respawns, spin-out losses, and the speed buff. `spin` = per-car spin-out seconds. */
export function stepCoins(st: CoinState, world: SimWorld, track: SimTrack, spin: ArrayLike<number>, dt: number): void {
  for (let c = 0; c < st.s.length; c++) {
    if (st.respawn[c]! > 0) {
      st.respawn[c] = Math.max(0, st.respawn[c]! - dt);
      continue;
    }
    for (let i = 0; i < world.cars.length; i++) {
      const car = world.cars[i]!;
      if (Math.abs(arcDelta(track, car.s, st.s[c]!)) < COINS.reach && Math.abs(car.x - st.x[c]!) < COINS.reach) {
        st.respawn[c] = COINS.respawn;
        st.collected[i] = st.collected[i]! + 1;
        if (st.held[i]! < COINS.max) st.held[i] = st.held[i]! + 1;
        break;
      }
    }
  }
  for (let i = 0; i < world.cars.length; i++) {
    const spinning = spin[i]! > 0 ? 1 : 0;
    if (spinning && !st.wasSpinning[i]) st.held[i] = Math.max(0, st.held[i]! - COINS.lostOnSpin);
    st.wasSpinning[i] = spinning;
    world.params[i]!.topSpeed = coinTopSpeed(st.baseTop[i]!, st.held[i]!);
  }
}
