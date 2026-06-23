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
/** Named, carried scrolls (read on demand). Distinct from the legacy opaque
 *  `scroll` floor item, which still applies a random effect on pickup. */
export type ScrollType = 'light';

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
  | (ItemBase & { type: 'gold' })
  | (ItemBase & { type: 'food' })
  // A scroll with `data.scrollType` is a named, carryable scroll (picked up into
  // inventory). Without it, the legacy opaque random-effect scroll (used on pickup).
  | (ItemBase & { type: 'scroll'; data?: { scrollType: ScrollType } })
  | (ItemBase & { type: 'repair_scroll' })
  | (ItemBase & { type: 'potion'; data: { potionType: PotionType } })
  | (ItemBase & { type: 'gear'; data: FloorGear });

export type ItemType = Item['type'];

/** Omit that distributes over the Item union (preserves per-variant `data`). */
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
/** An item ready to place, minus its coordinates. */
export type ItemSpawn = DistributiveOmit<Item, 'x' | 'y'>;

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
  };
}

export interface StatusEffects {
  vigorTurns: number;
  midasTurns: number;
  strengthTurns: number;
  invisTurns: number;
  armorTurns: number;
}

export type Inventory = {
  food: number;
  weapons: GearItem[];
  potions: PotionType[];
  scrolls: ScrollType[];
} & Record<GearSlot, GearItem[]>;

/** Stable reference the UI can send back to engine inventory commands. */
export type InventoryRef =
  | { kind: 'food' }
  | { kind: 'potion'; potionType: PotionType }
  | { kind: 'scroll'; scrollType: ScrollType }
  | { kind: 'weapon'; index: number }
  | { kind: 'armor'; slot: ArmorSlot; index: number }
  | { kind: 'shield'; index: number };

export type InventoryAction = 'equip' | 'equipOffHand' | 'use';

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
