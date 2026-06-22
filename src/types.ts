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
  symbol: string;
  name: string;
  hp: number;
  atk: number;
  color: string;
  minFloor: number;
  special?: 'boss';
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
  | (ItemBase & { type: 'scroll' })
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
  symbol: string;
  name: string;
  hp: number;
  /** HP at spawn, recorded for the UI tooltip's health bar. Display-only. */
  maxHp?: number;
  atk: number;
  color: string;
  minFloor: number;
  special?: 'boss';
  frozenTurns: number;
  swipeTurn?: boolean;
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
} & Record<GearSlot, GearItem[]>;

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
