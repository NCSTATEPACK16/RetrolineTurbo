import type { EngineClass } from './classes.js';
import { PARTS, PART_BY_ID, PAINTS, HORNS, STARTER_BUILD, PART_SLOTS, type CarBuild, type Part } from './parts.js';

/**
 * Credits and the player's garage (PRD section 9): earned from finishing
 * position and coins, spent on parts; cup trophies unlock whole part sets.
 * Pure data and rules; the shell stores the profile.
 */
export const RACE_CREDITS = [120, 100, 85, 70, 60, 50, 40, 30] as const;
export const CREDITS_PER_COIN = 5;
export const CLASS_CREDIT_SCALE: Readonly<Record<EngineClass, number>> = { 50: 0.8, 100: 1, 150: 1.25 };
export const TROPHY_CREDITS = [300, 200, 100] as const;

export function raceCredits(position: number, coins: number, cls: EngineClass): number {
  return Math.round(((RACE_CREDITS[position - 1] ?? 0) + coins * CREDITS_PER_COIN) * CLASS_CREDIT_SCALE[cls]);
}

export interface Trophy { cup: string; cls: EngineClass; place: 1 | 2 | 3 }

export interface Profile {
  credits: number;
  owned: string[];
  build: CarBuild;
  trophies: Trophy[];
}

export function newProfile(): Profile {
  return { credits: 0, owned: PARTS.filter((p) => p.price === 0 && !p.unlock).map((p) => p.id), build: { ...STARTER_BUILD }, trophies: [] };
}

export function isUnlocked(profile: Profile, part: Part): boolean {
  if (!part.unlock) return true;
  const u = part.unlock;
  return profile.trophies.some((t) => t.cup === u.cup && t.place <= u.place);
}

export function owns(profile: Profile, id: string): boolean {
  return profile.owned.includes(id);
}

export type BuyResult = 'ok' | 'owned' | 'locked' | 'poor' | 'unknown';

export function buy(profile: Profile, id: string): BuyResult {
  const part = PART_BY_ID.get(id);
  if (!part) return 'unknown';
  if (owns(profile, id)) return 'owned';
  if (!isUnlocked(profile, part) || part.unlock) return 'locked'; // trophy parts are granted, not sold
  if (profile.credits < part.price) return 'poor';
  profile.credits -= part.price;
  profile.owned.push(id);
  return 'ok';
}

/** Equip an owned part (or any paint/horn). Returns false if it isn't yours. */
export function equip(profile: Profile, slot: keyof CarBuild, id: string): boolean {
  if (slot === 'paint') { if (!PAINTS.some((p) => p.id === id)) return false; }
  else if (slot === 'horn') { if (!HORNS.some((h) => h.id === id)) return false; }
  else if (PART_BY_ID.get(id)?.slot !== slot || !owns(profile, id)) return false;
  profile.build[slot] = id;
  return true;
}

/** Record a finished cup: trophy credits, the trophy, and any part sets it unlocks. Returns newly unlocked part ids. */
export function awardCup(profile: Profile, cup: string, cls: EngineClass, place: number): string[] {
  if (place < 1 || place > 3) return [];
  profile.credits += TROPHY_CREDITS[place - 1]!;
  const p = place as 1 | 2 | 3;
  const prior = profile.trophies.find((t) => t.cup === cup && t.cls === cls);
  if (!prior) profile.trophies.push({ cup, cls, place: p });
  else if (p < prior.place) prior.place = p;
  const fresh = PARTS.filter((part) => part.unlock && !owns(profile, part.id) && isUnlocked(profile, part)).map((part) => part.id);
  profile.owned.push(...fresh);
  return fresh;
}

/** Rebuild a profile from untrusted stored JSON, falling back field by field. */
export function parseProfile(raw: unknown): Profile {
  const p = newProfile();
  if (typeof raw !== 'object' || raw === null) return p;
  const r = raw as Record<string, unknown>;
  if (typeof r.credits === 'number' && Number.isFinite(r.credits) && r.credits >= 0) p.credits = Math.floor(r.credits);
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && PART_BY_ID.has(id) && !p.owned.includes(id)) p.owned.push(id);
  if (Array.isArray(r.trophies)) {
    for (const t of r.trophies as Record<string, unknown>[]) {
      if (t && typeof t.cup === 'string' && [50, 100, 150].includes(t.cls as number) && [1, 2, 3].includes(t.place as number)) {
        p.trophies.push({ cup: t.cup, cls: t.cls as EngineClass, place: t.place as 1 | 2 | 3 });
      }
    }
  }
  if (typeof r.build === 'object' && r.build !== null) {
    const b = r.build as Record<string, unknown>;
    for (const slot of [...PART_SLOTS, 'paint', 'horn'] as const) {
      if (typeof b[slot] === 'string') equip(p, slot, b[slot]);
    }
  }
  return p;
}
