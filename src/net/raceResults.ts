import { supabase, ensureAnonSession } from './supabase.js';

export interface RaceResultInput {
  trackId: string;
  route: string;
  timeMs: number;
  creditsEarned?: number;
}

/** Insert a finished run into `race_results` (feeds `leaderboard_best` and
 * the leaderboard screen). No-ops when Supabase is unconfigured or auth
 * fails — a race always finishes locally even if the network write is lost. */
export async function recordRaceResult(input: RaceResultInput): Promise<void> {
  const session = await ensureAnonSession();
  if (!supabase || !session) return;
  const { error } = await supabase.from('race_results').insert({
    user_id: session.user.id,
    track_id: input.trackId,
    route: input.route,
    time_ms: Math.round(input.timeMs),
    credits_earned: input.creditsEarned ?? 0,
  });
  if (error) console.error('[raceResults] insert failed:', error.message);
}
