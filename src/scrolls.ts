/* Pure data + helpers for the scroll line: the effect registry, floor-gated
 * spawn weighting, and small classifiers. Effect *execution* lives in the engine
 * (it mutates map/player/monsters); this module stays side-effect free so it is
 * trivially unit-testable. Mirrors the shape of src/wands.ts.
 *
 * See design/planning/scrolls_overhaul_plan.md. */

import type { Rarity, ScrollType } from './types';
import type { RNG } from './rng';

/** What a scroll needs the player to choose before it resolves. `inventory-item`
 *  opens the shared item-target picker; `none` resolves immediately on read. */
export type ScrollTarget = 'none' | 'inventory-item';

export interface ScrollDefinition {
  type: ScrollType;
  /** Display name without the "Scroll of" prefix (Blank Paper has no prefix). */
  name: string;
  /** Whether the UI should render the name as "Scroll of {name}". */
  scrollOf: boolean;
  /** One-line label for the inventory list. */
  summary: string;
  /** Longer description for the detail pane / tooltip. */
  detail: string;
  /** First floor this scroll can spawn on. */
  minFloor: number;
  rarity: Rarity;
  /** A scroll the player generally does not want to read. Kept in the pool —
   *  risk happens on read, not on pickup. */
  harmful: boolean;
  needsTarget: ScrollTarget;
  /** When true, a read that accomplishes nothing the player could foresee (Light
   *  in a lit room, Repair with no damage) keeps the scroll and spends no turn. */
  noOpKeepsScroll: boolean;
}

/** The full catalog. Single source of truth for spawn gating, inventory labels,
 *  tooltips, end-run summaries, and art prompt tables. */
export const SCROLLS: Record<ScrollType, ScrollDefinition> = {
  light: {
    type: 'light', name: 'Light', scrollOf: true,
    summary: 'Floods the current dark room with light.',
    detail: 'Permanently lights the room you stand in. Useless in a lit room or a corridor — there it reveals nothing and is kept.',
    minFloor: 1, rarity: 'common', harmful: false, needsTarget: 'none', noOpKeepsScroll: true,
  },
  repair: {
    type: 'repair', name: 'Repair', scrollOf: true,
    summary: 'Mends all carried armor and shields.',
    detail: 'Restores the health of every piece of armor and every shield you carry. Kept if nothing is damaged.',
    minFloor: 1, rarity: 'uncommon', harmful: false, needsTarget: 'none', noOpKeepsScroll: true,
  },
  magic_mapping: {
    type: 'magic_mapping', name: 'Magic Mapping', scrollOf: true,
    summary: 'Reveals the layout of the current floor.',
    detail: 'Charts every room and corridor on this floor at once. Kept if the floor is already fully explored.',
    minFloor: 3, rarity: 'uncommon', harmful: false, needsTarget: 'none', noOpKeepsScroll: true,
  },
  monster_detection: {
    type: 'monster_detection', name: 'Monster Detection', scrollOf: true,
    summary: 'Senses every monster on this floor.',
    detail: 'For a short time, monster glyphs pulse through walls and darkness. They are sensed, not in sight.',
    minFloor: 5, rarity: 'uncommon', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
  teleportation: {
    type: 'teleportation', name: 'Teleportation', scrollOf: true,
    summary: 'Whisks you to a random safe tile.',
    detail: 'Relocates you elsewhere on the floor — an escape, but you cannot choose where you land.',
    minFloor: 1, rarity: 'common', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
  hold_monster: {
    type: 'hold_monster', name: 'Hold Monster', scrollOf: true,
    summary: 'Freezes nearby monsters in place.',
    detail: 'Holds every monster in sight, stopping them cold for several turns.',
    minFloor: 3, rarity: 'uncommon', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
  sleep: {
    type: 'sleep', name: 'Sleep', scrollOf: true,
    summary: 'Puts YOU to sleep. A bad scroll.',
    detail: 'The classic Rogue trap scroll: reading it sends you to sleep for several turns while monsters close in.',
    minFloor: 1, rarity: 'common', harmful: true, needsTarget: 'none', noOpKeepsScroll: false,
  },
  create_monster: {
    type: 'create_monster', name: 'Create Monster', scrollOf: true,
    summary: 'Summons a monster beside you.',
    detail: 'Conjures a floor-appropriate monster on an adjacent tile. Rarely what you want.',
    minFloor: 3, rarity: 'uncommon', harmful: true, needsTarget: 'none', noOpKeepsScroll: false,
  },
  aggravate_monsters: {
    type: 'aggravate_monsters', name: 'Aggravate Monsters', scrollOf: true,
    summary: 'Wakes and enrages every monster.',
    detail: 'Every monster on the floor wakes and hunts you at once. A bad scroll.',
    minFloor: 7, rarity: 'uncommon', harmful: true, needsTarget: 'none', noOpKeepsScroll: false,
  },
  enchant_weapon: {
    type: 'enchant_weapon', name: 'Enchant Weapon', scrollOf: true,
    summary: 'Strengthens a weapon you carry.',
    detail: 'Adds damage to a chosen weapon. Defaults to your equipped weapon.',
    minFloor: 7, rarity: 'rare', harmful: false, needsTarget: 'inventory-item', noOpKeepsScroll: true,
  },
  enchant_armor: {
    type: 'enchant_armor', name: 'Enchant Armor', scrollOf: true,
    summary: 'Strengthens a piece of armor you carry.',
    detail: 'Adds defense to a chosen piece of armor and restores its health. Defaults to equipped armor.',
    minFloor: 7, rarity: 'rare', harmful: false, needsTarget: 'inventory-item', noOpKeepsScroll: true,
  },
  protect_armor: {
    type: 'protect_armor', name: 'Protect Armor', scrollOf: true,
    summary: 'Shields a piece of armor from wear.',
    detail: 'Wards a chosen piece of armor against the next round of gear-health wear.',
    minFloor: 13, rarity: 'rare', harmful: false, needsTarget: 'inventory-item', noOpKeepsScroll: true,
  },
  remove_curse: {
    type: 'remove_curse', name: 'Remove Curse', scrollOf: true,
    summary: 'Lifts curses from your gear.',
    detail: 'Removes curses from carried and equipped items. (No items are cursed yet — reserved for the curse system.)',
    minFloor: 13, rarity: 'uncommon', harmful: false, needsTarget: 'inventory-item', noOpKeepsScroll: true,
  },
  identify: {
    type: 'identify', name: 'Identify', scrollOf: true,
    summary: 'Reveals the true nature of an item.',
    detail: 'Identifies a chosen item. (Everything currently spawns identified — reserved for the identification system.)',
    minFloor: 5, rarity: 'uncommon', harmful: false, needsTarget: 'inventory-item', noOpKeepsScroll: true,
  },
  food_detection: {
    type: 'food_detection', name: 'Food Detection', scrollOf: true,
    summary: 'Senses food on the floor.',
    detail: 'Reveals the location of any food on the current floor.',
    minFloor: 3, rarity: 'common', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
  gold_detection: {
    type: 'gold_detection', name: 'Gold Detection', scrollOf: true,
    summary: 'Senses gold on the floor.',
    detail: 'Reveals the location of any gold caches on the current floor.',
    minFloor: 3, rarity: 'common', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
  monster_confusion: {
    type: 'monster_confusion', name: 'Monster Confusion', scrollOf: true,
    summary: 'Your next hit confuses a monster.',
    detail: 'Your hands glow. The next monster you strike in melee is left confused.',
    minFloor: 7, rarity: 'rare', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
  scare_monster: {
    type: 'scare_monster', name: 'Scare Monster', scrollOf: true,
    summary: 'Frightens monsters away from you.',
    detail: 'Monsters in sight recoil in fear and flee for several turns.',
    minFloor: 9, rarity: 'rare', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
  blank_paper: {
    type: 'blank_paper', name: 'Blank Paper', scrollOf: false,
    summary: 'Unmarked parchment. Nothing happens.',
    detail: 'A blank scroll. Reading it does nothing — the classic Rogue fizzle.',
    minFloor: 1, rarity: 'common', harmful: false, needsTarget: 'none', noOpKeepsScroll: false,
  },
};

/** Full display name, e.g. "Scroll of Light" or "Blank Paper". */
export function scrollDisplayName(type: ScrollType): string {
  const def = SCROLLS[type];
  return def.scrollOf ? `Scroll of ${def.name}` : def.name;
}

export function scrollDefinition(type: ScrollType): ScrollDefinition {
  return SCROLLS[type];
}

/** Spawn role. Drives the weight band a scroll falls into and lets tests assert
 *  "risky + dud scrolls stay rare" without pinning exact distributions. */
export type ScrollRole = 'core' | 'situational' | 'risky' | 'dud';

/** Floor-band cutoffs. early = 1..earlyMax, mid = earlyMax+1..midMax, deep = rest.
 *  See design/planning/scroll_consistency_and_drop_items_plan.md (A2 Revised). */
export const SCROLL_BANDS = { earlyMax: 6, midMax: 12 } as const;
export type ScrollBand = 'early' | 'mid' | 'deep';

export function scrollBand(floor: number): ScrollBand {
  if (floor <= SCROLL_BANDS.earlyMax) return 'early';
  if (floor <= SCROLL_BANDS.midMax) return 'mid';
  return 'deep';
}

/** Per-scroll spawn weighting, intentional rather than derived from rarity alone.
 *  `minFloor` on the ScrollDefinition still gates eligibility; these weights then
 *  set the relative odds within a floor band. A weight of 0 keeps the scroll
 *  eligible nowhere in that band (it still exists for pickup/read). */
export interface ScrollSpawnTuning {
  role: ScrollRole;
  early: number;
  mid: number;
  deep: number;
}

/** Spawn tuning for the implemented scrolls. Keyed loosely (Partial) because the
 *  catalog defines scrolls whose effects are not wired up yet; those never spawn
 *  and need no tuning. A test asserts every IMPLEMENTED_SCROLLS entry is present. */
export const SCROLL_TUNING: Partial<Record<ScrollType, ScrollSpawnTuning>> = {
  // core utility — the backbone of the scroll economy under visible names.
  light:          { role: 'core',        early: 20, mid: 10, deep: 8 },
  teleportation:  { role: 'core',        early: 10, mid: 10, deep: 10 },
  repair:         { role: 'core',        early: 8,  mid: 8,  deep: 8 },
  magic_mapping:  { role: 'core',        early: 8,  mid: 8,  deep: 8 },
  hold_monster:   { role: 'core',        early: 8,  mid: 8,  deep: 8 },
  // build scrolls — gated to floor 7+, low but meaningful.
  enchant_weapon: { role: 'core',        early: 0,  mid: 5,  deep: 6 },
  enchant_armor:  { role: 'core',        early: 0,  mid: 5,  deep: 6 },
  // situational detection — useful in context, not staple filler.
  food_detection: { role: 'situational', early: 5,  mid: 4,  deep: 3 },
  gold_detection: { role: 'situational', early: 3,  mid: 2,  deep: 2 },
  monster_detection: { role: 'situational', early: 0, mid: 3, deep: 4 },
  // risky reads — rare spice with visible names, never baseline economy.
  sleep:              { role: 'risky',   early: 1,  mid: 1,  deep: 1 },
  create_monster:     { role: 'risky',   early: 1,  mid: 1,  deep: 1 },
  aggravate_monsters: { role: 'risky',   early: 0,  mid: 1,  deep: 1 },
  // dud — ultra rare until blank paper gains a real use (writing/crafting).
  blank_paper:    { role: 'dud',         early: 1,  mid: 1,  deep: 1 },
};

export interface ScrollSpawnEntry {
  type: ScrollType;
  minFloor: number;
  maxFloor?: number;
  role: ScrollRole;
  /** Relative weight by floor band. */
  early: number;
  mid: number;
  deep: number;
}

/** Scroll types whose read effect is wired up in the engine. The spawn pool is
 *  restricted to these so the player never picks up a scroll that does nothing.
 *  Unimplemented catalog entries still exist as types (for docs, inventory
 *  display, and save parity); flip them on here as each phase lands.
 *
 *  Phase 1 (live): no-target effects using existing systems.
 *  Phase 2 (partial): enchant_weapon + enchant_armor act on the equipped item
 *    (Rogue-authentic, no picker yet). protect_armor / identify / remove_curse
 *    stay pending — they need the gear-protection flag, identification, and curse
 *    systems respectively.
 *  Phase 3 (pending): monster_confusion, scare_monster — need new player/AI state. */
export const IMPLEMENTED_SCROLLS: ReadonlySet<ScrollType> = new Set<ScrollType>([
  'light', 'repair', 'magic_mapping', 'teleportation', 'hold_monster', 'sleep',
  'create_monster', 'aggravate_monsters', 'food_detection', 'gold_detection',
  'monster_detection', 'blank_paper', 'enchant_weapon', 'enchant_armor',
]);

export function isScrollImplemented(type: ScrollType): boolean {
  return IMPLEMENTED_SCROLLS.has(type);
}

/** Weighted spawn pool. Derived from SCROLL_TUNING so weights are intentional
 *  (per-role, per-band) rather than a flat function of rarity. Only implemented
 *  scrolls spawn; a scroll with no tuning entry is silently excluded. */
export const SCROLL_POOL: ScrollSpawnEntry[] = (Object.keys(SCROLLS) as ScrollType[])
  .filter(type => IMPLEMENTED_SCROLLS.has(type) && SCROLL_TUNING[type] !== undefined)
  .map(type => {
    const tuning = SCROLL_TUNING[type]!;
    return {
      type,
      minFloor: SCROLLS[type].minFloor,
      role: tuning.role,
      early: tuning.early,
      mid: tuning.mid,
      deep: tuning.deep,
    };
  });

/** Weight of an entry on a given floor: its band weight, or 0 if the floor is
 *  below the scroll's minFloor (eligibility gate) or above any maxFloor cap. */
export function scrollWeightForFloor(entry: ScrollSpawnEntry, floor: number): number {
  if (floor < entry.minFloor) return 0;
  if (entry.maxFloor !== undefined && floor > entry.maxFloor) return 0;
  return entry[scrollBand(floor)];
}

/** Pick a floor-appropriate scroll by band weight. Falls back to Light if
 *  (somehow) nothing is eligible, so a spawn never produces an invalid item. */
export function pickScrollForFloor(floor: number, rng: RNG): ScrollType {
  const eligible = SCROLL_POOL
    .map(entry => ({ entry, weight: scrollWeightForFloor(entry, floor) }))
    .filter(e => e.weight > 0);
  if (eligible.length === 0) return 'light';
  const total = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * total;
  for (const e of eligible) {
    roll -= e.weight;
    if (roll < 0) return e.entry.type;
  }
  return eligible[eligible.length - 1]!.entry.type;
}
