import { describe, it, expect, vi } from 'vitest';
import { ShellBridge } from './ShellBridge.js';
import { GarageState } from '../economy/GarageState.js';
import { InputManager, DEFAULT_BINDINGS } from '../input/InputManager.js';
import { SoundEngine } from '../audio/SoundEngine.js';
import { CrtEffect } from '../ui/CrtEffect.js';
import { PART_CATALOG } from '../economy/partCurves.js';

function fakeCanvas(): HTMLCanvasElement {
  return { getContext: () => null } as unknown as HTMLCanvasElement;
}

function makeBridge() {
  const garage = new GarageState();
  const input = new InputManager();
  const sound = new SoundEngine();
  const crt = new CrtEffect(fakeCanvas());
  const onGarageChange = vi.fn();
  const bridge = new ShellBridge({ garage, input, sound, crt, onGarageChange });
  return { bridge, garage, input, sound, crt, onGarageChange };
}

describe('ShellBridge — garage', () => {
  it('reads credits and catalog straight through', () => {
    const { bridge, garage } = makeBridge();
    garage.award(1000);
    expect(bridge.getCredits()).toBe(1000);
    expect(bridge.getCatalog('engine')).toEqual(PART_CATALOG.filter((p) => p.category === 'engine'));
  });

  it('buyAndEquip buys then equips an affordable part and calls onGarageChange once', () => {
    const { bridge, garage, onGarageChange } = makeBridge();
    const part = PART_CATALOG.find((p) => p.category === 'engine')!;
    garage.award(part.cost);
    expect(bridge.buyAndEquip(part)).toBe(true);
    expect(garage.owns(part.id)).toBe(true);
    expect(garage.equipped.engine).toBe(part.id);
    expect(onGarageChange).toHaveBeenCalledTimes(1);
  });

  it('buyAndEquip returns false and does not call onGarageChange when unaffordable', () => {
    const { bridge, onGarageChange } = makeBridge();
    const part = PART_CATALOG.find((p) => p.category === 'engine')!;
    expect(bridge.buyAndEquip(part)).toBe(false);
    expect(onGarageChange).not.toHaveBeenCalled();
  });

  it('getStatDiff reports the delta between a candidate and the currently equipped part', () => {
    const { bridge } = makeBridge();
    const part = PART_CATALOG.find((p) => p.category === 'engine')!;
    const diff = bridge.getStatDiff(part);
    expect(diff.speed).toBeCloseTo(part.speedMod);
    expect(diff.accel).toBeCloseTo(part.accelMod);
  });
});

describe('ShellBridge — controls', () => {
  it('getBindings/rebind pass through to InputManager', () => {
    const { bridge, input } = makeBridge();
    expect(bridge.getBindings()).toEqual(DEFAULT_BINDINGS);
    bridge.rebind('throttle', 'KeyZ');
    expect(input.bindings.throttle).toContain('KeyZ');
  });
});

describe('ShellBridge — audio', () => {
  it('getVolume/setVolume pass through to SoundEngine', () => {
    const { bridge } = makeBridge();
    bridge.setVolume('music', 0.4);
    expect(bridge.getVolume('music')).toBeCloseTo(0.4);
  });
});

describe('ShellBridge — display', () => {
  it('getCrtSettings/setCrtSettings pass through to CrtEffect', () => {
    const { bridge } = makeBridge();
    bridge.setCrtSettings({ scanline: false });
    expect(bridge.getCrtSettings().scanline).toBe(false);
  });
});

describe('ShellBridge — account', () => {
  // Whether a real Supabase client exists depends on .env in this checkout
  // (net/supabase.ts degrades to a null client without one) — these assert
  // the pass-through contract, not a specific backend availability.
  it('getIdentity resolves without an active session', async () => {
    const { bridge } = makeBridge();
    const identity = await bridge.getIdentity();
    expect(identity.linked).toBe(false);
    expect(identity.displayName).toBe('Guest Driver');
  });

  it('linkEmail/setPassword never throw and resolve to a known result', async () => {
    const { bridge } = makeBridge();
    const linkResult = await bridge.linkEmail('a@b.com');
    expect(['ok', 'no-backend', 'error']).toContain(linkResult);
    const passResult = await bridge.setPassword('hunter2');
    expect(['ok', 'no-backend', 'error']).toContain(passResult);
  });
});
