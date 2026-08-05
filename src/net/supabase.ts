import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase edge module. This is the ONLY place the game core talks to the
 * backend; everything above it goes through narrow adapters (e.g. SaveBackend).
 *
 * The anon key is public by design — all row protection is enforced by RLS
 * policies (see supabase/migrations/0001_init.sql), never by client-side checks.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail loud in dev; a missing key means saves/leaderboards silently break.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — ' +
      'backend features are disabled. Copy .env.example to .env.',
  );
}

export const supabase: SupabaseClient = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Ensure there is an authenticated session, signing in anonymously if needed.
 * Anonymous auth is acceptable for a web arcade and can be upgraded to
 * email/OAuth later without losing the row's `user_id`.
 */
export async function ensureAnonSession(): Promise<Session | null> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('[supabase] anonymous sign-in failed:', error.message);
    return null;
  }
  return data.session;
}
