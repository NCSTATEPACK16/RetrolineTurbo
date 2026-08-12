import { supabase } from './supabase.js';

export type LinkEmailResult = 'ok' | 'no-backend' | 'error';

/** Step 1 of anonymous->permanent upgrade (Supabase docs: "Convert an
 * anonymous user to a permanent user"). Sends a confirmation email/OTP; the
 * user stays anonymous until they verify it. Requires "manual linking" to be
 * enabled in the Supabase dashboard (Authentication -> Settings) — a manual
 * step, same category as the Phase 8 schema-exposure step. */
export async function linkEmail(email: string): Promise<LinkEmailResult> {
  if (!supabase) return 'no-backend';
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    console.error('[account] link email failed:', error.message);
    return 'error';
  }
  return 'ok';
}

/** Step 2, after the user has verified the email: set a password so they can
 * sign back in without the magic link/OTP. */
export async function setPassword(password: string): Promise<LinkEmailResult> {
  if (!supabase) return 'no-backend';
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('[account] set password failed:', error.message);
    return 'error';
  }
  return 'ok';
}

/** True once the current session's identity is no longer anonymous. */
export async function isAccountLinked(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  return data.user ? !data.user.is_anonymous : false;
}
