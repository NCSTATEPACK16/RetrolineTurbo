import { createCpuDriver, driveCpu, type Personality } from './ai.js';
import { createSession, stepSession, type SessionConfig } from './session.js';
import { results, type ResultRow } from './race.js';
import { DEFAULT_STATS, statsToParams, type CarStats } from './car.js';
import { buildStats, STARTER_BUILD } from './parts.js';

/**
 * Headless full-race runner for balance work: a reference bot stands in for
 * the human (in the starter car) (it drives through the same controller as a CPU but counts as the
 * player for rubber-banding), everyone else is the configured field.
 */
export interface SimRaceResult {
  playerPosition: number;
  results: ResultRow[];
  /** Highest speed any CPU reached as a fraction of its own boosted top speed. */
  maxCpuSpeedRatio: number;
  ticks: number;
}

export function simulateRace(
  cfg: Omit<SessionConfig, 'field'>, field: readonly Personality[], player: Personality, maxSeconds = 600,
  playerStats: CarStats = buildStats(STARTER_BUILD),
): SimRaceResult {
  // CPUs drive stock cars; the player bot drives the starter build, as a new player would.
  const params = cfg.params ?? [...field.map(() => statsToParams(DEFAULT_STATS)), statsToParams(playerStats)];
  const session = createSession({ ...cfg, params, field: [...field, null] });
  const playerIndex = field.length;
  const bot = createCpuDriver(player, ((cfg.seed ?? 1) * 31337) >>> 0);
  const { world, race } = session;
  let maxRatio = 0;
  let ticks = 0;
  for (; ticks < maxSeconds * 60 && race.phase !== 'finished'; ticks++) {
    driveCpu(world, playerIndex, bot, cfg.line, cfg.track, race.items, session.inputs[playerIndex]!);
    stepSession(session);
    for (let i = 0; i < field.length; i++) {
      const cap = world.params[i]!.topSpeed * world.tuning.boostSpeed;
      const r = world.cars[i]!.speed / cap;
      if (r > maxRatio) maxRatio = r;
    }
  }
  return { playerPosition: race.racers[playerIndex]!.position, results: results(race), maxCpuSpeedRatio: maxRatio, ticks };
}
