import type { Personality } from './ai.js';

/**
 * The default CPU field until the driver roster (v2-21) names them: a spread of
 * ability and temperament so every race has a leader, a pack and stragglers.
 */
export const DEFAULT_FIELD: readonly Personality[] = [
  { skill: 0.78, aggression: 0.7, itemUse: 0.6, mistakeRate: 0.8, driftSkill: 0.8, laneOffset: 0 },
  { skill: 0.72, aggression: 0.3, itemUse: 0.4, mistakeRate: 1.0, driftSkill: 0.7, laneOffset: 1.2 },
  { skill: 0.66, aggression: 0.55, itemUse: 0.7, mistakeRate: 1.2, driftSkill: 0.6, laneOffset: -1.2 },
  { skill: 0.6, aggression: 0.2, itemUse: 0.5, mistakeRate: 1.4, driftSkill: 0.5, laneOffset: 0.6 },
  { skill: 0.54, aggression: 0.8, itemUse: 0.8, mistakeRate: 1.6, driftSkill: 0.4, laneOffset: -0.6 },
  { skill: 0.48, aggression: 0.4, itemUse: 0.3, mistakeRate: 1.8, driftSkill: 0.3, laneOffset: 1.8 },
  { skill: 0.42, aggression: 0.1, itemUse: 0.5, mistakeRate: 2.0, driftSkill: 0.2, laneOffset: -1.8 },
];

/**
 * A stand-in for a typical player, used by the balance sims: decent lines,
 * some drifting, the odd mistake. Balance targets are stated against it.
 */
export const REFERENCE_PLAYER: Personality = { skill: 0.62, aggression: 0.3, itemUse: 0.5, mistakeRate: 1, driftSkill: 0.55, laneOffset: 0 };
