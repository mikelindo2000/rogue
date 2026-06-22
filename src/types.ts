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

export interface PotionItem {
  potionType: 'healing' | 'strength' | 'invisibility' | 'armor';
}

export interface GearItem {
  category?: string;
  name: string;
  def?: number;
  maxDef?: number;
  dmg?: number;
  type?: string;
  rarity?: string;
}

export interface Item {
  x: number;
  y: number;
  type: 'food' | 'gold' | 'potion' | 'scroll' | 'repair_scroll' | 'gear';
  symbol: string;
  color: string;
  data?: any;
}

export interface Monster {
  x: number;
  y: number;
  symbol: string;
  name: string;
  hp: number;
  atk: number;
  color: string;
  minFloor: number;
  special?: string;
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
  inventory: {
    food: number;
    weapons: GearItem[];
    shield: GearItem[];
    helm: GearItem[];
    chest: GearItem[];
    legs: GearItem[];
    gauntlets: GearItem[];
    boots: GearItem[];
    potions: string[];
    [key: string]: any; // To allow slot indexing in equip checks
  };
  equipped: {
    mainHand: number;
    offHand: string;
    helm: number;
    chest: number;
    legs: number;
    gauntlets: number;
    boots: number;
    [key: string]: number | string; // Index signature for slot access
  };
}
