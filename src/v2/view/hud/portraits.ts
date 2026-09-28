import type { Mood } from './popups.js';

/**
 * Driver portraits: 16x16 pixel faces, drawn at 2x (32px) in the HUD pop-ups
 * and results. Each driver has one hand-drawn base; the three expressions
 * (neutral, happy, angry) are overlays on its eyes and mouth, so every mood
 * reads the same way across the cast. `P` is the driver's paint colour, which
 * ties the face to the car on track. Pure data + a pure compositor, unit-tested.
 *
 * Keys: . background, k outline, P paint, w white, s light skin, t tan,
 * n brown, e green, E dark green, g light grey, l dark grey, y gold,
 * O orange, c cyan, b blue, r red.
 */
export const PORTRAIT_SIZE = 16;

export interface PortraitArt {
  readonly rows: readonly string[];
  /** Eye centres (row, left x, right x) and mouth (row, x, width). */
  readonly eyes: readonly [number, number, number];
  readonly mouth: readonly [number, number, number];
  /** Eye colour key (robots glow). */
  readonly eye?: string;
}

export const PORTRAITS: Readonly<Record<string, PortraitArt>> = {
  // Racing helmet in her paint, visor up.
  rosa: {
    rows: [
      '................',
      '.....kkkkkk.....',
      '...kkPPPPPPkk...',
      '..kPPPwwPPPPPk..',
      '..kPPPwwPPPPPk..',
      '.kPPPPPPPPPPPPk.',
      '.kPkkkkkkkkkkPk.',
      '.kPkttttttttkPk.',
      '.kPkttttttttkPk.',
      '.kPkttttttttkPk.',
      '.kPkttttttttkPk.',
      '..kkttttttttkk..',
      '...kkttttttkk...',
      '....kkkkkkkk....',
      '................',
      '................',
    ],
    eyes: [8, 6, 9], mouth: [11, 6, 4],
  },
  // Boxy robot with an antenna and glowing eyes.
  bolt: {
    rows: [
      '......kyyk......',
      '.......kk.......',
      '.......kk.......',
      '..kkkkkkkkkkkk..',
      '..kggggggggggk..',
      '..kgPPPPPPPPgk..',
      '..kgllllllllgk..',
      '..kgllllllllgk..',
      '..kgllllllllgk..',
      '..kggggggggggk..',
      '..kgggkkkkgggk..',
      '..kggggggggggk..',
      '..kkkkkkkkkkkk..',
      '....kgk..kgk....',
      '................',
      '................',
    ],
    eyes: [7, 5, 10], mouth: [10, 6, 4], eye: 'c',
  },
  // Bald inventor: white tufts, goggles on the forehead, big moustache.
  pip: {
    rows: [
      '................',
      '.....kkkkkk.....',
      '...kksssssskk...',
      '..kPPkPPkPPkPk..',
      '.kwkkkkkkkkkkwk.',
      '.kwwsssssssswwk.',
      '.kwssssssssssswk',
      '..kssssssssssk..',
      '..kssssssssssk..',
      '..kssswwwwsssk..',
      '..ksswwwwwwssk..',
      '..kssssssssssk..',
      '...kkssssssk....',
      '.....kkkkkk.....',
      '................',
      '................',
    ],
    eyes: [7, 5, 10], mouth: [11, 6, 4],
  },
  // Tortoise: round green head poking out of her shell.
  shelly: {
    rows: [
      '................',
      '................',
      '.....kkkkkk.....',
      '...kkeeeeeekk...',
      '..keeeeeeeeeek..',
      '..keeeeeeeeeek..',
      '.keeeeeeeeeeeek.',
      '.keeeeeeeeeeeek.',
      '.keeeeeeeeeeeek.',
      '..keeeeeeeeeek..',
      '..keeeeeeeeeek..',
      '.kkkkeeeeeekkkk.',
      'kEPEPkkkkkkPEPEk',
      'kPEPEPEPEPEPEPEk',
      'kkkkkkkkkkkkkkkk',
      '................',
    ],
    eyes: [6, 5, 10], mouth: [9, 6, 4],
  },
  // Moose: long brown face under a big pair of antlers.
  moose: {
    rows: [
      'kt.kt......tk.tk',
      'kttkt......tkttk',
      '.kttkk....kkttk.',
      '..kkttkkkkttkk..',
      '....kknnnnkk....',
      '...knnnnnnnnk...',
      '...knnnnnnnnk...',
      '...knnnnnnnnk...',
      '...knnnnnnnnk...',
      '..kntttttttttk..',
      '..ktttttttttk...',
      '..ktkttttkttk...',
      '..ktttttttttk...',
      '...kkttttttk....',
      '.....kkkkkk.....',
      '................',
    ],
    eyes: [7, 5, 10], mouth: [12, 5, 5],
  },
  // Dingo: sandy face, tall pointed ears, white muzzle, paint bandana.
  dusty: {
    rows: [
      '..kk........kk..',
      '..ktk......ktk..',
      '..kttk....kttk..',
      '..kttkkkkkkttk..',
      '..kttttttttttk..',
      '.kttttttttttttk.',
      '.kttttttttttttk.',
      '.kttttttttttttk.',
      '..kttwwwwwwttk..',
      '..ktwwwkkwwwtk..',
      '...kwwwwwwwwk...',
      '...kwwwwwwwwk...',
      '..kPPPPPPPPPPk..',
      '...kPPPPPPPPk...',
      '....kkkkkkkk....',
      '................',
    ],
    eyes: [6, 5, 10], mouth: [11, 6, 4],
  },
  // Little round robot with one big glowing visor.
  gizmo: {
    rows: [
      '................',
      '................',
      '.....kkkkkk.....',
      '...kkwwwwwwkk...',
      '..kwwwwwwwwwwk..',
      '..kwPPPPPPPPwk..',
      '.kwkkkkkkkkkkwk.',
      '.kwkbbbbbbbbkwk.',
      '.kwkbbbbbbbbkwk.',
      '.kwkkkkkkkkkkwk.',
      '..kwwwwwwwwwwk..',
      '..kwwwwwwwwwwk..',
      '...kkwwwwwwkk...',
      '..kgkkkkkkkkgk..',
      '................',
      '................',
    ],
    eyes: [8, 6, 9], mouth: [11, 6, 4], eye: 'c',
  },
  // Pylon Pete: a traffic cone with a face. Enough said.
  pete: {
    rows: [
      '.......kk.......',
      '......kOOk......',
      '......kOOk......',
      '.....kOOOOk.....',
      '.....kwwwwk.....',
      '....kwwwwwwk....',
      '....kOOOOOOk....',
      '...kOOOOOOOOk...',
      '...kOOOOOOOOk...',
      '..kOOOOOOOOOOk..',
      '..kwwwwwwwwwwk..',
      '.kwwwwwwwwwwwwk.',
      '.kOOOOOOOOOOOOk.',
      'kkkkkkkkkkkkkkkk',
      'kPPPPPPPPPPPPPPk',
      'kkkkkkkkkkkkkkkk',
    ],
    eyes: [7, 6, 9], mouth: [9, 6, 4],
  },
  // A local player: helmet in their paint, visor down.
  player: {
    rows: [
      '................',
      '.....kkkkkk.....',
      '...kkPPPPPPkk...',
      '..kPPPPPPPPPPk..',
      '..kPPwwPPPPPPk..',
      '.kPPwwPPPPPPPPk.',
      '.kPkkkkkkkkkkPk.',
      '.kPkbbbbbbbbkPk.',
      '.kPkbbbbbbbbkPk.',
      '.kPkkkkkkkkkkPk.',
      '.kPPPPPPPPPPPPk.',
      '..kPPPkkkkPPPk..',
      '...kkPPPPPPkk...',
      '....kkkkkkkk....',
      '................',
      '................',
    ],
    eyes: [8, 6, 9], mouth: [11, 6, 4], eye: 'w',
  },
};

/**
 * Compose a portrait: the base plus the mood's eyes, brows and mouth.
 * Returns 16 rows of palette keys.
 */
export function composePortrait(art: PortraitArt, mood: Mood): string[] {
  const g = art.rows.map((r) => r.split(''));
  const put = (y: number, x: number, k: string): void => {
    const row = g[y];
    if (row && x >= 0 && x < PORTRAIT_SIZE) row[x] = k;
  };
  const [ey, el, er] = art.eyes;
  const eye = art.eye ?? 'k';
  for (const x of [el, er]) {
    if (mood === 'happy') {
      // Closed, smiling eyes: ^ ^
      put(ey, x - 1, eye); put(ey - 1, x, eye); put(ey, x + 1, eye);
    } else {
      put(ey, x, eye); put(ey - 1, x, eye);
    }
  }
  if (mood === 'angry') {
    // Brows slanting down toward the nose.
    put(ey - 3, el - 1, 'k'); put(ey - 2, el, 'k'); put(ey - 2, el + 1, 'k');
    put(ey - 3, er + 1, 'k'); put(ey - 2, er, 'k'); put(ey - 2, er - 1, 'k');
  }
  const [my, mx, mw] = art.mouth;
  if (mood === 'happy') {
    put(my - 1, mx - 1, 'k'); put(my - 1, mx + mw, 'k');
    for (let x = mx; x < mx + mw; x++) put(my, x, 'k');
    for (let x = mx + 1; x < mx + mw - 1; x++) put(my + 1, x, 'r');
  } else if (mood === 'angry') {
    for (let x = mx; x < mx + mw; x++) put(my, x, 'k');
    put(my + 1, mx - 1, 'k'); put(my + 1, mx + mw, 'k');
  } else {
    for (let x = mx; x < mx + mw; x++) put(my, x, 'k');
  }
  return g.map((r) => r.join(''));
}
