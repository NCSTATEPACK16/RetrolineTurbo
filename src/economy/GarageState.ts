import { emptyLoadout, type EquippedLoadout, type Part } from '../types/inventory.js';
import type { SaveBackend } from './save.js';

/** How a part reads in the shop. Progress gates before price does. */
export type PartState = 'locked' | 'unaffordable' | 'purchasable' | 'owned' | 'equipped';

export interface GarageSave {
  credits: number;
  owned: string[];
  equipped: EquippedLoadout;
  bestStage: number;
}

export const GARAGE_SAVE_KEY = 'garage';

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const idOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * The player's wallet, inventory and fitted loadout. Deliberately dumb: every
 * method is a synchronous state transition, so the shop UI and the race payout
 * share one set of rules and the tests need no I/O.
 */
export class GarageState {
  credits = 0;
  /** Deepest route stage reached across all runs — the unlock gate. */
  bestStage = 0;
  equipped: EquippedLoadout = emptyLoadout();
  private readonly ownedIds = new Set<string>();

  owns(id: string): boolean {
    return this.ownedIds.has(id);
  }

  partState(part: Part): PartState {
    if (this.equipped[part.category] === part.id) return 'equipped';
    if (this.ownedIds.has(part.id)) return 'owned';
    if (this.bestStage < part.unlockStage) return 'locked';
    return this.credits >= part.cost ? 'purchasable' : 'unaffordable';
  }

  /** Debit and add to inventory. False (and no state change) unless purchasable. */
  buy(part: Part): boolean {
    if (this.partState(part) !== 'purchasable') return false;
    this.credits -= part.cost;
    this.ownedIds.add(part.id);
    return true;
  }

  /** Fit an owned part, replacing whatever occupied its category. */
  equip(part: Part): boolean {
    if (!this.ownedIds.has(part.id)) return false;
    this.equipped[part.category] = part.id;
    return true;
  }

  /** Add an id to the inventory without paying — used when hydrating a save. */
  adopt(id: string): void {
    this.ownedIds.add(id);
  }

  award(credits: number): void {
    this.credits += credits;
  }

  noteStage(stage: number): void {
    if (stage > this.bestStage) this.bestStage = stage;
  }

  toJSON(): GarageSave {
    return {
      credits: this.credits,
      owned: [...this.ownedIds],
      equipped: { ...this.equipped },
      bestStage: this.bestStage,
    };
  }

  /** Tolerant of anything: a corrupt save costs progress, never a crash. */
  static fromJSON(raw: string | null): GarageState {
    const garage = new GarageState();
    if (raw === null || raw === '') return garage;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return garage;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return garage;
    const doc = parsed as Partial<GarageSave>;
    if (isFiniteNumber(doc.credits)) garage.credits = doc.credits;
    if (isFiniteNumber(doc.bestStage)) garage.bestStage = doc.bestStage;
    if (Array.isArray(doc.owned)) {
      for (const id of doc.owned) if (typeof id === 'string') garage.ownedIds.add(id);
    }
    const eq = doc.equipped;
    if (typeof eq === 'object' && eq !== null) {
      garage.equipped = {
        engine: idOrNull(eq.engine),
        transmission: idOrNull(eq.transmission),
        suspension: idOrNull(eq.suspension),
        wheels: idOrNull(eq.wheels),
      };
    }
    return garage;
  }
}

export async function loadGarage(save: SaveBackend): Promise<GarageState> {
  return GarageState.fromJSON(await save.get(GARAGE_SAVE_KEY));
}

export async function persistGarage(save: SaveBackend, garage: GarageState): Promise<void> {
  await save.set(GARAGE_SAVE_KEY, JSON.stringify(garage.toJSON()));
}
