export interface RarityConfig {
  name: string;
  color: string;
  multiplier: number;
}

export interface PlayerStats {
  startingHp: number;
  baseAtk: number;
  maxFood: number;
  hungerMax: number;
  foodHungerRestore: number;
}

export interface LootChances {
  legendaryMinFloor: number;
  legendaryChance: number;
  epicBase: number;
  epicFloorScale: number;
  rareBase: number;
  rareFloorScale: number;
  uncommonBase: number;
  uncommonFloorScale: number;
}

export interface MonsterTemplate {
  /** Stable discovery key. Optional — falls back to a slug of `name`. */
  id?: string;
  symbol: string;
  name: string;
  hp: number;
  atk: number;
  color: string;
  minFloor: number;
  special?: 'hero' | 'boss';
  /** Flavor text shown on the compendium detail view once defeated. */
  lore?: string;
}

export interface GameConfig {
  player: PlayerStats;
  rarities: Record<string, RarityConfig>;
  lootChances: LootChances;
  xpRequirements: Record<number, number>;
  monsters: MonsterTemplate[];
}

/** The five armor slots, as a runtime-iterable tuple and a derived union. */
export const ARMOR_SLOTS = ['helm', 'chest', 'legs', 'gauntlets', 'boots'] as const;
export type ArmorSlot = typeof ARMOR_SLOTS[number];

/** Slots whose inventory is a list of gear (armor + shield). */
export type GearSlot = ArmorSlot | 'shield';

/** Slots the equip UI can target. */
export type EquipSlot = 'mainHand' | 'offHand' | ArmorSlot;

export type WeaponType = 'dagger' | '1h_sword' | '2h_sword' | '1h_mace' | '2h_mace' | 'staff';
export type StaffMagic = 'fire' | 'frost' | 'arcane';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type PotionType = 'healing' | 'strength' | 'invisibility' | 'armor';
/** Named, carried scrolls (read on demand) at original-Rogue catalog parity.
 *  Every floor scroll now carries a `scrollType`; the legacy opaque random-effect
 *  scroll has been retired. Effect metadata lives in the data-driven registry in
 *  src/scrolls.ts. See design/planning/scrolls_overhaul_plan.md. */
export type ScrollType =
  | 'light'
  | 'repair'
  | 'magic_mapping'
  | 'monster_detection'
  | 'teleportation'
  | 'hold_monster'
  | 'sleep'
  | 'create_monster'
  | 'aggravate_monsters'
  | 'enchant_weapon'
  | 'enchant_armor'
  | 'protect_armor'
  | 'remove_curse'
  | 'identify'
  | 'food_detection'
  | 'gold_detection'
  | 'monster_confusion'
  | 'scare_monster'
  | 'blank_paper';

/** The zappable arcane line. Distinct from the melee WeaponType 'staff': wands
 *  are carried (not equipped) and zapped in a direction. No charges — power is
 *  gated by a per-item cooldown plus a small hunger cost. See
 *  design/implemented/wands_and_staves_plan.md. */
export type WandType =
  | 'striking'       // force bolt, scaled melee-style damage
  | 'magic_missile'  // reliable low-variance damage, never misses
  | 'lightning'      // beam: pierces, hits every monster in line
  | 'fire'           // bolt: damage
  | 'cold'           // bolt: damage + freeze (reuses frozenTurns)
  | 'sleep'          // hold monster (frozenTurns, no damage)
  | 'polymorph'      // reroll the struck monster into another species
  | 'teleport_away'  // relocate the struck monster elsewhere on the floor
  | 'cancellation'   // strip a monster's special behavior for N turns
  | 'drain_life'     // damage the monster, heal the player (costs player HP)
  | 'light'          // self-targeted: flood the current room
  | 'invisibility'   // self-targeted: invisTurns on the player
  | 'nothing';       // the classic dud — flavor only

/** Display + tuning tier for a wand. A staff is "the larger sibling of a wand":
 *  same code path, bigger numbers / shorter cooldown. Not a charge count. */
export type WandTier = 'wand' | 'staff';

export interface GearItem {
  name: string;
  rarity?: Rarity;
  category?: string;
  color?: string;
  // Weapon attributes
  dmg?: number;
  type?: WeaponType;
  magic?: StaffMagic;
  // Armor attributes
  def?: number;
  maxDef?: number;
  health?: GearHealth;
}

export interface GearHealth {
  current: number;
  max: number;
}

/** A carried, zappable wand/staff. Persistent: no charges. `cooldownRemaining`
 *  is per-item runtime state (a recharge timer), not a count of uses. */
export interface WandItem {
  name: string;            // "Wand of Cold", "Staff of Lightning"
  wandType: WandType;
  tier: WandTier;          // display tier + tuning band; not a charge count
  rarity?: Rarity;         // mirrors GearItem
  color?: string;          // glyph/art tint, mirrors GearItem
  /** Turns remaining before this wand can be zapped again. 0/undefined = ready.
   *  Runtime/persisted state, not a charge. */
  cooldownRemaining?: number;
  /** Set on pickup once identification ships; until then always true. */
  identified?: boolean;
}

/** Gear that has been placed on the floor carries its spawn category. */
export type FloorGear = GearItem & { category: string };

interface ItemBase {
  x: number;
  y: number;
  symbol: string;
  color: string;
}

/** Items on the floor — a discriminated union keyed on `type`. */
export type Item =
  // `amount`, when present, is the exact gold in this pile (e.g. recovered from a
  // slain leprechaun). Absent ⇒ a chest, whose gold is rolled from CHEST_GOLD_TABLE
  // at pickup. See the gold branch of `checkItems`.
  | (ItemBase & { type: 'gold'; amount?: number })
  | (ItemBase & { type: 'food' })
  // Every scroll is a named, carryable scroll (picked up into inventory, read on
  // demand). The legacy opaque random-effect scroll and separate repair_scroll
  // item have been retired; old saves are migrated on load (savegame.ts).
  | (ItemBase & { type: 'scroll'; data: { scrollType: ScrollType } })
  | (ItemBase & { type: 'potion'; data: { potionType: PotionType } })
  | (ItemBase & { type: 'gear'; data: FloorGear })
  | (ItemBase & { type: 'wand'; data: WandItem });

export type ItemType = Item['type'];

/** Omit that distributes over the Item union (preserves per-variant `data`). */
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
/** An item ready to place, minus its coordinates. */
export type ItemSpawn = DistributiveOmit<Item, 'x' | 'y'>;

export type MazeDetailKind = 'loose_stone';

export interface MazeDetail {
  id: string;
  kind: MazeDetailKind;
  x: number;
  y: number;
  revealed: boolean;
  reward: ItemSpawn;
}

export interface Monster {
  x: number;
  y: number;
  /** Stable discovery key, carried from the template at spawn (via spread).
   *  Optional — discovery falls back to a slug of `name` when absent. Keep this
   *  in sync with the template `id` so sightings/kills key the same way the
   *  bestiary does. */
  id?: string;
  symbol: string;
  name: string;
  hp: number;
  /** HP at spawn, recorded for the UI tooltip's health bar. Display-only. */
  maxHp?: number;
  atk: number;
  color: string;
  minFloor: number;
  special?: 'hero' | 'boss';
  frozenTurns: number;
  swipeTurn?: boolean;
  /** Gold this monster is carrying. Leprechauns accumulate the gold they steal
   *  here; on death it spills onto the floor as a recoverable pile (plus a base
   *  hoard for gold-carriers). Absent/0 ⇒ drops nothing. */
  gold?: number;
  /** Items stolen by this monster and possibly recoverable on death. Nymphs use
   *  this for snatched potions/gold; each entry is already shaped like a floor
   *  item minus coordinates so it can be dropped on the corpse tile. */
  stolenLoot?: ItemSpawn[];
  /** Turns remaining under a Wand of Cancellation: special archetype behavior
   *  (telegraphed attacks, on-hit abilities, dodge) is suppressed while > 0.
   *  Decremented in processMonsterAI. Optional — absent means not cancelled. */
  canceledTurns?: number;
  /** Per-monster AI runtime (FSM state + cooldowns), attached lazily by the
   *  behavior interpreter. Typed as the structural shape to avoid a cycle with
   *  the ai/ module; see MonsterAIRuntime in src/ai/types.ts. */
  ai?: {
    state: 'asleep' | 'hunting' | 'fleeing';
    cooldowns: Record<string, number>;
    swipeToggle: boolean;
    pendingAttack?: {
      attackId: string;
      resolveTurn: number;
      targetX: number;
      targetY: number;
    };
    /** Set when an on-hit ability (leprechaun's steal) wants the monster to blink
     *  away this turn. The engine consumes it after the attack resolves. */
    pendingBlink?: boolean;
    /** A guardian's lair tile, captured on first action; it leashes to this. */
    homeX?: number;
    homeY?: number;
  };
}

export interface StatusEffects {
  vigorTurns: number;
  midasTurns: number;
  strengthTurns: number;
  invisTurns: number;
  armorTurns: number;
  monsterDetectionTurns: number;
}

export type TrapKind = 'bear' | 'sleep_gas' | 'dart' | 'teleport' | 'trapdoor';

export interface TrapState {
  id: string;
  kind: TrapKind;
  x: number;
  y: number;
  revealed: boolean;
  armed: boolean;
}

export interface TrapEffects {
  bearTrapTurns: number;
  sleepTurns: number;
  strengthDrained: number;
  confusedTurns: number;
}

export type Inventory = {
  food: number;
  weapons: GearItem[];
  potions: PotionType[];
  scrolls: ScrollType[];
  wands: WandItem[];
} & Record<GearSlot, GearItem[]>;

/** Stable reference the UI can send back to engine inventory commands. */
export type InventoryRef =
  | { kind: 'food' }
  | { kind: 'potion'; potionType: PotionType }
  | { kind: 'scroll'; scrollType: ScrollType }
  | { kind: 'weapon'; index: number }
  | { kind: 'wand'; index: number }
  | { kind: 'armor'; slot: ArmorSlot; index: number }
  | { kind: 'shield'; index: number };

export type InventoryAction = 'equip' | 'equipOffHand' | 'use' | 'zap' | 'drop';

export type EquipTarget =
  | { slot: 'mainHand'; index: number }
  | { slot: 'offHand'; value: string }
  | { slot: ArmorSlot; index: number };

export type Equipped = {
  mainHand: number;
  offHand: string;
} & Record<ArmorSlot, number>;

export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  gold: number;
  hunger: number;
  baseAtk: number;
  regenTurns: number;
  disarmedHits: number;
  undeadFoods: number;
  level: number;
  xp: number;
  inventory: Inventory;
  equipped: Equipped;
}
