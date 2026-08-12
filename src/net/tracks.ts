import { supabase, ensureAnonSession } from './supabase.js';
import type { TrackFile } from '../track/schema.js';

/** Publish a TrackFile publicly (retroline.tracks, is_public — RLS: readable
 * by everyone once public). Returns whether the insert succeeded. */
export async function publishTrack(name: string, file: TrackFile): Promise<boolean> {
  const session = await ensureAnonSession();
  if (!supabase || !session) return false;
  const { error } = await supabase.from('tracks').insert({
    author_id: session.user.id,
    name,
    data: file,
    is_public: true,
  });
  if (error) {
    console.error('[tracks] publish failed:', error.message);
    return false;
  }
  return true;
}

export interface PublicTrackSummary {
  id: string;
  name: string;
  plays: number;
}

/** Public track catalogue, most-played first. */
export async function browsePublicTracks(limit = 20): Promise<PublicTrackSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('tracks')
    .select('id, name, plays')
    .eq('is_public', true)
    .order('plays', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[tracks] browse failed:', error.message);
    return [];
  }
  return (data ?? []) as PublicTrackSummary[];
}

/** Fetch one published track's data and bump its play count (fire-and-forget
 * — a failed bump must not block loading the track). */
export async function fetchTrack(id: string): Promise<TrackFile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('tracks')
    .select('data, plays')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[tracks] fetch failed:', error.message);
    return null;
  }
  const row = data as { data: TrackFile; plays: number };
  void supabase.from('tracks').update({ plays: row.plays + 1 }).eq('id', id).then(({ error: bumpErr }) => {
    if (bumpErr) console.error('[tracks] play-count bump failed:', bumpErr.message);
  });
  return row.data;
}
