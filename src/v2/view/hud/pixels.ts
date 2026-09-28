/**
 * Pixel data for the v2 HUD: a 3x5 font and small item/flag icons, as strings
 * so the art is readable in code review. Each char is a palette key; '.' is
 * transparent. Pure data plus tiny helpers — unit-tested, rendered once into
 * offscreen canvases by the HUD.
 */
export const FONT_W = 3;
export const FONT_H = 5;

export const FONT: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
  A: ['###', '#.#', '###', '#.#', '#.#'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  G: ['###', '#..', '#.#', '#.#', '###'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  J: ['..#', '..#', '..#', '#.#', '###'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
};

export function hasGlyph(ch: string): boolean {
  return ch in FONT || ch === ' ';
}

/** Advance in font pixels (glyph + 1px gap), at scale 1. */
export function textWidthPx(text: string): number {
  return text.length === 0 ? 0 : text.length * (FONT_W + 1) - 1;
}

/**
 * Icons, 11x11. Keys: w white, k outline, y gold, o orange, r red, c cyan,
 * m magenta, g grey, b blue.
 */
export const ICONS: Readonly<Record<string, readonly string[]>> = {
  boost: [
    '....kkk....', '...kyyyk...', '..kyyoyyk..', '..kyooyyk..', '.kyooooyyk.', '.kyoorooyk.',
    '.kyorrroyk.', '..kyrrryk..', '..kyoroyk..', '...kyyyk...', '....kkk....',
  ],
  oil: [
    '.....k.....', '....kkk....', '....kgk....', '...kkgkk...', '...kgggk...', '..kkggkkk..',
    '..kgggggk..', '..kkgggkk..', '...kkkkk...', '...........', '...........',
  ],
  shield: [
    '...ccccc...', '..c.....c..', '.c..www..c.', 'c..w...w..c', 'c.w.....w.c', 'c.w.....w.c',
    'c.w.....w.c', 'c..w...w..c', '.c..www..c.', '..c.....c..', '...ccccc...',
  ],
  magnet: [
    '.rrr...bbb.', '.rrr...bbb.', '.www...www.', '.rrr...bbb.', '.rrr...bbb.', '.rrr...bbb.',
    '.rrrr.bbbb.', '..rrrrbbb..', '...rrrbb...', '...........', '...........',
  ],
  seeker: [
    '.....c.....', '....ccc....', '...ccwcc...', '..ccwwwcc..', '.ccwwwwwcc.', 'cccwwmwwccc',
    '.ccwwwwwcc.', '..ccwwwcc..', '...ccwcc...', '....ccc....', '.....c.....',
  ],
  flag: [
    'kwkwkw.....', 'kkwkwk.....', 'kwkwkw.....', 'kkwkwk.....', 'k..........', 'k..........',
    'k..........', 'k..........', '...........', '...........', '...........',
  ],
  coin: [
    '...kkkkk...', '..kyyyyyk..', '.kyyoooyyk.', 'kyyoyyyoyyk', 'kyyoyyyyyyk', 'kyyoyyyyyyk',
    'kyyoyyyoyyk', '.kyyoooyyk.', '..kyyyyyk..', '...kkkkk...', '...........',
  ],
  wrongWay: [
    '....rr.....', '...rr......', '..rrrrrrr..', '...rr...r..', '....rr..r..', '........r..',
    '........r..', '..r.....r..', '..rrrrrrr..', '...........', '...........',
  ],
};

export const ITEM_ICON = ['', 'boost', 'oil', 'shield', 'magnet', 'seeker'] as const;

/** Ordinal suffix for a race position. */
export function ordinal(p: number): string {
  return p === 1 ? 'ST' : p === 2 ? 'ND' : p === 3 ? 'RD' : 'TH';
}

/** Position colour key: gold, silver, bronze, then white. */
export function positionColor(p: number): 'y' | 'w' | 'o' | 'g' {
  return p === 1 ? 'y' : p === 2 ? 'g' : p === 3 ? 'o' : 'w';
}

/**
 * Fit a set of 2D points (x, z) into a w x h box with a margin, keeping aspect.
 * Returns scale and offsets so screen = (p - min) * scale + offset.
 */
export function fitPoints(xs: ArrayLike<number>, zs: ArrayLike<number>, w: number, h: number, margin = 2):
  { scale: number; ox: number; oy: number; minX: number; minZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    minX = Math.min(minX, xs[i]!); maxX = Math.max(maxX, xs[i]!);
    minZ = Math.min(minZ, zs[i]!); maxZ = Math.max(maxZ, zs[i]!);
  }
  const scale = Math.min((w - 2 * margin) / Math.max(1e-6, maxX - minX), (h - 2 * margin) / Math.max(1e-6, maxZ - minZ));
  const ox = margin + ((w - 2 * margin) - (maxX - minX) * scale) / 2;
  const oy = margin + ((h - 2 * margin) - (maxZ - minZ) * scale) / 2;
  return { scale, ox, oy, minX, minZ };
}
