import { describe, it, expect } from 'vitest';
import { ROSTER, lineUp } from './roster.js';
import { buildStats } from './parts.js';
import { generateName, isGeneratedName, NAME_FIRST, NAME_SECOND } from './names.js';
import { SUNSET_CUP } from './cup.js';
import { buildSimTrack } from './track.js';
import { buildRacingLine } from './racingLine.js';
import { createSession, stepSession } from './session.js';
import { createCpuDriver, driveCpu } from './ai.js';
import { createWorld } from './world.js';
import { RACE } from './race.js';
import { DEFAULT_FIELD, REFERENCE_PLAYER } from './field.js';
import { parseTrackFile } from '../track/schema.js';
import sunset from '../track/circuits/sunset-beach.json';

describe('driver roster', () => {
  it('has eight distinct drivers: humans, robots, animals and one oddball', () => {
    expect(ROSTER).toHaveLength(8);
    expect(new Set(ROSTER.map((d) => d.id)).size).toBe(8);
    expect(new Set(ROSTER.map((d) => d.paint)).size).toBe(8);
    const kinds = ROSTER.map((d) => d.kind);
    for (const k of ['human', 'robot', 'animal'] as const) expect(kinds.filter((x) => x === k).length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((x) => x === 'oddball')).toHaveLength(1);
  });

  it('gives everyone a personality in range and a buildable car', () => {
    for (const d of ROSTER) {
      expect(d.personality.skill).toBeGreaterThan(0);
      expect(d.personality.skill).toBeLessThanOrEqual(1);
      expect(() => buildStats(d.car)).not.toThrow();
      expect(d.altPaint).not.toBe(d.paint);
    }
  });

  it('the cup rival is on the roster', () => {
    expect(ROSTER.some((d) => d.id === SUNSET_CUP.rival)).toBe(true);
  });

  it('picks seeded line-ups that always include the rival', () => {
    for (let seed = 1; seed < 40; seed++) {
      const seven = lineUp(7, seed, 'rosa');
      expect(seven).toHaveLength(7);
      expect(seven.map((d) => d.id)).toContain('rosa');
      expect(new Set(seven).size).toBe(7);
      expect(lineUp(7, seed, 'rosa')).toEqual(seven);
      expect(lineUp(6, seed, 'rosa')).toHaveLength(6);
    }
    const sitOut = new Set(Array.from({ length: 40 }, (_, s) => ROSTER.find((d) => !lineUp(7, s + 1, 'rosa').includes(d))!.id));
    expect(sitOut.size).toBeGreaterThan(3); // variety across races
    expect(sitOut.has('rosa')).toBe(false);
  });
});

describe('generated player names', () => {
  it('are two words from the curated lists, deterministic per seed', () => {
    for (let s = 0; s < 500; s++) {
      const n = generateName(s);
      expect(isGeneratedName(n), n).toBe(true);
      expect(generateName(s)).toBe(n);
    }
    expect(new Set(Array.from({ length: 500 }, (_, s) => generateName(s))).size).toBeGreaterThan(100);
  });

  it('reject anything that is not a generated name', () => {
    expect(isGeneratedName('Speedy Comet')).toBe(true);
    for (const bad of ['', 'Speedy', 'Speedy Comet Extra', 'speedy comet', 'Hello World', 'Speedy  Comet']) expect(isGeneratedName(bad)).toBe(false);
  });

  it('word lists are short, capitalised, letters only', () => {
    for (const w of [...NAME_FIRST, ...NAME_SECOND]) expect(w).toMatch(/^[A-Z][a-z]{2,8}$/);
  });
});

describe('the rival targets the player', () => {
  const circuit = parseTrackFile(sunset);
  const track = buildSimTrack(circuit.def);
  const line = buildRacingLine(track, circuit.layout.racingLine);
  const PLAYER = DEFAULT_FIELD.length;

  const NEAR_M = 30;
  /** Share of the race car 0 spends within NEAR_M metres of the player bot. */
  function nearShare(seed: number, rival: boolean): number {
    const s = createSession({
      track, grid: circuit.layout.grid, line, field: [...DEFAULT_FIELD, null], seed,
      itemRows: circuit.layout.itemBoxes, coins: circuit.layout.coins, ...(rival ? { rival: { car: 0, of: PLAYER } } : {}),
    });
    const bot = createCpuDriver(REFERENCE_PLAYER, seed * 31337);
    const sector = track.length / RACE.checkpoints;
    const dist = (c: number) => s.race.racers[c]!.progress * sector + (s.world.cars[c]!.s - s.race.racers[c]!.sector * sector);
    let sum = 0, n = 0;
    for (let t = 0; t < 60 * 400 && s.race.phase !== 'finished'; t++) {
      driveCpu(s.world, PLAYER, bot, line, track, s.race.items, s.inputs[PLAYER]!);
      stepSession(s);
      if (s.race.phase === 'racing' && t % 60 === 0) { sum += Math.abs(dist(0) - dist(PLAYER)) < NEAR_M ? 1 : 0; n++; }
    }
    return sum / n;
  }

  it('shadows the player: close by for much more of the race than the same driver without a grudge', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const withRival = mean(seeds.map((sd) => nearShare(sd, true)));
    const plain = mean(seeds.map((sd) => nearShare(sd, false)));
    console.info(`[rival] share of race within ${NEAR_M} m of the player: rival ${(withRival * 100).toFixed(0)}%, plain ${(plain * 100).toFixed(0)}%`);
    expect(withRival).toBeGreaterThan(plain * 1.3);
    expect(withRival).toBeGreaterThan(0.5);
  });

  it('blocks: a rival covers its player even with a gentle personality', () => {
    const d = createCpuDriver({ ...REFERENCE_PLAYER, aggression: 0 }, 1);
    d.rivalOf = 1;
    const w = createWorld(2);
    const straight = buildSimTrack({ name: 's', halfWidth: 9, sections: [{ length: 2000, curvature: 0 }] });
    const l = buildRacingLine(straight);
    w.cars[0]!.s = 500; w.cars[0]!.speed = 30; w.cars[0]!.x = 0;
    w.cars[1]!.s = 490; w.cars[1]!.speed = 34; w.cars[1]!.x = 4;
    const out = { steer: 0, buttons: 0 };
    for (let t = 0; t < 30; t++) driveCpu(w, 0, d, l, straight, null, out);
    expect(d.tactic).toBeGreaterThan(1); // slid across toward the player's line
  });
});
