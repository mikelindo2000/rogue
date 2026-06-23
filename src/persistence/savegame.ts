/* Full-state save/restore for an in-progress run.
 *
 * Built on the generic `store.ts` adapter. Unlike settings, an invalid or
 * stale save is DISCARDED (returns `null`) rather than merged with defaults —
 * a half-restored run would be worse than a fresh one. Runtime validation
 * lives here because TypeScript types do not protect parsed JSON.
 */

import type { Player, Monster, Item, StatusEffects } from '../types';
import type { FloorState } from '../engine';
import { SCROLL_TYPES } from '../itemVisuals';
import { normalizeRunStats, type RunStatsV1 } from '../runStats';
import { defineStore, resolveBackend, type Store } from './store';

const KNOWN_SCROLL_TYPES = new Set<string>(SCROLL_TYPES);

export interface SaveGameV2 {
  seed: number;
  rngState: number;
  player: Player;
  dungeonFloor: number;
  turn: number;
  gameOver: boolean;
  gameWon: boolean;
  logs: string[];
  statusEffects: StatusEffects;
  map: string[][];
  explored: boolean[][];
  /** Per-tile darkness. Optional: saves written before dark rooms lack it and
   *  restore treats a missing grid as all-lit. */
  dark?: boolean[][];
  monsters: Monster[];
  items: Item[];
  floorStates: [number, FloorState][];
  searchHintShown: boolean;
  secretsFoundThisRun: number;
  stats: RunStatsV1;
}

const STORAGE_KEY = 'rogue_savegame';
const VERSION = 2;

function store(backend?: Storage | null): Store<SaveGameV2 | null> {
  return defineStore<SaveGameV2 | null>({
    key: STORAGE_KEY,
    version: VERSION,
    defaults: null,
    fallback: () => null,
    backend: backend !== undefined ? backend : resolveBackend(),
  });
}

export function loadSaveGame(backend?: Storage | null): SaveGameV2 | null {
  const raw = store(backend).load();
  return validateSaveGame(raw);
}

export function saveSaveGame(save: SaveGameV2, backend?: Storage | null): void {
  store(backend).save(save);
}

export function clearSaveGame(backend?: Storage | null): void {
  store(backend).clear();
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isGridOfArrays(v: unknown): boolean {
  return Array.isArray(v) && v.every(row => Array.isArray(row));
}

/**
 * Runtime validation of a parsed save blob. Returns the value typed as
 * `SaveGameV2` only when every required field is present and well-typed;
 * otherwise `null`. Unknown extra fields are ignored.
 */
export function validateSaveGame(raw: unknown): SaveGameV2 | null {
  if (!isObject(raw)) return null;

  const numericFields = ['seed', 'rngState', 'turn', 'dungeonFloor', 'secretsFoundThisRun'];
  for (const f of numericFields) {
    if (typeof raw[f] !== 'number') return null;
  }

  if (!Number.isFinite(raw.dungeonFloor) || (raw.dungeonFloor as number) < 1 || (raw.dungeonFloor as number) > 20) {
    return null;
  }

  if (typeof raw.gameOver !== 'boolean') return null;
  if (typeof raw.gameWon !== 'boolean') return null;
  if (typeof raw.searchHintShown !== 'boolean') return null;

  if (!Array.isArray(raw.logs) || !raw.logs.every(l => typeof l === 'string')) return null;

  const se = raw.statusEffects;
  if (!isObject(se)) return null;
  for (const k of ['vigorTurns', 'midasTurns', 'strengthTurns', 'invisTurns', 'armorTurns']) {
    if (typeof se[k] !== 'number') return null;
  }

  if (!Array.isArray(raw.map) || raw.map.length === 0 || !raw.map.every(row => Array.isArray(row))) return null;

  // `explored` must mirror `map`'s dimensions exactly — restore()/updateFOV()
  // index both by the same [y][x], so a mismatch would read out of bounds.
  if (!Array.isArray(raw.explored) || raw.explored.length !== raw.map.length) return null;
  for (let y = 0; y < raw.explored.length; y++) {
    const row = raw.explored[y];
    if (!Array.isArray(row) || row.length !== (raw.map[y] as unknown[]).length) return null;
  }

  // `dark` is optional (older saves omit it). When present it must mirror `map`'s
  // dimensions exactly — restore()/updateFOV() index it by the same [y][x].
  if (raw.dark !== undefined) {
    if (!Array.isArray(raw.dark) || raw.dark.length !== raw.map.length) return null;
    for (let y = 0; y < raw.dark.length; y++) {
      const row = raw.dark[y];
      if (!Array.isArray(row) || row.length !== (raw.map[y] as unknown[]).length) return null;
    }
  }

  if (!Array.isArray(raw.monsters)) return null;
  for (const m of raw.monsters) {
    if (!isObject(m)) return null;
    if (typeof m.x !== 'number' || typeof m.y !== 'number' || typeof m.hp !== 'number' || typeof m.name !== 'string') {
      return null;
    }
  }

  if (!Array.isArray(raw.items)) return null;
  for (const it of raw.items) {
    if (!isObject(it)) return null;
    if (typeof it.x !== 'number' || typeof it.y !== 'number' || typeof it.type !== 'string') return null;
    // A typed scroll must carry a known scrollType — guard against a corrupt or
    // future-version blob splicing an undefined type into the scroll inventory.
    if (it.type === 'scroll' && it.data !== undefined) {
      if (!isObject(it.data) || !KNOWN_SCROLL_TYPES.has(it.data.scrollType as string)) return null;
    }
  }

  if (!Array.isArray(raw.floorStates)) return null;
  for (const entry of raw.floorStates) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [floor, fs] = entry;
    if (typeof floor !== 'number' || floor < 1 || floor > 20) return null;
    if (!isObject(fs)) return null;
    if (!isGridOfArrays(fs.map) || !isGridOfArrays(fs.explored)) return null;
    // `dark` is optional per floor (pre-dark-rooms saves omit it); when present it
    // must mirror that floor's map dimensions, same as the top-level dark grid.
    if (fs.dark !== undefined) {
      if (!isGridOfArrays(fs.dark) || (fs.dark as unknown[]).length !== (fs.map as unknown[]).length) return null;
      const fsMap = fs.map as unknown[];
      const fsDark = fs.dark as unknown[];
      for (let y = 0; y < fsDark.length; y++) {
        if ((fsDark[y] as unknown[]).length !== (fsMap[y] as unknown[]).length) return null;
      }
    }
    if (!Array.isArray(fs.monsters) || !Array.isArray(fs.items)) return null;
  }

  // Basic player structure — restore() and the HUD dereference these directly.
  const p = raw.player;
  if (!isObject(p)) return null;
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.hp !== 'number' || typeof p.maxHp !== 'number') {
    return null;
  }
  if (!isObject(p.inventory) || !isObject(p.equipped)) return null;

  const stats = normalizeRunStats(raw.stats, raw.seed as number);
  if (!stats) return null;

  return { ...(raw as unknown as Omit<SaveGameV2, 'stats'>), stats };
}
