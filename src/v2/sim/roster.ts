import type { Personality } from './ai.js';
import type { CarBuild } from './parts.js';
import { nextSeed } from './names.js';

/**
 * The driver roster (PRD section 7): eight original characters, a mix of
 * humans, robots, animals and one oddball. Each has an AI personality, a
 * default paint and car, and a portrait (view/hud/portraits.ts). Identity
 * comes through portrait, voice and paint; everyone drives the kit car.
 */
export type DriverKind = 'human' | 'robot' | 'animal' | 'oddball';

export interface Driver {
  readonly id: string;
  readonly name: string;
  readonly kind: DriverKind;
  readonly personality: Personality;
  /** Paint (palette hex), and a second choice if a player is already wearing it. */
  readonly paint: string;
  readonly altPaint: string;
  readonly car: Pick<CarBuild, 'body' | 'wheels' | 'engine' | 'spoiler' | 'exhaust'>;
}

// Personalities keep the balance field's spread (sim/field.ts) so any line-up races like the gated one.
export const ROSTER: readonly Driver[] = [
  {
    id: 'rosa', name: 'Rosa Rocket', kind: 'human', paint: '#e040c0', altPaint: '#9132a7',
    personality: { skill: 0.78, aggression: 0.7, itemUse: 0.6, mistakeRate: 0.8, driftSkill: 0.8, laneOffset: 0 },
    car: { body: 'body.wedge', wheels: 'wheels.slick', engine: 'engine.blower', spoiler: 'spoiler.wing', exhaust: 'exhaust.twin' },
  },
  {
    id: 'bolt', name: 'Bolt-7', kind: 'robot', paint: '#40e0e0', altPaint: '#5a8ae8',
    personality: { skill: 0.72, aggression: 0.3, itemUse: 0.4, mistakeRate: 1.0, driftSkill: 0.7, laneOffset: 1.2 },
    car: { body: 'body.roadster', wheels: 'wheels.stock', engine: 'engine.vents', spoiler: 'spoiler.tower', exhaust: 'exhaust.stack' },
  },
  {
    id: 'pip', name: 'Professor Pip', kind: 'human', paint: '#ffcc00', altPaint: '#fea263',
    personality: { skill: 0.66, aggression: 0.55, itemUse: 0.7, mistakeRate: 1.2, driftSkill: 0.6, laneOffset: -1.2 },
    car: { body: 'body.brick', wheels: 'wheels.stock', engine: 'engine.blower', spoiler: 'spoiler.lip', exhaust: 'exhaust.single' },
  },
  {
    id: 'shelly', name: 'Shelly', kind: 'animal', paint: '#58b85a', altPaint: '#3d9a4d',
    personality: { skill: 0.6, aggression: 0.2, itemUse: 0.5, mistakeRate: 1.4, driftSkill: 0.5, laneOffset: 0.6 },
    car: { body: 'body.brick', wheels: 'wheels.chunky', engine: 'engine.scoop', spoiler: 'spoiler.tower', exhaust: 'exhaust.twin' },
  },
  {
    id: 'moose', name: 'Maxi Moose', kind: 'animal', paint: '#9132a7', altPaint: '#c4432f',
    personality: { skill: 0.54, aggression: 0.8, itemUse: 0.8, mistakeRate: 1.6, driftSkill: 0.4, laneOffset: -0.6 },
    car: { body: 'body.brick', wheels: 'wheels.chunky', engine: 'engine.blower', spoiler: 'spoiler.wing', exhaust: 'exhaust.stack' },
  },
  {
    id: 'dusty', name: 'Dusty Dingo', kind: 'animal', paint: '#2a5ac0', altPaint: '#1a3a8a',
    personality: { skill: 0.51, aggression: 0.6, itemUse: 0.6, mistakeRate: 1.7, driftSkill: 0.45, laneOffset: 1.5 },
    car: { body: 'body.wedge', wheels: 'wheels.chunky', engine: 'engine.scoop', spoiler: 'spoiler.lip', exhaust: 'exhaust.single' },
  },
  {
    id: 'gizmo', name: 'Gizmo', kind: 'robot', paint: '#d8d8e8', altPaint: '#9a9ab0',
    personality: { skill: 0.48, aggression: 0.4, itemUse: 0.3, mistakeRate: 1.8, driftSkill: 0.3, laneOffset: 1.8 },
    car: { body: 'body.roadster', wheels: 'wheels.slick', engine: 'engine.scoop', spoiler: 'spoiler.lip', exhaust: 'exhaust.single' },
  },
  {
    id: 'pete', name: 'Pylon Pete', kind: 'oddball', paint: '#fea263', altPaint: '#f01985',
    personality: { skill: 0.42, aggression: 0.1, itemUse: 0.5, mistakeRate: 2.0, driftSkill: 0.2, laneOffset: -1.8 },
    car: { body: 'body.wedge', wheels: 'wheels.stock', engine: 'engine.vents', spoiler: 'spoiler.tower', exhaust: 'exhaust.stack' },
  },
];

export const DRIVER_BY_ID: ReadonlyMap<string, Driver> = new Map(ROSTER.map((d) => [d.id, d]));

/**
 * Pick `count` CPU drivers for a race or cup: the rival always, the rest from
 * the roster with a seeded few sitting out, in roster order (fastest first).
 */
export function lineUp(count: number, seed: number, rival?: string): Driver[] {
  const pool = [...ROSTER];
  const out = pool.filter((d) => d.id === rival);
  const rest = pool.filter((d) => d.id !== rival);
  let s = seed >>> 0 || 1;
  while (out.length + rest.length > count && rest.length) {
    s = nextSeed(s);
    rest.splice(s % rest.length, 1);
  }
  return ROSTER.filter((d) => out.includes(d) || rest.includes(d)).slice(0, count);
}
