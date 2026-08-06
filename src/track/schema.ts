import type { BranchPoint, Segment } from '../types/engine.js';
import { SPRITE_MANIFEST } from '../assets/spriteManifest.js';

/** One scenery placement rule: put `name` at `offset` on every `every`-th
 * segment of the section (section-local index; default 1 = every segment). */
export interface TrackSpriteRule { name: string; offset: number; every?: number }

/** A run of `length` segments sharing the same curve/pitch deltas. */
export interface TrackSection { length: number; curve: number; pitch: number; sprites?: TrackSpriteRule[] }

/** The on-disk / on-wire track format (plan.md §10 Phase 6). The single source
 * every track flows through: hand-authored, generated, edited, imported, saved. */
export interface TrackFile {
  trackId: string;
  stageName: string;
  segmentLength: number;
  roadWidth: number;
  lanes: number;
  colors?: Record<string, string>;
  sections: TrackSection[];
  branchPoint?: BranchPoint | null; // absent/null = no fork (an ending)
}

export interface ParsedTrack { file: TrackFile; segments: Segment[]; totalSegments: number }
export type ParseResult = { ok: true; track: ParsedTrack } | { ok: false; errors: string[] };

const VALID_SPRITES: ReadonlySet<string> = new Set(SPRITE_MANIFEST.map((e) => e.name));
const TOP_KEYS = new Set(['trackId', 'stageName', 'segmentLength', 'roadWidth', 'lanes', 'colors', 'sections', 'branchPoint', '$schema']);
const SECTION_KEYS = new Set(['length', 'curve', 'pitch', 'sprites']);
const RULE_KEYS = new Set(['name', 'offset', 'every']);
const BRANCH_KEYS = new Set(['startSegment', 'splitDurationSegments', 'ways']);

/** Validate anything into a ParsedTrack, or every reason it isn't one.
 * Pure; collects all errors with path-style messages so a hand-author can fix
 * a file in one pass. The only trust boundary between data and the engine. */
export function parseTrackFile(input: string | unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`invalid JSON: ${(e as Error).message}`] };
    }
  }
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['expected an object'] };
  }
  const t = raw as Record<string, unknown>;

  for (const k of Object.keys(t)) if (!TOP_KEYS.has(k)) errors.push(`${k}: unknown key`);

  const str = (k: string): string | undefined => {
    const v = t[k];
    if (typeof v !== 'string' || v.trim().length === 0) { errors.push(`${k}: expected non-empty string`); return undefined; }
    return v;
  };
  const num = (k: string): number | undefined => {
    const v = t[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) { errors.push(`${k}: expected positive finite number`); return undefined; }
    return v;
  };

  const trackId = str('trackId');
  if (trackId !== undefined && !/^[a-z0-9-]+$/.test(trackId)) errors.push('trackId: expected [a-z0-9-]+');
  str('stageName');
  num('segmentLength');
  num('roadWidth');
  const lanes = t['lanes'];
  if (typeof lanes !== 'number' || !Number.isInteger(lanes) || lanes < 1) errors.push('lanes: expected integer >= 1');
  if (t['colors'] !== undefined) {
    const c = t['colors'];
    if (typeof c !== 'object' || c === null || Array.isArray(c)) errors.push('colors: expected an object');
    else for (const [k, v] of Object.entries(c)) if (typeof v !== 'string') errors.push(`colors.${k}: expected string`);
  }

  const sections = t['sections'];
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push('sections: expected non-empty array');
  } else {
    sections.forEach((s: unknown, i: number) => {
      const at = `sections[${i}]`;
      if (typeof s !== 'object' || s === null || Array.isArray(s)) { errors.push(`${at}: expected an object`); return; }
      const sec = s as Record<string, unknown>;
      for (const k of Object.keys(sec)) if (!SECTION_KEYS.has(k)) errors.push(`${at}.${k}: unknown key`);
      const len = sec['length'];
      if (typeof len !== 'number' || !Number.isInteger(len) || len < 1) errors.push(`${at}.length: expected integer >= 1`);
      for (const k of ['curve', 'pitch'] as const) {
        const v = sec[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${at}.${k}: expected finite number`);
      }
      const rules = sec['sprites'];
      if (rules !== undefined) {
        if (!Array.isArray(rules)) { errors.push(`${at}.sprites: expected array`); return; }
        rules.forEach((r: unknown, j: number) => {
          const rat = `${at}.sprites[${j}]`;
          if (typeof r !== 'object' || r === null) { errors.push(`${rat}: expected an object`); return; }
          const rule = r as Record<string, unknown>;
          for (const k of Object.keys(rule)) if (!RULE_KEYS.has(k)) errors.push(`${rat}.${k}: unknown key`);
          const name = rule['name'];
          if (typeof name !== 'string' || !VALID_SPRITES.has(name)) errors.push(`${rat}.name: unknown sprite "${String(name)}"`);
          const off = rule['offset'];
          if (typeof off !== 'number' || !Number.isFinite(off)) errors.push(`${rat}.offset: expected finite number`);
          const every = rule['every'];
          if (every !== undefined && (typeof every !== 'number' || !Number.isInteger(every) || every < 1)) {
            errors.push(`${rat}.every: expected integer >= 1`);
          }
        });
      }
    });
  }

  const bp = t['branchPoint'];
  if (bp !== undefined && bp !== null) {
    if (typeof bp !== 'object' || Array.isArray(bp)) {
      errors.push('branchPoint: expected an object or null');
    } else {
      const b = bp as Record<string, unknown>;
      for (const k of Object.keys(b)) if (!BRANCH_KEYS.has(k)) errors.push(`branchPoint.${k}: unknown key`);
      const start = b['startSegment'];
      if (typeof start !== 'number' || !Number.isInteger(start) || start < 0) errors.push('branchPoint.startSegment: expected integer >= 0');
      const dur = b['splitDurationSegments'];
      if (typeof dur !== 'number' || !Number.isInteger(dur) || dur < 1) errors.push('branchPoint.splitDurationSegments: expected integer >= 1');
      const ways = b['ways'];
      if (ways !== 2 && ways !== 3) errors.push('branchPoint.ways: expected 2 or 3');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const clean = { ...t };
  delete clean['$schema']; // tolerated on input, never carried into exports/saves
  const file = clean as unknown as TrackFile;
  const segments = expandSections(file);
  return { ok: true, track: { file, segments, totalSegments: segments.length } };
}

/** Run-length sections → the flat Segment[] the engine consumes. */
export function expandSections(file: TrackFile): Segment[] {
  const segments: Segment[] = [];
  for (const sec of file.sections) {
    for (let i = 0; i < sec.length; i++) {
      const index = segments.length;
      const sprites = [];
      if (sec.sprites) {
        for (const rule of sec.sprites) {
          if (i % (rule.every ?? 1) === 0) sprites.push({ name: rule.name, offset: rule.offset });
        }
      }
      segments.push({ index, z: index * file.segmentLength, curve: sec.curve, pitch: sec.pitch, sprites });
    }
  }
  return segments;
}

/** Stable 2-space JSON for export and SaveBackend storage. */
export function formatTrackFile(file: TrackFile): string {
  return JSON.stringify(file, null, 2);
}
