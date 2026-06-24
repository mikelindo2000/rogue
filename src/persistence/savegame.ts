/* Full-state save/restore for an in-progress run.
 *
 * Built on the generic `store.ts` adapter. Unlike settings, an invalid or
 * stale save is DISCARDED (returns `null`) rather than merged with defaults —
 * a half-restored run would be worse than a fresh one. Runtime validation
 * lives here because TypeScript types do not protect parsed JSON.
 */

import { ARMOR_SLOTS, type Player, type Monster, type Item, type StatusEffects, type TrapEffects, type TrapState } from '../types';
import type { FloorState } from '../engine';
import type { BoardSizeId } from '../boards';
import { SCROLL_TYPES, WAND_TYPES } from '../itemVisuals';
import { TRAP_KINDS } from '../traps';
import { normalizeAllGearHealth } from '../gearHealth';
import { normalizeRunStats, type RunStatsV1 } from '../runStats';
import { defineStore, resolveBackend, type Store } from './store';

const KNOWN_SCROLL_TYPES = new Set<string>(SCROLL_TYPES);
const KNOWN_TRAP_KINDS = new Set<string>(TRAP_KINDS);
const KNOWN_WAND_TYPES = new Set<string>(WAND_TYPES);

/** Backfill the wand inventory for saves written before wands existed, and
 *  sanitize per-wand runtime state. Parallel to normalizeAllGearHealth. */
function normalizeWands(player: Player): void {
  const inv = player.inventory;
  if (!Array.isArray(inv.wands)) {
    inv.wands = [];
    return;
  }
  for (const w of inv.wands) {
    if (typeof w.cooldownRemaining !== 'number' || !(w.cooldownRemaining >= 0)) {
      w.cooldownRemaining = 0;
    }
    if (w.identified === undefined) w.identified = true;
  }
}

/** Backfill the scroll inventory for saves written before it existed. Unknown
 *  carried types are already rejected in validateSaveGame; the filter here is
 *  defence-in-depth for the post-clone player. Parallel to normalizeWands. */
function normalizeScrolls(player: Player): void {
  const inv = player.inventory;
  if (!Array.isArray(inv.scrolls)) {
    inv.scrolls = [];
    return;
  }
  inv.scrolls = inv.scrolls.filter(s => KNOWN_SCROLL_TYPES.has(s as string));
}

/** In-place migration of legacy floor items from pre-overhaul (V2/V3) saves: the
 *  separate `repair_scroll` becomes a typed Scroll of Repair, and the old
 *  anonymous random-effect `scroll` (no data) becomes a Scroll of Light — a safe,
 *  always-implemented common — so stepping on it no longer silently vanishes.
 *  Mutates the array entries; non-scroll items are untouched. */
function migrateLegacyScrollItems(items: unknown[]): void {
  for (const it of items) {
    if (!isObject(it)) continue;
    if (it.type === 'repair_scroll') {
      it.type = 'scroll';
      it.data = { scrollType: 'repair' };
      if (typeof it.symbol !== 'string') it.symbol = '?';
    } else if (it.type === 'scroll' && it.data == null) {
      it.data = { scrollType: 'light' };
    }
  }
}

export interface SaveGameV2 {
  seed: number;
  rngState: number;
  /** Board size for this run (see boards.ts). Optional: saves written before
   *  configurable board sizes lack it and restore resolves to classic 46x29,
   *  which matches their stored grid dimensions. */
  boardSize?: BoardSizeId;
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
  traps?: TrapState[];
  trapEffects?: TrapEffects;
  floorStates: [number, FloorState][];
  searchHintShown: boolean;
  secretsFoundThisRun: number;
  stats: RunStatsV1;
}

const STORAGE_KEY = 'rogue_savegame';
const VERSION = 4;

function store(backend?: Storage | null): Store<SaveGameV2 | null> {
  return defineStore<SaveGameV2 | null>({
    key: STORAGE_KEY,
    version: VERSION,
    defaults: null,
    fallback: () => null,
    // V2 -> V3 added inventory.wands (+ per-wand cooldown). V3 -> V4 retired the
    // anonymous random-effect scroll and the separate repair_scroll floor item in
    // favour of the typed scroll catalog. All three on-disk shapes are otherwise
    // compatible, so a V2/V3 blob is handed straight to validateSaveGame, which
    // backfills wands (normalizeWands) and migrates legacy scroll items
    // (migrateLegacyScrollItems). Older versions are discarded. Coordinate further
    // bumps with the rings / potion-dipping plans.
    migrate: (data, storedVersion) =>
      (storedVersion === 2 || storedVersion === 3) && data ? (data as SaveGameV2) : null,
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

function validateTrapArray(traps: unknown, map: unknown): traps is TrapState[] {
  if (!Array.isArray(traps) || !Array.isArray(map)) return false;
  for (const trap of traps) {
    if (!isObject(trap)) return false;
    if (typeof trap.id !== 'string' || !KNOWN_TRAP_KINDS.has(trap.kind as string)) return false;
    if (!Number.isFinite(trap.x) || !Number.isFinite(trap.y)) return false;
    if (!Number.isInteger(trap.x) || !Number.isInteger(trap.y)) return false;
    const x = trap.x as number;
    const y = trap.y as number;
    if (y < 0 || y >= map.length) return false;
    const row = map[y];
    if (!Array.isArray(row) || x < 0 || x >= row.length) return false;
    if (typeof trap.revealed !== 'boolean' || typeof trap.armed !== 'boolean') return false;
  }
  return true;
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
  // Upgrade legacy scroll floor items (repair_scroll / anonymous scroll) before
  // validating, so a pre-overhaul save loads as typed scrolls instead of rejecting.
  migrateLegacyScrollItems(raw.items);
  for (const it of raw.items) {
    if (!isObject(it)) return null;
    if (typeof it.x !== 'number' || typeof it.y !== 'number' || typeof it.type !== 'string') return null;
    // Every typed scroll must carry a known scrollType — guard against a corrupt
    // or future-version blob splicing an unknown type into the scroll inventory.
    if (it.type === 'scroll') {
      if (!isObject(it.data) || !KNOWN_SCROLL_TYPES.has(it.data.scrollType as string)) return null;
    }
    // A wand floor item must carry a known wandType — guard against a corrupt or
    // future-version blob splicing an unknown wand into the world.
    if (it.type === 'wand') {
      if (!isObject(it.data) || !KNOWN_WAND_TYPES.has(it.data.wandType as string)) return null;
    }
  }

  if (raw.traps !== undefined) {
    if (!validateTrapArray(raw.traps, raw.map)) return null;
  }

  if (raw.trapEffects !== undefined) {
    if (!isObject(raw.trapEffects)) return null;
    for (const k of ['bearTrapTurns', 'sleepTurns', 'strengthDrained']) {
      if (typeof raw.trapEffects[k] !== 'number') return null;
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
    migrateLegacyScrollItems(fs.items as unknown[]);
    for (const it of fs.items as unknown[]) {
      if (!isObject(it)) return null;
      if (typeof it.x !== 'number' || typeof it.y !== 'number' || typeof it.type !== 'string') return null;
      if (it.type === 'scroll') {
        if (!isObject(it.data) || !KNOWN_SCROLL_TYPES.has(it.data.scrollType as string)) return null;
      }
      if (it.type === 'wand') {
        if (!isObject(it.data) || !KNOWN_WAND_TYPES.has(it.data.wandType as string)) return null;
      }
    }
    if (fs.traps !== undefined && !validateTrapArray(fs.traps, fs.map)) return null;
  }

  // Basic player structure — restore() and the HUD dereference these directly.
  const p = raw.player;
  if (!isObject(p)) return null;
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.hp !== 'number' || typeof p.maxHp !== 'number') {
    return null;
  }
  if (!isObject(p.inventory) || !isObject(p.equipped)) return null;
  if (!Array.isArray(p.inventory.shield)) return null;
  for (const slot of ARMOR_SLOTS) {
    if (!Array.isArray(p.inventory[slot])) return null;
  }
  // `wands` is optional for backward compat (V2 saves lack it — backfilled
  // below). When present it must be an array of well-typed wands; a malformed
  // entry rejects the whole blob rather than silently dropping items.
  if (p.inventory.wands !== undefined) {
    if (!Array.isArray(p.inventory.wands)) return null;
    for (const w of p.inventory.wands) {
      if (!isObject(w) || !KNOWN_WAND_TYPES.has(w.wandType as string)) return null;
    }
  }
  // `scrolls` is the carried scroll stack. Optional for backward compat (very old
  // saves predate it — backfilled below). When present every entry must be a
  // known scroll type; an unknown type rejects the blob rather than splicing a
  // bad value into the read flow.
  if (p.inventory.scrolls !== undefined) {
    if (!Array.isArray(p.inventory.scrolls)) return null;
    for (const s of p.inventory.scrolls) {
      if (!KNOWN_SCROLL_TYPES.has(s as string)) return null;
    }
  }

  const stats = normalizeRunStats(raw.stats, raw.seed as number);
  if (!stats) return null;
  const player = structuredClone(raw.player) as Player;
  normalizeAllGearHealth(player);
  normalizeWands(player);
  normalizeScrolls(player);

  return {
    ...(raw as unknown as Omit<SaveGameV2, 'stats'>),
    player,
    traps: (raw.traps as TrapState[] | undefined) ?? [],
    trapEffects: (raw.trapEffects as TrapEffects | undefined) ?? { bearTrapTurns: 0, sleepTurns: 0, strengthDrained: 0 },
    stats,
  };
}
