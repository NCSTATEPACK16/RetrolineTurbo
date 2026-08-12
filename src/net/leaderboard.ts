import { supabase, ensureAnonSession } from './supabase.js';

export interface LeaderboardEntry {
  timeMs: number;
  isYou: boolean;
}

/** Top `limit` `race_results` for a track, fastest first. Readable by anyone
 * (RLS: "race results are viewable by everyone"), so this works even before
 * the current player has raced. */
export async function fetchLeaderboard(trackId: string, limit = 5): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const session = await ensureAnonSession();
  const myId = session?.user.id ?? null;
  const { data, error } = await supabase
    .from('race_results')
    .select('time_ms, user_id')
    .eq('track_id', trackId)
    .order('time_ms', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[leaderboard] fetch failed:', error.message);
    return [];
  }
  return ((data ?? []) as { time_ms: number; user_id: string }[]).map((row) => (
    { timeMs: row.time_ms, isYou: row.user_id === myId }
  ));
}
