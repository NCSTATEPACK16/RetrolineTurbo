import type { TrackDef, TrackSection } from '../sim/track.js';

/**
 * Track file format v2 — the single source of truth for a circuit (hard rule 3).
 * Authored in friendly units (degrees of turn, metres of rise); `parseTrackFile`
 * validates it and derives the sim's curvature-based {@link TrackDef} plus the
 * {@link CircuitLayout} that races, items, coins and scenery read.
 */
export interface TrackFileSection {
  /** Arc length in metres. */
  length: number;
  /** Signed heading change across the section in degrees; + turns right. */
  turn: number;
  /** Elevation change across the section in metres (eased, never a kink). */
  rise?: number;
  /** Override the road half-width from this section on (blended in over 30 m). */
  halfWidth?: number;
}

export interface GridSpec {
  rows: number;
  columns: number;
  /** Metres between rows. */
  rowGap: number;
  /** Metres between columns. */
  columnGap: number;
  /** Extra metres each odd column sits back (a staggered grid). */
  stagger?: number;
}

export interface ItemBoxRow { s: number; count: number }
export interface CoinLine { s: number; x: number; count: number; spacing: number }
export interface SceneryRun {
  sprite: string;
  side: 'left' | 'right' | 'both';
  from: number;
  to: number;
  every: number;
  /** Metres beyond the road edge. */
  offset: number;
}
export interface RacingLinePoint { s: number; x: number }

export interface TrackFileV2 {
  version: 2;
  name: string;
  theme: string;
  halfWidth: number;
  sections: TrackFileSection[];
  grid: GridSpec;
  itemBoxes: ItemBoxRow[];
  coins: CoinLine[];
  scenery: SceneryRun[];
  /** Optional hand-authored racing line; generated from geometry when absent. */
  racingLine?: RacingLinePoint[];
}

export interface CircuitLayout {
  readonly theme: string;
  readonly grid: GridSpec;
  readonly itemBoxes: readonly ItemBoxRow[];
  readonly coins: readonly CoinLine[];
  readonly scenery: readonly SceneryRun[];
  readonly racingLine: readonly RacingLinePoint[] | null;
}

export interface Circuit {
  readonly def: TrackDef;
  readonly layout: CircuitLayout;
}

export class TrackFileError extends Error {
  constructor(track: string, path: string, message: string) {
    super(`track "${track}": ${path} ${message}`);
    this.name = 'TrackFileError';
  }
}

/** Loop closure tolerance: authored circuits must meet themselves within this many metres. */
export const CLOSURE_TOLERANCE_M = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** End-point gap of the loop (metres), by the same midpoint integration the view uses. */
export function closureGap(sections: readonly TrackFileSection[]): number {
  let x = 0, z = 0, h = 0;
  for (const sec of sections) {
    const k = (sec.turn * Math.PI) / 180 / sec.length;
    const n = Math.ceil(sec.length);
    const d = sec.length / n;
    for (let i = 0; i < n; i++) {
      const hm = h + k * d * 0.5;
      x += Math.sin(hm) * d;
      z -= Math.cos(hm) * d;
      h += k * d;
    }
  }
  return Math.hypot(x, z);
}

export function parseTrackFile(json: unknown): Circuit {
  const name = isObj(json) && typeof json.name === 'string' && json.name ? json.name : '?';
  const fail = (path: string, msg: string): never => {
    throw new TrackFileError(name, path, msg);
  };
  if (!isObj(json)) return fail('', 'is not an object');
  if (json.version !== 2) fail('version', 'must be 2');
  if (name === '?') fail('name', 'must be a non-empty string');
  if (typeof json.theme !== 'string' || !json.theme) fail('theme', 'must be a non-empty string');
  const halfWidth = json.halfWidth;
  if (!finite(halfWidth) || halfWidth < 4 || halfWidth > 20) return fail('halfWidth', 'must be 4..20 m');

  if (!Array.isArray(json.sections) || json.sections.length === 0) return fail('sections', 'must be a non-empty array');
  const sections: TrackFileSection[] = json.sections.map((raw: unknown, i: number): TrackFileSection => {
    const at = `sections[${i}]`;
    if (!isObj(raw)) return fail(at, 'must be an object');
    if (!finite(raw.length) || raw.length <= 0) fail(`${at}.length`, 'must be > 0');
    if (!finite(raw.turn) || Math.abs(raw.turn) > 270) fail(`${at}.turn`, 'must be within ±270 degrees');
    if (raw.rise !== undefined && !finite(raw.rise)) fail(`${at}.rise`, 'must be a number');
    if (raw.halfWidth !== undefined && (!finite(raw.halfWidth) || raw.halfWidth < 4 || raw.halfWidth > 20)) {
      fail(`${at}.halfWidth`, 'must be 4..20 m');
    }
    const sec: TrackFileSection = { length: raw.length as number, turn: raw.turn as number };
    if (raw.rise !== undefined) sec.rise = raw.rise as number;
    if (raw.halfWidth !== undefined) sec.halfWidth = raw.halfWidth as number;
    return sec;
  });

  const turn = sections.reduce((a, s) => a + s.turn, 0);
  if (Math.abs(Math.abs(turn) - 360) > 0.01) fail('sections', `turns sum to ${turn.toFixed(2)} degrees; a circuit must total ±360`);
  const rise = sections.reduce((a, s) => a + (s.rise ?? 0), 0);
  if (Math.abs(rise) > 0.01) fail('sections', `rises sum to ${rise.toFixed(2)} m; a circuit must return to its start height`);
  const gap = closureGap(sections);
  if (gap > CLOSURE_TOLERANCE_M) fail('sections', `loop does not close (end is ${gap.toFixed(2)} m from the start)`);

  const length = sections.reduce((a, s) => a + s.length, 0);
  const inLap = (v: unknown): boolean => finite(v) && v >= 0 && v < length;
  const maxHalf = Math.max(halfWidth, ...sections.map((s) => s.halfWidth ?? 0));

  const g = json.grid;
  if (!isObj(g)) return fail('grid', 'must be an object');
  for (const k of ['rows', 'columns'] as const) if (!Number.isInteger(g[k]) || (g[k] as number) < 1) fail(`grid.${k}`, 'must be a positive integer');
  for (const k of ['rowGap', 'columnGap'] as const) if (!finite(g[k]) || (g[k] as number) <= 0) fail(`grid.${k}`, 'must be > 0');
  if (g.stagger !== undefined && (!finite(g.stagger) || g.stagger < 0)) fail('grid.stagger', 'must be >= 0');
  const grid = g as unknown as GridSpec;
  if (grid.rows * grid.columns < 8) fail('grid', 'must hold at least 8 cars');
  if (((grid.columns - 1) * grid.columnGap) / 2 > halfWidth - 1) fail('grid', 'is wider than the road');

  const list = <T>(key: string, check: (v: Record<string, unknown>, at: string) => void): T[] => {
    const arr = json[key];
    if (!Array.isArray(arr)) return fail(key, 'must be an array');
    arr.forEach((v: unknown, i: number) => {
      if (!isObj(v)) fail(`${key}[${i}]`, 'must be an object');
      else check(v, `${key}[${i}]`);
    });
    return arr as T[];
  };
  const itemBoxes = list<ItemBoxRow>('itemBoxes', (v, at) => {
    if (!inLap(v.s)) fail(`${at}.s`, `must be within the lap (0..${length.toFixed(0)})`);
    if (!Number.isInteger(v.count) || (v.count as number) < 1 || (v.count as number) > 6) fail(`${at}.count`, 'must be 1..6');
  });
  const coins = list<CoinLine>('coins', (v, at) => {
    if (!inLap(v.s)) fail(`${at}.s`, `must be within the lap (0..${length.toFixed(0)})`);
    if (!finite(v.x) || Math.abs(v.x) > maxHalf) fail(`${at}.x`, 'must be on the road');
    if (!Number.isInteger(v.count) || (v.count as number) < 1) fail(`${at}.count`, 'must be a positive integer');
    if (!finite(v.spacing) || (v.spacing as number) <= 0) fail(`${at}.spacing`, 'must be > 0');
  });
  const scenery = list<SceneryRun>('scenery', (v, at) => {
    if (typeof v.sprite !== 'string' || !v.sprite) fail(`${at}.sprite`, 'must be a non-empty string');
    if (v.side !== 'left' && v.side !== 'right' && v.side !== 'both') fail(`${at}.side`, 'must be left, right or both');
    if (!inLap(v.from)) fail(`${at}.from`, 'must be within the lap');
    if (!finite(v.to) || (v.to as number) <= (v.from as number) || (v.to as number) > length) fail(`${at}.to`, 'must be after from and within the lap');
    if (!finite(v.every) || (v.every as number) <= 0) fail(`${at}.every`, 'must be > 0');
    if (!finite(v.offset) || (v.offset as number) < 0) fail(`${at}.offset`, 'must be >= 0');
  });
  let racingLine: RacingLinePoint[] | null = null;
  if (json.racingLine !== undefined) {
    racingLine = list<RacingLinePoint>('racingLine', (v, at) => {
      if (!inLap(v.s)) fail(`${at}.s`, 'must be within the lap');
      if (!finite(v.x) || Math.abs(v.x) > maxHalf) fail(`${at}.x`, 'must be on the road');
    });
  }

  const simSections: TrackSection[] = sections.map((s) => {
    const out: { length: number; curvature: number; rise: number; halfWidth?: number } = {
      length: s.length,
      curvature: (s.turn * Math.PI) / 180 / s.length,
      rise: s.rise ?? 0,
    };
    if (s.halfWidth !== undefined) out.halfWidth = s.halfWidth;
    return out;
  });
  return {
    def: { name, halfWidth, sections: simSections },
    layout: { theme: json.theme as string, grid, itemBoxes, coins, scenery, racingLine },
  };
}
