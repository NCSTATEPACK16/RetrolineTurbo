/**
 * SaveBackend seam (plan.md §8): game systems persist through this interface
 * only. LocalStorage adapter now; SupabaseBackend implements the same contract
 * in Phase 8, so consumers swap backends without code changes. Async by
 * contract for that reason even though localStorage is synchronous.
 */
export interface SaveBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** In-memory adapter for tests and non-persistent contexts. */
export class MemorySaveBackend implements SaveBackend {
  private readonly store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
}

const NS = 'retroline:';

/** Browser localStorage adapter. Keys are namespaced to avoid collisions. */
export class LocalStorageSaveBackend implements SaveBackend {
  get(key: string): Promise<string | null> {
    return Promise.resolve(localStorage.getItem(NS + key));
  }

  set(key: string, value: string): Promise<void> {
    localStorage.setItem(NS + key, value);
    return Promise.resolve();
  }
}
