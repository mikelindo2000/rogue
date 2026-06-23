import { describe, it, expect } from 'vitest';
import { defineStore } from './store';

/** Minimal in-memory `Storage` so the adapter can be tested in the `node`
 *  vitest env without jsdom. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

export function makeMemoryStorage(): Storage {
  return new MemoryStorage();
}

interface Sample {
  a: number;
  b: string;
  nested: { x: boolean };
}

const defaults: Sample = { a: 1, b: 'hi', nested: { x: false } };

describe('defineStore', () => {
  it('returns defaults when the backend has no key', () => {
    const store = defineStore<Sample>({
      key: 'k',
      version: 1,
      defaults,
      backend: makeMemoryStorage(),
    });
    expect(store.load()).toEqual(defaults);
  });

  it('round-trips: save(x) then load() deep-equals x', () => {
    const store = defineStore<Sample>({
      key: 'k',
      version: 1,
      defaults,
      backend: makeMemoryStorage(),
    });
    const value: Sample = { a: 42, b: 'bye', nested: { x: true } };
    store.save(value);
    expect(store.load()).toEqual(value);
  });

  it('returns defaults and does not throw on corrupt JSON', () => {
    const backend = makeMemoryStorage();
    backend.setItem('k', '{not valid json');
    const store = defineStore<Sample>({ key: 'k', version: 1, defaults, backend });
    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual(defaults);
  });

  it('returns fallback on version mismatch with no migrate', () => {
    const backend = makeMemoryStorage();
    backend.setItem('k', JSON.stringify({ v: 0, data: { a: 99, b: 'old', nested: { x: true } } }));
    const store = defineStore<Sample>({ key: 'k', version: 1, defaults, backend });
    expect(store.load()).toEqual(defaults);
  });

  it('uses migrate result on version mismatch', () => {
    const backend = makeMemoryStorage();
    backend.setItem('k', JSON.stringify({ v: 0, data: { legacy: 7 } }));
    const store = defineStore<Sample>({
      key: 'k',
      version: 1,
      defaults,
      backend,
      migrate: (rawData, storedVersion) => {
        expect(storedVersion).toBe(0);
        const legacy = (rawData as { legacy: number }).legacy;
        return { a: legacy, b: 'migrated', nested: { x: true } };
      },
    });
    expect(store.load()).toEqual({ a: 7, b: 'migrated', nested: { x: true } });
  });

  it('falls back when migrate returns null', () => {
    const backend = makeMemoryStorage();
    backend.setItem('k', JSON.stringify({ v: 0, data: { legacy: 7 } }));
    const store = defineStore<Sample>({
      key: 'k',
      version: 1,
      defaults,
      backend,
      migrate: () => null,
    });
    expect(store.load()).toEqual(defaults);
  });

  it('swallows a thrown QuotaExceededError on save', () => {
    const inner = makeMemoryStorage();
    const backend: Storage = {
      get length() {
        return inner.length;
      },
      getItem: (k) => inner.getItem(k),
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: (k) => inner.removeItem(k),
      clear: () => inner.clear(),
      key: (i) => inner.key(i),
    };
    const store = defineStore<Sample>({ key: 'k', version: 1, defaults, backend });
    expect(() => store.save({ a: 5, b: 'x', nested: { x: true } })).not.toThrow();
    // load still works (nothing was written), returns defaults, no throw escapes.
    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual(defaults);
  });

  it('is a no-op when backend is null', () => {
    const store = defineStore<Sample>({ key: 'k', version: 1, defaults, backend: null });
    expect(store.load()).toEqual(defaults);
    expect(() => store.save({ a: 5, b: 'x', nested: { x: true } })).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    // save was a no-op, so load still returns defaults.
    expect(store.load()).toEqual(defaults);
  });

  it('uses a custom fallback when there is no valid stored value', () => {
    const fallbackValue: Sample = { a: -1, b: 'fb', nested: { x: true } };
    const store = defineStore<Sample>({
      key: 'k',
      version: 1,
      defaults,
      fallback: () => fallbackValue,
      backend: makeMemoryStorage(),
    });
    expect(store.load()).toEqual(fallbackValue);
  });

  it('update(patch) shallow-merges and persists', () => {
    const backend = makeMemoryStorage();
    const store = defineStore<Sample>({ key: 'k', version: 1, defaults, backend });
    store.save({ a: 1, b: 'hi', nested: { x: false } });
    const next = store.update({ a: 10 });
    expect(next).toEqual({ a: 10, b: 'hi', nested: { x: false } });
    expect(store.load()).toEqual({ a: 10, b: 'hi', nested: { x: false } });
  });

  it('clear() removes the persisted value', () => {
    const backend = makeMemoryStorage();
    const store = defineStore<Sample>({ key: 'k', version: 1, defaults, backend });
    store.save({ a: 9, b: 'z', nested: { x: true } });
    store.clear();
    expect(store.load()).toEqual(defaults);
  });
});
