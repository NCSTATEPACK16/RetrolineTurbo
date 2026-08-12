import { supabase, ensureAnonSession } from './supabase.js';
import type { SaveBackend } from '../economy/save.js';

/**
 * Supabase-backed SaveBackend. The whole flat key-value store (control
 * bindings, local editor track drafts) lives as one JSON object in
 * `retroline.saves.settings`, keyed by the authenticated user — the `saves`
 * table's typed columns (credits, owned_cars, …) are Phase 9's, unwritten
 * today. Reads are cached in memory after the first fetch so repeated
 * get()/set() calls don't round-trip per key.
 */
export class SupabaseBackend implements SaveBackend {
  private cache: Record<string, string> | null = null;
  private userId: string | null = null;

  private async ensureLoaded(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    const session = await ensureAnonSession();
    if (!supabase || !session) {
      this.cache = {};
      return this.cache;
    }
    this.userId = session.user.id;
    const { data, error } = await supabase
      .from('saves')
      .select('settings')
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) {
      console.error('[SupabaseBackend] load failed:', error.message);
      this.cache = {};
      return this.cache;
    }
    this.cache = ((data as { settings?: Record<string, string> } | null)?.settings) ?? {};
    return this.cache;
  }

  async get(key: string): Promise<string | null> {
    const settings = await this.ensureLoaded();
    return settings[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const settings = await this.ensureLoaded();
    settings[key] = value;
    if (!supabase || !this.userId) return;
    const { error } = await supabase
      .from('saves')
      .upsert({ user_id: this.userId, settings }, { onConflict: 'user_id' });
    if (error) console.error('[SupabaseBackend] save failed:', error.message);
  }
}
