import { supabase } from './supabase.js';
import { SupabaseBackend } from './SupabaseBackend.js';
import { LocalStorageSaveBackend } from '../economy/save.js';
import type { SaveBackend } from '../economy/save.js';

/** Real backend when configured, offline localStorage otherwise — one call
 * site so main.ts never branches on `supabase` itself. */
export function chooseSaveBackend(): SaveBackend {
  return supabase ? new SupabaseBackend() : new LocalStorageSaveBackend();
}
