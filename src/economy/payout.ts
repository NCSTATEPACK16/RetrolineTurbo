/**
 * Post-race payout (spec §1). A pure function of what the run produced — no
 * time source, no I/O, no rendering — so the ledger is unit-testable and
 * main.ts can commit it exactly once at the finish line.
 *
 * The five constants below are provisional feel constants (gate-tuned), in the
 * same spirit as track/route.ts: a clean five-stage run should land near 3-4k,
 * roughly one mid-tier part per session for a ~20-min/day player.
 */

export const STAGE_CREDITS = 250;
export const FINISH_BONUS = 1000;
export const CREDITS_PER_SECOND = 10;
export const POINTS_PER_CREDIT = 10;
export const CLEAN_MULTIPLIER = 1.1;

export interface RunSummary {
  /** Stages the player got through: route.stage, +1 if the route was finished. */
  stagesCleared: number;
  finished: boolean;
  /** Countdown left at the finish. Always 0 on an expired run. */
  remainingMs: number;
  /** ScoreState.points — 100 per car overtaken. */
  points: number;
  collisions: number;
}

export interface PayoutLine {
  label: string;
  credits: number;
}

export interface PayoutLedger {
  lines: PayoutLine[];
  cleanMultiplier: number;
  total: number;
}

export function computePayout(run: RunSummary): PayoutLedger {
  const lines: PayoutLine[] = [
    { label: 'stages cleared', credits: run.stagesCleared * STAGE_CREDITS },
    { label: 'route complete', credits: run.finished ? FINISH_BONUS : 0 },
    { label: 'time remaining', credits: Math.floor(run.remainingMs / 1000) * CREDITS_PER_SECOND },
    { label: 'passed cars', credits: Math.floor(run.points / POINTS_PER_CREDIT) },
  ];
  const cleanMultiplier = run.collisions === 0 ? CLEAN_MULTIPLIER : 1;
  const subtotal = lines.reduce((sum, l) => sum + l.credits, 0);
  return { lines, cleanMultiplier, total: Math.round(subtotal * cleanMultiplier) };
}
