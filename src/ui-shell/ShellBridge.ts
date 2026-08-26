import type { GarageState, PartState } from '../economy/GarageState.js';
import { resolveMetrics } from '../economy/Garage.js';
import { PART_CATALOG } from '../economy/partCurves.js';
import type { Part, PartCategory } from '../types/inventory.js';
import type { InputManager, Action, Bindings } from '../input/InputManager.js';
import type { SoundEngine } from '../audio/SoundEngine.js';
import type { CrtEffect } from '../ui/CrtEffect.js';
import { linkEmail as linkEmailReal, setPassword as setPasswordReal, isAccountLinked } from '../net/account.js';

export interface StatDiff { speed: number; accel: number; handling: number; grip: number }
export interface CrtSettings { scanline: boolean; aberration: boolean; bloom: number }
export interface Identity { displayName: string; linked: boolean }

export interface ShellBridgeDeps {
  garage: GarageState;
  input: InputManager;
  sound: SoundEngine;
  crt: CrtEffect;
  onGarageChange: () => void;
}

/** Thin facade so ui-shell code never touches game-module internals directly
 * (spec §6). Every method is a one-line pass-through — this is the seam
 * vitest targets; screens themselves are not unit-tested (no jsdom here). */
export class ShellBridge {
  constructor(private readonly deps: ShellBridgeDeps) {}

  getCredits(): number {
    return this.deps.garage.credits;
  }

  getCatalog(category: PartCategory): Part[] {
    return PART_CATALOG.filter((p) => p.category === category);
  }

  getPartState(part: Part): PartState {
    return this.deps.garage.partState(part);
  }

  buyAndEquip(part: Part): boolean {
    const { garage, onGarageChange } = this.deps;
    if (garage.partState(part) === 'owned') {
      const ok = garage.equip(part);
      if (ok) onGarageChange();
      return ok;
    }
    if (!garage.buy(part)) return false;
    garage.equip(part);
    onGarageChange();
    return true;
  }

  /** Delta between `part`'s resolved metrics and the currently-equipped loadout's. */
  getStatDiff(part: Part): StatDiff {
    const equipped = this.deps.garage.equipped;
    const current = resolveMetrics(equipped);
    const candidateLoadout = { ...equipped, [part.category]: part.id };
    const candidate = resolveMetrics(candidateLoadout);
    return {
      speed: candidate.speed - current.speed,
      accel: candidate.accel - current.accel,
      handling: candidate.handling - current.handling,
      grip: candidate.grip - current.grip,
    };
  }

  getBindings(): Bindings {
    return this.deps.input.bindings;
  }

  rebind(action: Action, code: string): void {
    const { input } = this.deps;
    input.setBindings({ ...input.bindings, [action]: [code] });
  }

  getVolume(bus: 'engine' | 'music'): number {
    return this.deps.sound.getVolume(bus);
  }

  setVolume(bus: 'engine' | 'music', value: number): void {
    this.deps.sound.setVolume(bus, value);
  }

  getCrtSettings(): CrtSettings {
    return this.deps.crt.getSettings();
  }

  setCrtSettings(next: Partial<CrtSettings>): void {
    this.deps.crt.setSettings(next);
  }

  async getIdentity(): Promise<Identity> {
    const linked = await isAccountLinked();
    return { displayName: linked ? 'Driver' : 'Guest Driver', linked };
  }

  async linkEmail(email: string): Promise<'ok' | 'no-backend' | 'error'> {
    return linkEmailReal(email);
  }

  async setPassword(password: string): Promise<'ok' | 'no-backend' | 'error'> {
    return setPasswordReal(password);
  }
}
