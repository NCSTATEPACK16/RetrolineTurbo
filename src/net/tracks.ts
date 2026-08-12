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
