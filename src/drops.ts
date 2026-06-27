/* Per-monster thematic loot — the GM sheet's "Drop chance when killed (items
 * specific to mobs)" column, as DATA.
 *
 * Mirrors the abilities layer's philosophy (`MONSTER_ABILITIES` in
 * src/ai/archetypes.ts): one table keyed by `monsterId`, one engine hook
 * (`dropMonsterLoot` in engine.ts), one bestiary description path
 * (`describeDrop`). A drop is data, not bespoke code.
 *
 * Phase 1 (see design/planning/monster_drops_plan.md):
 *  - Drop rates are conservative playtest knobs: normal 0.12, hero/rare 0.25,
 *    Dragon-King uniques 1.0 (guaranteed).
 *  - Gear is TIER-BOUNDED: a drop reuses `rollLootRarity(killFloor)` so it never
 *    exceeds what the floor already produces — a themed, more reliable source,
 *    not a power escalation. The Dragon-King uniques are the only exception
 *    (they drop at `legendary`).
 *  - ACCESSORIES ARE DEFERRED: rings/necklaces/belts/wrists/trinkets have no
 *    equip slot yet, so monsters whose ONLY sheet drop is an accessory get NO
 *    entry here (tracked in td-e78ae0). Monsters with a mix drop only their
 *    equippable items now (e.g. Kalius drops the Barb dagger; the belt + wrists
 *    wait).
 *  - Unique procs are NOT implemented: King's Staff / Golemic Claymore /
 *    Dragonslayer's Tenacity etc. drop as plain high-rarity named gear without
 *    their bespoke affix.
 */

import type { Rarity } from './types';

/** A gear category — a key of `GEAR_POOL` (config.ts). Kept local to the drops
 *  data model; the engine validates against `GEAR_POOL`/`ARMOR_SLOTS` at spawn. */
export type GearCategory =
  | 'helm'
  | 'chest'
  | 'legs'
  | 'gauntlets'
  | 'boots'
  | 'shield'
  | 'dagger'
  | '1h_sword'
  | '2h_sword'
  | '1h_mace'
  | '2h_mace'
  | 'staff';

export interface MonsterDrop {
  /** 0..1 chance this drop spawns per kill (the sheet is "drop chance"). */
  chance: number;
  /** Flavor name override for the spawned item ("Talon Dagger"). */
  name?: string;
  kind:
    | { type: 'gear'; category: GearCategory | 'randomArmor'; rarity?: Rarity }
    | { type: 'potion' | 'scroll' | 'food' | 'wand' }
    | { type: 'gold'; min: number; max: number };
}

/**
 * Per-monster drop tables, keyed by `monsterId` (kebab name, like
 * `MONSTER_ABILITIES`). A monster may have multiple drops (each rolled
 * independently). A monster with no entry draws no RNG and drops nothing, so
 * existing monsters' seeded streams are unchanged until they get a table.
 *
 * Rates are pre-encoded per the locked Phase-1 assignments: 0.12 normal,
 * 0.25 hero/rare, 1.0 for the Dragon-King uniques.
 */
export const MONSTER_DROPS: Record<string, MonsterDrop[]> = {
  // --- Normal monsters (0.12) ---
  orc: [{ chance: 0.12, name: 'Giant Thighbone', kind: { type: 'gear', category: '2h_mace' } }],
  'brown-bat': [{ chance: 0.12, name: 'Sapphire Enlayed Dagger', kind: { type: 'gear', category: 'dagger' } }],
  eagle: [{ chance: 0.12, name: 'Talon Dagger', kind: { type: 'gear', category: 'dagger' } }],
  // Black Powder Bomb — no bomb mechanic, so it drops as a consumable potion.
  hobgoblin: [{ chance: 0.12, name: 'Black Powder Bomb', kind: { type: 'potion' } }],
  'jungle-flesheater': [{ chance: 0.12, name: 'Thick Leafy Armor', kind: { type: 'gear', category: 'randomArmor' } }],
  'king-cobra': [{ chance: 0.12, name: 'Cobra Flesh', kind: { type: 'food' } }],
  'indus-worm': [{ chance: 0.12, name: 'Random Potion', kind: { type: 'potion' } }],
  nymph: [{ chance: 0.12, name: 'Staff of Seduction', kind: { type: 'gear', category: 'staff' } }],
  // Spiny Feathered Bow — no bow category, mapped to a generic light weapon (dagger).
  'rabid-ostrich': [{ chance: 0.12, name: 'Spiny Feathered Bow', kind: { type: 'gear', category: 'dagger' } }],
  // Labrynth Pole — no polearm category, mapped to a 2h haft weapon.
  minotaur: [{ chance: 0.12, name: 'Labrynth Pole', kind: { type: 'gear', category: '2h_mace' } }],
  unicorn: [{ chance: 0.12, name: 'Untarnished Horn', kind: { type: 'gear', category: 'dagger' } }],
  troll: [{ chance: 0.12, name: 'Stolen Poker', kind: { type: 'gear', category: '1h_sword' } }],
  xelhua: [{ chance: 0.12, name: "Xelhua's Carbonsteel", kind: { type: 'gear', category: 'randomArmor' } }],
  quinotaur: [
    { chance: 0.12, name: 'Cow Hide Armor', kind: { type: 'gear', category: 'randomArmor' } },
    { chance: 0.12, name: 'Splintered Horn', kind: { type: 'gear', category: 'dagger' } },
  ],
  'flying-serpent': [{ chance: 0.12, name: 'Serpent Leather Armor', kind: { type: 'gear', category: 'randomArmor' } }],
  golem: [{ chance: 0.12, name: 'Hardened Fists', kind: { type: 'gear', category: 'dagger' } }],
  dragon: [{ chance: 0.12, name: 'Scale Armor', kind: { type: 'gear', category: 'randomArmor' } }],
  apperation: [{ chance: 0.12, name: 'Black Onyx Sword', kind: { type: 'gear', category: '1h_sword' } }],
  // Spirit Dust (enchant materials) — no enchant-material item, mapped to scrolls.
  'agitated-apperation': [
    { chance: 0.12, name: 'Fine Spirit Dust', kind: { type: 'scroll' } },
    { chance: 0.12, name: 'Coarse Spirit Dust', kind: { type: 'scroll' } },
  ],

  // --- Hero / rare monsters (0.25) ---
  // Kalius' Belt + Wristguards are accessories — DEFERRED.
  'kalius-king-cobra': [{ chance: 0.25, name: "Kalius' Barb", kind: { type: 'gear', category: 'dagger' } }],
  'pantier-pygmy-king': [
    { chance: 0.25, name: "King's Staff", kind: { type: 'gear', category: 'staff' } },
    { chance: 0.25, name: 'Tiny Booties', kind: { type: 'gear', category: 'boots' } },
  ],
  // Bull Ring is an accessory — DEFERRED.
  'michael-the-minotaur': [
    { chance: 0.25, name: 'Skull of Michael', kind: { type: 'gear', category: 'shield' } },
    { chance: 0.25, name: "Michael's Armor", kind: { type: 'gear', category: 'randomArmor' } },
  ],
  'gary-the-golem': [
    { chance: 0.25, name: 'Golemic Claymore', kind: { type: 'gear', category: '2h_sword' } },
    { chance: 0.25, name: 'Hardened Clay Armor', kind: { type: 'gear', category: 'randomArmor' } },
  ],
  'colossal-cyclops': [
    { chance: 0.25, kind: { type: 'gold', min: 150, max: 200 } },
    { chance: 0.25, name: 'Subcolossal Mace', kind: { type: 'gear', category: '1h_mace' } },
  ],

  // --- Dragon King uniques (1.0, guaranteed, legendary). Bespoke procs DEFERRED. ---
  'dragon-king': [
    { chance: 1.0, name: "Dragonslayer's Tenacity", kind: { type: 'gear', category: 'randomArmor', rarity: 'legendary' } },
    { chance: 1.0, name: "King Ellowyn's Cutlass", kind: { type: 'gear', category: '1h_sword', rarity: 'legendary' } },
  ],

  // SKIPPED (accessory-only → deferred, tracked in td-e78ae0): cyclops,
  // snake, pygmy, yeti, zombie, trogdor-the-troll, zachary-the-zombie.
  // SKIPPED (leprechaun already drops gold via its purse-on-death mechanic —
  // do not double).
};

/** A player-facing description of one drop, for the bestiary "Drops" section.
 *  Mirrors `AbilityDescription` from abilityDescriptions.ts. */
export interface DropDescription {
  /** Display name — the flavor name if present, else a generic kind label. */
  name: string;
  /** Drop chance as a percent string, e.g. "12%". */
  chance: string;
}

/** Generic label for a drop with no flavor name, derived from its kind. */
function genericName(drop: MonsterDrop): string {
  switch (drop.kind.type) {
    case 'gold':
      return 'Gold';
    case 'gear':
      return drop.kind.category === 'randomArmor' ? 'Armor' : 'Gear';
    case 'potion':
      return 'Potion';
    case 'scroll':
      return 'Scroll';
    case 'food':
      return 'Food';
    case 'wand':
      return 'Wand';
  }
}

/** Turn one `MonsterDrop` into a player-facing description. */
export function describeDrop(drop: MonsterDrop): DropDescription {
  return {
    name: drop.name ?? genericName(drop),
    chance: `${Math.round(drop.chance * 100)}%`,
  };
}

/** All described drops for a monster id (empty when it has no table — the
 *  bestiary then omits the section). */
export function monsterDrops(id: string): DropDescription[] {
  return (MONSTER_DROPS[id] ?? []).map(describeDrop);
}
