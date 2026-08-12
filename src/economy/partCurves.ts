import { PART_CATEGORIES, type CarMetrics, type Part, type PartCategory } from '../types/inventory.js';

/** Tiers per category; four categories x 20 = the 80-part catalog. */
export const PART_TIERS = 20;

/**
 * Balance curves (provisional feel constants — gate-tuned). Low tiers are mild
 * all-rounders; the trade-off only bites past tier 5, so the top of each
 * category is a specialization with a real cost rather than a strict upgrade.
 */
export function primaryMod(tier: number): number { return Math.round(1.8 * tier); }
export function tradeoffMod(tier: number): number {
  const penalty = Math.round(0.9 * Math.max(0, tier - 5));
  return penalty === 0 ? 0 : -penalty; // never -0: it leaks into equality checks
}
export function partCost(tier: number): number { return Math.round(400 * 1.28 ** (tier - 1)); }
export function partUnlockStage(tier: number): number { return Math.min(4, Math.floor((tier - 1) / 5)); }

/** Which metric each category pushes, and which one it pays with. */
const PAIRING: Record<PartCategory, { primary: keyof CarMetrics; tradeoff: keyof CarMetrics }> = {
  engine: { primary: 'speed', tradeoff: 'handling' }, // weight blunts steering
  transmission: { primary: 'accel', tradeoff: 'speed' }, // short ratios cap the top end
  suspension: { primary: 'handling', tradeoff: 'grip' }, // stiff tunes lose off-road bite
  wheels: { primary: 'grip', tradeoff: 'speed' }, // soft slicks cost a little speed
};

const NAMES: Record<PartCategory, readonly string[]> = {
  engine: [
    'stock inline-4', 'tuned inline-4', 'sport inline-4', 'big-bore 4', 'turbo 4',
    'inline-6', 'tuned 6', 'twin-cam 6', 'turbo 6', 'twin-turbo 6',
    'small-block v8', 'tuned v8', 'quad-cam v8', 'blown v8', 'turbo v8',
    'twin-turbo v8', 'flat-12', 'race v10', 'quad-turbo v12', 'proto v12',
  ],
  transmission: [
    'stock 4-speed', 'close 4-speed', 'sport 5-speed', 'close 5-speed', 'short 5-speed',
    'rally 5-speed', 'sport 6-speed', 'close 6-speed', 'short 6-speed', 'dogleg 6-speed',
    'race 6-speed', 'sequential 6', 'sequential 7', 'close 7-speed', 'short 7-speed',
    'race 7-speed', 'dual-clutch 7', 'dual-clutch 8', 'race dual-clutch', 'proto sequential',
  ],
  suspension: [
    'stock coils', 'sport coils', 'lowered coils', 'adjustable coils', 'sport dampers',
    'rally dampers', 'gas dampers', 'twin-tube overs', 'mono-tube overs', 'adjustable overs',
    'track overs', 'stiff track overs', 'race overs', 'pushrod race', 'inboard pushrod',
    'active dampers', 'adaptive dampers', 'race active', 'proto active', 'ground-effect race',
  ],
  wheels: [
    'stock steel', 'wide steel', 'touring alloy', 'sport alloy', 'wide alloy',
    'all-weather radial', 'sport radial', 'summer perf', 'ultra perf', 'semi-slick',
    'wide semi-slick', 'soft semi-slick', 'track slick', 'wide track slick', 'soft slick',
    'super-soft slick', 'race slick', 'wide race slick', 'qualifying slick', 'proto slick',
  ],
};

/**
 * Build all 80 parts from the curves above. Pure and deterministic — the
 * committed `parts.json` snapshot is this function's output, so a balance change
 * always shows up as a reviewable diff (see parts.golden.test.ts).
 */
export function generateCatalog(): Part[] {
  const parts: Part[] = [];
  for (const category of PART_CATEGORIES) {
    const { primary, tradeoff } = PAIRING[category];
    for (let tier = 1; tier <= PART_TIERS; tier++) {
      const mods: CarMetrics = { speed: 0, accel: 0, handling: 0, grip: 0 };
      mods[primary] = primaryMod(tier);
      mods[tradeoff] = tradeoffMod(tier);
      parts.push({
        id: `${category}-${String(tier).padStart(2, '0')}`,
        name: NAMES[category][tier - 1]!,
        category,
        tier,
        cost: partCost(tier),
        unlockStage: partUnlockStage(tier),
        speedMod: mods.speed,
        accelMod: mods.accel,
        handlingMod: mods.handling,
        gripMod: mods.grip,
      });
    }
  }
  return parts;
}

/** The catalog every consumer reads. Built once at module load. */
export const PART_CATALOG: readonly Part[] = generateCatalog();
