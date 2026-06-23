/* Generic versioned localStorage adapter — the foundation every other store
 * (settings, save game, future keybindings) builds on.
 *
 * Mirrors the I/O conventions in `src/discovery.ts`: a `typeof localStorage`
 * guard so module import stays safe in the `node` test environment, and all
 * I/O wrapped in try/catch + `console.error` so a full disk or corrupt blob
 * never crashes the game.
 *
 * Every blob is wrapped on disk as `{ v: version, data: T }`. On
 * absent/corrupt/version-mismatch it routes through `migrate` if present,
 * otherwise returns `fallback` (defaulting to `defaults`).
 */

export function resolveBackend(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

export interface StoreOptions<T> {
  key: string;
  version: number;
  defaults: T;
  migrate?: (rawData: unknown, storedVersion: number | null) => T | null;
  /** Used when there is no valid stored value; default `() => defaults`. */
  fallback?: () => T;
  /** Omit => `resolveBackend()`; explicit `null` => no-op backend. */
  backend?: Storage | null;
}

export interface Store<T> {
  /** Never throws; corrupt/absent/unmigratable → fallback. */
  load(): T;
  save(value: T): void;
  update(patch: Partial<T>): T;
  clear(): void;
}

interface Wrapped<T> {
  v: number;
  data: T;
}

export function defineStore<T>(opts: StoreOptions<T>): Store<T> {
  const { key, version, defaults, migrate } = opts;
  const backend = opts.backend === undefined ? resolveBackend() : opts.backend;
  const fallback = opts.fallback ?? (() => defaults);

  function load(): T {
    if (!backend) return fallback();
    let raw: string | null;
    try {
      raw = backend.getItem(key);
    } catch (e) {
      console.error(`Failed to read persisted store '${key}'`, e);
      return fallback();
    }
    if (raw === null) return fallback();

    let parsed: Wrapped<T>;
    try {
      parsed = JSON.parse(raw) as Wrapped<T>;
    } catch (e) {
      console.error(`Failed to parse persisted store '${key}'`, e);
      return fallback();
    }

    const storedVersion = parsed && typeof parsed.v === 'number' ? parsed.v : null;
    if (storedVersion === version) return parsed.data as T;

    if (migrate) {
      const migrated = migrate(parsed ? parsed.data : null, storedVersion);
      return migrated ?? fallback();
    }
    return fallback();
  }

  function save(value: T): void {
    if (!backend) return;
    const wrapped: Wrapped<T> = { v: version, data: value };
    try {
      backend.setItem(key, JSON.stringify(wrapped));
    } catch (e) {
      // Swallow QuotaExceededError (and any other error) so a full disk never
      // crashes the game.
      console.error(`Failed to save persisted store '${key}'`, e);
    }
  }

  function update(patch: Partial<T>): T {
    const next = { ...load(), ...patch };
    save(next);
    return next;
  }

  function clear(): void {
    if (!backend) return;
    try {
      backend.removeItem(key);
    } catch (e) {
      console.error(`Failed to clear persisted store '${key}'`, e);
    }
  }

  return { load, save, update, clear };
}
