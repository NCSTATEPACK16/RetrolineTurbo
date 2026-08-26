import { describe, it, expect } from 'vitest';
import { buildConstantsBlock } from './TuningOverlay.js';
import { DEFAULT_VEHICLE_PARAMS } from '../../physics/Vehicle.js';
import {
  GEAR_MAX_KMH, TORQUE_SHAPE, BOG_FACTOR, CENTRIFUGAL, STEER_RATE_PER_S,
  SKID_CURVE_THRESHOLD, MU_OFFROAD,
} from '../../constants.js';

// Only the paste-able-block builder is covered here: the rest of the overlay is
// DOM, and this repo's vitest runs `environment: 'node'` — the same reason
// CrtEffect/SoundEngine only unit-test their non-DOM halves.
describe('buildConstantsBlock', () => {
  it('round-trips the shipped values when nothing was tuned', () => {
    const out = buildConstantsBlock(DEFAULT_VEHICLE_PARAMS, {});
    expect(out).toContain(`export const GEAR_MAX_KMH = [${GEAR_MAX_KMH.join(', ')}] as const;`);
    expect(out).toContain(`export const TORQUE_SHAPE = ${TORQUE_SHAPE};`);
    expect(out).toContain(`export const BOG_FACTOR = ${BOG_FACTOR};`);
    expect(out).toContain(`export const CENTRIFUGAL = ${CENTRIFUGAL};`);
    expect(out).toContain(`export const STEER_RATE_PER_S = ${STEER_RATE_PER_S};`);
    expect(out).toContain(`export const SKID_CURVE_THRESHOLD = ${SKID_CURVE_THRESHOLD};`);
    expect(out).toContain(`export const MU_OFFROAD = ${MU_OFFROAD};`);
  });

  it('emits the tuned value in place of the shipped one', () => {
    const out = buildConstantsBlock(DEFAULT_VEHICLE_PARAMS, { torqueShape: 0.85, centrifugal: 750 });
    expect(out).toContain('export const TORQUE_SHAPE = 0.85;');
    expect(out).toContain('export const CENTRIFUGAL = 750;');
  });

  it('emits edited gear arrays', () => {
    const params = { ...DEFAULT_VEHICLE_PARAMS, gearMaxKmh: [80, 140, 210, 290] };
    expect(buildConstantsBlock(params, {}))
      .toContain('export const GEAR_MAX_KMH = [80, 140, 210, 290] as const;');
  });

  it('emits CENTRIFUGAL exactly once — it lives in both channels', () => {
    // It is a VehicleParams member *and* a TuningOverrides field; emitting it
    // from both loops would paste a duplicate export into constants.ts.
    const out = buildConstantsBlock(DEFAULT_VEHICLE_PARAMS, { centrifugal: 750 });
    expect(out.match(/export const CENTRIFUGAL/g)).toHaveLength(1);
  });

  it('is valid pasteable TypeScript — one export per line, no undefined', () => {
    const out = buildConstantsBlock(DEFAULT_VEHICLE_PARAMS, {});
    expect(out).not.toContain('undefined');
    for (const line of out.split('\n').slice(1)) {
      expect(line).toMatch(/^export const [A-Z_]+ = .+;$/);
    }
  });
});
