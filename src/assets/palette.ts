/**
 * Master palette — the single source of truth for every gameplay-element colour.
 *
 * Shared with the Python bake scripts, which read `palette.json` directly, so the
 * engine and the offline renderers clamp to identical values.
 *
 * Scope boundary: this governs road, vehicles, props and UI — NOT the backdrop
 * plates. Each plate carries its own adaptive 48-colour palette from
 * `prep_backgrounds.py`; collapsing all three into one master would visibly
 * degrade art that already looks right. `sky.*` below is sampled *from* the
 * plates so gameplay elements sit correctly against them.
 */
import data from './palette.json' with { type: 'json' };

export type Palette = typeof data;
export const PALETTE: Palette = data;

/**
 * Hard ceiling on the CORE roles — the colours that composite in every single
 * frame. This is the research's "one film stock" discipline made mechanical.
 * Raising it is an art-direction decision, not a formality.
 */
export const CORE_MAX = 28;

/**
 * Soft ceiling on the whole stored library, including the variable roles
 * (`body` hues, per-stage `sky` ramps) that are never all on screen at once.
 * Raised deliberately, one spec at a time — Spec C takes it to 84 when it adds
 * the remaining six body hues.
 */
export const PALETTE_BUDGET = 52;

const CORE_ROLES = ['road', 'kerb', 'lane', 'outline', 'trunk', 'foliage', 'chrome', 'ui'] as const;

function countColors(v: unknown): number {
  if (typeof v === 'string') return 1;
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + countColors(x), 0);
  if (v && typeof v === 'object') return Object.values(v).reduce<number>((n, x) => n + countColors(x), 0);
  return 0;
}

/** Colour slots present in every frame. Budgeted against {@link CORE_MAX}. */
export function coreEntryCount(): number {
  return CORE_ROLES.reduce((n, role) => n + countColors(PALETTE[role]), 0);
}

/** Total stored colour slots. Budgeted against {@link PALETTE_BUDGET}. */
export function paletteEntryCount(): number {
  return countColors(PALETTE);
}
