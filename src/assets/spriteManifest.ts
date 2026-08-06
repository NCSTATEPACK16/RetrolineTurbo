import type { SpriteFrame } from '../types/engine.js';

export interface DrawOp { rx: number; ry: number; rw: number; rh: number; color: string; }
export interface SpriteEntry {
  name: string; w: number; h: number; anchorX: number; anchorY: number; ops: DrawOp[];
}

const billboard = (name: string, w: number, h: number, ops: DrawOp[]): SpriteEntry =>
  ({ name, w, h, anchorX: Math.floor(w / 2), anchorY: h, ops });

// 3×5 digit fonts as row bitmasks (bit 2..0 = left..right pixel per row).
const DIGIT_ROWS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111], '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111], '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001], '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111], '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111], '9': [0b111, 0b101, 0b111, 0b001, 0b111],
};
function digitEntries(): SpriteEntry[] {
  return Object.entries(DIGIT_ROWS).map(([d, rows]) => {
    const ops: DrawOp[] = [];
    rows.forEach((mask, ry) => {
      for (let c = 0; c < 3; c++) if (mask & (0b100 >> c)) ops.push({ rx: c, ry, rw: 1, rh: 1, color: '#e8e8f0' });
    });
    return { name: `digit_${d}`, w: 3, h: 5, anchorX: 1, anchorY: 2, ops };
  });
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
  // HUD bitmap font: digits 0–9 as 3×5 pixel glyphs, plus a colon.
  ...digitEntries(),
  { name: 'glyph_colon', w: 3, h: 5, anchorX: 1, anchorY: 2,
    ops: [{ rx: 1, ry: 1, rw: 1, rh: 1, color: '#e8e8f0' }, { rx: 1, ry: 3, rw: 1, rh: 1, color: '#e8e8f0' }] },
];

export type { SpriteFrame };
