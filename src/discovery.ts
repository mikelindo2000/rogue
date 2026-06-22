/* Monster discovery — meta-progression that persists across runs.
 *
 * The bestiary only reveals monsters the player has actually encountered.
 * Discovery is intentionally NOT part of GameEngine run state: it survives
 * death and new runs, so it loads/saves through localStorage the same way
 * `loadConfig`/`saveConfig` do, and is keyed by a stable monster id slug.
 *
 * Three tiers gate how much a card reveals:
 *   unknown  — never in the player's FOV; shown as a locked silhouette
 *   seen     — entered FOV at least once; name + coarse stat bands
 *   defeated — killed at least once; exact stats + cinematic preview
 */

const STORAGE_KEY = 'rogue_discovery';
const VERSION = 1;

export type MonsterTier = 'unknown' | 'seen' | 'defeated';

export interface DiscoveryState {
  version: number;
  /** Monsters that have entered the player's FOV at least once. */
  seen: Record<string, true>;
  /** Monsters the player has killed at least once. */
  defeated: Record<string, true>;
  /** Lifetime kills per monster. */
  killCount: Record<string, number>;
  /** Dungeon floor the monster was first sighted on. */
  firstSeenFloor: Record<string, number>;
}

/** A stable, rename-tolerant slug derived from a monster's name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable discovery key for a monster template or live monster. Prefers an
 *  explicit `id`, falling back to a slug of the name. */
export function monsterId(m: { id?: string; name: string }): string {
  return m.id ?? slugify(m.name);
}

export function emptyDiscovery(): DiscoveryState {
  return { version: VERSION, seen: {}, defeated: {}, killCount: {}, firstSeenFloor: {} };
}

export function tierOf(state: DiscoveryState, id: string): MonsterTier {
  if (state.defeated[id]) return 'defeated';
  if (state.seen[id]) return 'seen';
  return 'unknown';
}

/** Record a sighting. Returns true only the first time a monster is seen, so
 *  callers can persist/notify just when the set actually grows. */
export function markSeen(state: DiscoveryState, id: string, floor: number): boolean {
  if (state.seen[id]) return false;
  state.seen[id] = true;
  state.firstSeenFloor[id] = floor;
  return true;
}

/** Record a kill. Implies (and back-fills) seen. */
export function markDefeated(state: DiscoveryState, id: string, floor = 0): void {
  if (!state.seen[id]) markSeen(state, id, floor);
  state.defeated[id] = true;
  state.killCount[id] = (state.killCount[id] ?? 0) + 1;
}

/** Number of monsters revealed (seen or defeated). */
export function discoveredCount(state: DiscoveryState): number {
  return Object.keys(state.seen).length;
}

// --- Coarse stat bands for the "seen" tier (no exact numbers leaked) --------

const HP_BANDS: Array<[number, string]> = [
  [40, 'Frail'],
  [90, 'Sturdy'],
  [180, 'Tough'],
  [300, 'Hardy'],
  [Infinity, 'Monstrous'],
];

const ATK_BANDS: Array<[number, string]> = [
  [4, 'Harmless'],
  [9, 'Dangerous'],
  [15, 'Fierce'],
  [22, 'Brutal'],
  [Infinity, 'Deadly'],
];

function band(bands: Array<[number, string]>, value: number): string {
  for (const [ceil, label] of bands) if (value <= ceil) return label;
  return bands[bands.length - 1][1];
}

export const hpBand = (hp: number): string => band(HP_BANDS, hp);
export const atkBand = (atk: number): string => band(ATK_BANDS, atk);

// --- Persistence ------------------------------------------------------------

function migrate(parsed: unknown): DiscoveryState {
  const base = emptyDiscovery();
  if (!parsed || typeof parsed !== 'object') return base;
  const p = parsed as Partial<DiscoveryState>;
  return {
    version: VERSION,
    seen: { ...(p.seen ?? {}) },
    defeated: { ...(p.defeated ?? {}) },
    killCount: { ...(p.killCount ?? {}) },
    firstSeenFloor: { ...(p.firstSeenFloor ?? {}) },
  };
}

export function loadDiscovery(): DiscoveryState {
  try {
    if (typeof localStorage === 'undefined') return emptyDiscovery();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyDiscovery();
    return migrate(JSON.parse(saved));
  } catch (e) {
    console.error('Failed to load monster discovery', e);
    return emptyDiscovery();
  }
}

export function saveDiscovery(state: DiscoveryState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save monster discovery', e);
  }
}

/** A plain snapshot copy for the reactive UI store (so Svelte sees a new
 *  object on each change rather than a mutated-in-place reference). */
export function snapshotDiscovery(state: DiscoveryState): DiscoveryState {
  return {
    version: state.version,
    seen: { ...state.seen },
    defeated: { ...state.defeated },
    killCount: { ...state.killCount },
    firstSeenFloor: { ...state.firstSeenFloor },
  };
}
