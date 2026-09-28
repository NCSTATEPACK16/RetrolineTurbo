/**
 * Player names are generated, never typed (hard rule 7: no free text). Two
 * hand-picked, family-friendly word lists; a name is one of each. Every
 * combination is safe by construction, and names round-trip through
 * `isGeneratedName` so stored data can't smuggle in anything else.
 */
export const NAME_FIRST = [
  'Zippy', 'Turbo', 'Speedy', 'Lucky', 'Rocket', 'Sunny', 'Cosmic', 'Mighty', 'Nifty', 'Super',
  'Dizzy', 'Jolly', 'Bouncy', 'Sparky', 'Brave', 'Swift', 'Happy', 'Blazing', 'Clever', 'Groovy',
] as const;

export const NAME_SECOND = [
  'Comet', 'Racer', 'Falcon', 'Pickle', 'Tiger', 'Pebble', 'Noodle', 'Otter', 'Muffin', 'Rocket',
  'Panda', 'Waffle', 'Dragon', 'Penguin', 'Button', 'Meteor', 'Koala', 'Bagel', 'Badger', 'Pixel',
] as const;

/** xorshift32 step (shared with line-up picks). */
export function nextSeed(s: number): number {
  let x = s >>> 0 || 1;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x;
}

export function generateName(seed: number): string {
  const a = nextSeed(seed);
  const b = nextSeed(a);
  let first: string = NAME_FIRST[a % NAME_FIRST.length]!;
  let second: string = NAME_SECOND[b % NAME_SECOND.length]!;
  if (first === second) second = NAME_SECOND[(b + 1) % NAME_SECOND.length]!;
  return `${first} ${second}`;
}

export function isGeneratedName(name: string): boolean {
  const [first, second, ...extra] = name.split(' ');
  return extra.length === 0 && (NAME_FIRST as readonly string[]).includes(first ?? '') && (NAME_SECOND as readonly string[]).includes(second ?? '');
}
