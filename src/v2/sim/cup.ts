import type { ResultRow } from './race.js';

/**
 * Grand Prix cups: a run of races with a points table (PRD section 3).
 * Pure state; the shell shows it between races.
 */
export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1] as const;

export interface CupRound { track: string }
export interface CupDef {
  name: string;
  rounds: readonly CupRound[];
  /** Roster id of the cup's rival, who targets the player all cup long. */
  rival: string;
}

/**
 * The slice cup. Until more circuits land, it runs Sunset Beach four times;
 * the table, flow and podium are the real thing.
 */
export const SUNSET_CUP: CupDef = {
  name: 'Sunset Cup',
  rival: 'rosa',
  rounds: [{ track: 'sunset-beach' }, { track: 'sunset-beach' }, { track: 'sunset-beach' }, { track: 'sunset-beach' }],
};

export interface CupState {
  readonly def: CupDef;
  /** Races completed so far. */
  round: number;
  /** Points per car. */
  readonly points: number[];
  /** Each car's finishing position in every completed round. */
  readonly finishes: number[][];
}

export function createCup(def: CupDef, cars: number): CupState {
  return { def, round: 0, points: new Array<number>(cars).fill(0), finishes: Array.from({ length: cars }, () => []) };
}

export function pointsFor(position: number): number {
  return POINTS[position - 1] ?? 0;
}

/** Add a finished race to the table. */
export function recordRace(cup: CupState, rows: readonly ResultRow[]): void {
  if (cup.round >= cup.def.rounds.length) throw new Error('cup is already over');
  for (const r of rows) {
    cup.points[r.car] = cup.points[r.car]! + pointsFor(r.position);
    cup.finishes[r.car]!.push(r.position);
  }
  cup.round++;
}

export function cupOver(cup: CupState): boolean {
  return cup.round >= cup.def.rounds.length;
}

export interface Standing { car: number; points: number; place: number }

/** Table order: most points; ties go to the better finish in the latest round. */
export function standings(cup: CupState): Standing[] {
  const cars = cup.points.map((_, i) => i);
  const last = (c: number): number => cup.finishes[c]![cup.finishes[c]!.length - 1] ?? 99;
  cars.sort((a, b) => cup.points[b]! - cup.points[a]! || last(a) - last(b) || a - b);
  return cars.map((car, i) => ({ car, points: cup.points[car]!, place: i + 1 }));
}
