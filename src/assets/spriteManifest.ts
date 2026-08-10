import type { SpriteFrame } from '../types/engine.js';

export interface DrawOp { rx: number; ry: number; rw: number; rh: number; color: string; }
export interface SpriteEntry {
  name: string; w: number; h: number; anchorX: number; anchorY: number; ops: DrawOp[];
}

const billboard = (name: string, w: number, h: number, ops: DrawOp[]): SpriteEntry =>
  ({ name, w, h, anchorX: Math.floor(w / 2), anchorY: h, ops });

/**
 * HUD font palette (TX-1 header: magenta labels, cyan values, red timer digits,
 * gold stars). Canvas 2D has no cheap per-draw tint, so each colour is baked as
 * its own glyph set in the atlas — text stays one drawSprite per character.
 * `white` is the default and keeps the unsuffixed frame names.
 */
export const FONT_COLORS = {
  white: '#e8e8f0',
  magenta: '#e040c0',
  cyan: '#40e0e0',
  red: '#f03030',
  gold: '#ffcc00',
  blue: '#5070ff',
} as const;
export type FontColor = keyof typeof FONT_COLORS;

/** Frame name for a glyph in a given colour (white keeps the bare name). */
export function glyphFrameName(base: string, color: FontColor = 'white'): string {
  return color === 'white' ? base : `${base}_${color}`;
}

// 3×5 digit fonts as row bitmasks (bit 2..0 = left..right pixel per row).
const DIGIT_ROWS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111], '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111], '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001], '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111], '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111], '9': [0b111, 0b101, 0b111, 0b001, 0b111],
};
/** 7×7 star face for the "PASSED CARS" gauge, as row bitmasks (bit 6..0). */
const STAR_ROWS = [
  0b0001000,
  0b0011100,
  0b1111111,
  0b0111110,
  0b0011100,
  0b0110110,
  0b1100011,
];
const STAR_UNLIT = '#2a2a6a'; // dim slot on the deep-blue header

function starOps(hex: string): DrawOp[] {
  const ops: DrawOp[] = [];
  STAR_ROWS.forEach((mask, ry) => {
    for (let c = 0; c < 7; c++) if (mask & (0b1000000 >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: hex });
  });
  return ops;
}

/** Expand a row-bitmask face into 1×1 pixel ops in the given colour. */
function maskOps(rows: number[], hex: string): DrawOp[] {
  const ops: DrawOp[] = [];
  rows.forEach((mask, ry) => {
    for (let c = 0; c < 3; c++) if (mask & (0b100 >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: hex });
  });
  return ops;
}

function digitEntries(color: FontColor): SpriteEntry[] {
  const hex = FONT_COLORS[color];
  return Object.entries(DIGIT_ROWS).map(([d, rows]) => ({
    name: glyphFrameName(`digit_${d}`, color), w: 3, h: 5, anchorX: 1, anchorY: 2, ops: maskOps(rows, hex),
  }));
}

// 3×5 uppercase letter glyphs, same row-bitmask scheme as DIGIT_ROWS.
// Provisional face (M/N/W are compromised at 3px); retuned at the gate.
const LETTER_ROWS: Record<string, number[]> = {
  a: [0b010, 0b101, 0b111, 0b101, 0b101], b: [0b110, 0b101, 0b110, 0b101, 0b110],
  c: [0b011, 0b100, 0b100, 0b100, 0b011], d: [0b110, 0b101, 0b101, 0b101, 0b110],
  e: [0b111, 0b100, 0b110, 0b100, 0b111], f: [0b111, 0b100, 0b110, 0b100, 0b100],
  g: [0b011, 0b100, 0b101, 0b101, 0b011], h: [0b101, 0b101, 0b111, 0b101, 0b101],
  i: [0b111, 0b010, 0b010, 0b010, 0b111], j: [0b001, 0b001, 0b001, 0b101, 0b010],
  k: [0b101, 0b110, 0b100, 0b110, 0b101], l: [0b100, 0b100, 0b100, 0b100, 0b111],
  m: [0b101, 0b111, 0b111, 0b101, 0b101], n: [0b110, 0b101, 0b101, 0b101, 0b101],
  o: [0b111, 0b101, 0b101, 0b101, 0b111], p: [0b110, 0b101, 0b110, 0b100, 0b100],
  q: [0b111, 0b101, 0b101, 0b111, 0b001], r: [0b110, 0b101, 0b110, 0b101, 0b101],
  s: [0b011, 0b100, 0b010, 0b001, 0b110], t: [0b111, 0b010, 0b010, 0b010, 0b010],
  u: [0b101, 0b101, 0b101, 0b101, 0b111], v: [0b101, 0b101, 0b101, 0b101, 0b010],
  w: [0b101, 0b101, 0b111, 0b111, 0b101], x: [0b101, 0b101, 0b010, 0b101, 0b101],
  y: [0b101, 0b101, 0b010, 0b010, 0b010], z: [0b111, 0b001, 0b010, 0b100, 0b111],
};
function letterEntries(color: FontColor): SpriteEntry[] {
  const hex = FONT_COLORS[color];
  return Object.entries(LETTER_ROWS).map(([ch, rows]) => ({
    name: glyphFrameName(`glyph_${ch}`, color), w: 3, h: 5, anchorX: 1, anchorY: 2, ops: maskOps(rows, hex),
  }));
}

/** Punctuation shares the glyph cell; hand-placed rather than mask-driven. */
function punctuationEntries(color: FontColor): SpriteEntry[] {
  const hex = FONT_COLORS[color];
  return [
    { name: glyphFrameName('glyph_colon', color), w: 3, h: 5, anchorX: 1, anchorY: 2,
      ops: [{ rx: 1, ry: 1, rw: 1, rh: 1, color: hex }, { rx: 1, ry: 3, rw: 1, rh: 1, color: hex }] },
    { name: glyphFrameName('glyph_minus', color), w: 3, h: 5, anchorX: 1, anchorY: 2,
      ops: [{ rx: 0, ry: 2, rw: 3, rh: 1, color: hex }] },
  ];
}

/** Every glyph in every palette colour — one set per FONT_COLORS key. */
function fontEntries(): SpriteEntry[] {
  const out: SpriteEntry[] = [];
  for (const color of Object.keys(FONT_COLORS) as FontColor[]) {
    out.push(...digitEntries(color), ...letterEntries(color), ...punctuationEntries(color));
  }
  return out;
}

// Compact pixel-art. Palette is provisional; retuned at the visual gate.
export const SPRITE_MANIFEST: SpriteEntry[] = [
  billboard('tree', 16, 40, [
    { rx: 7, ry: 24, rw: 2, rh: 16, color: '#5a3a1a' },        // trunk
    { rx: 2, ry: 4, rw: 12, rh: 22, color: '#1e7a34' },        // canopy
    { rx: 4, ry: 0, rw: 8, rh: 8, color: '#2a9a44' },          // highlight
  ]),
  billboard('bush', 14, 12, [
    { rx: 0, ry: 4, rw: 14, rh: 8, color: '#1e7a34' },
    { rx: 3, ry: 0, rw: 8, rh: 6, color: '#2a9a44' },
  ]),
  billboard('rock', 12, 10, [
    { rx: 0, ry: 3, rw: 12, rh: 7, color: '#7a7a82' },
    { rx: 2, ry: 0, rw: 7, rh: 5, color: '#9a9aa2' },
  ]),
  billboard('sign', 14, 22, [
    { rx: 6, ry: 8, rw: 2, rh: 14, color: '#5a3a1a' },         // post
    { rx: 0, ry: 0, rw: 14, rh: 9, color: '#d0d0d8' },         // board
    { rx: 2, ry: 2, rw: 10, rh: 5, color: '#c04040' },         // legend
  ]),
  billboard('billboard', 28, 24, [
    { rx: 2, ry: 14, rw: 2, rh: 10, color: '#3a3a42' },
    { rx: 24, ry: 14, rw: 2, rh: 10, color: '#3a3a42' },
    { rx: 0, ry: 0, rw: 28, rh: 14, color: '#204a8a' },
    { rx: 3, ry: 3, rw: 22, rh: 8, color: '#f0c040' },
  ]),
  // Traffic cars — rear-view billboards, four liveries.
  ...(['#c83028', '#2860c8', '#28a848', '#d0a020'] as const).map((body, i) =>
    billboard(`car${i}`, 22, 14, [
      { rx: 1, ry: 6, rw: 20, rh: 7, color: '#101014' },       // shadow/underbody
      { rx: 2, ry: 2, rw: 18, rh: 6, color: body },            // body
      { rx: 5, ry: 3, rw: 12, rh: 3, color: '#101830' },       // window
      { rx: 1, ry: 11, rw: 4, rh: 3, color: '#202024' },       // wheels
      { rx: 17, ry: 11, rw: 4, rh: 3, color: '#202024' },
    ])),
  billboard('player', 34, 20, [
    { rx: 2, ry: 9, rw: 30, rh: 10, color: '#101014' },
    { rx: 3, ry: 3, rw: 28, rh: 8, color: '#e03028' },
    { rx: 9, ry: 4, rw: 16, rh: 4, color: '#101830' },
    { rx: 1, ry: 15, rw: 6, rh: 5, color: '#202024' },
    { rx: 27, ry: 15, rw: 6, rh: 5, color: '#202024' },
  ]),
  // HUD "PASSED CARS" gauge: one lit + one unlit star, identical geometry.
  { name: 'star_on', w: 7, h: 7, anchorX: 3, anchorY: 3, ops: starOps(FONT_COLORS.gold) },
  { name: 'star_off', w: 7, h: 7, anchorX: 3, anchorY: 3, ops: starOps(STAR_UNLIT) },
  // HUD bitmap font: digits 0–9, a–z, colon and minus as 3×5 pixel glyphs,
  // one full set per FONT_COLORS palette entry.
  ...fontEntries(),
];

export type { SpriteFrame };
