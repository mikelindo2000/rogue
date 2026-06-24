import { RarityConfig, MonsterTemplate, GearItem, WandItem } from './types';

export interface TunableConfig {
  playerStartingHp: number;
  playerBaseAtk: number;
  playerMaxFood: number;
  monsterHpScale: number; // in %
  monsterAtkScale: number; // in %
  batHpOverride: number;
  orcHpOverride: number;
  dropLegendary: number; // in %
  dropEpic: number; // in %
  xpMultiplier: number;
  hungerMax: number;
  foodHungerRestore: number;
}

export const DEFAULT_TUNABLES: TunableConfig = {
  playerStartingHp: 30,
  playerBaseAtk: 2,
  playerMaxFood: 4,
  monsterHpScale: 100,
  monsterAtkScale: 100,
  batHpOverride: 22,
  orcHpOverride: 24,
  dropLegendary: 2.0,
  dropEpic: 3.0,
  xpMultiplier: 1.0,
  hungerMax: 800,
  foodHungerRestore: 300
};

/**
 * Fixed game-balance constants. Unlike `TunableConfig` (which the player can
 * adjust at runtime), these are the designer-set knobs that used to be magic
 * numbers scattered through the engine, map generator, AI, and loot tables.
 * Tuning difficulty or generation should mean editing values here — not
 * hunting through logic.
 */
export const BALANCE = {
  map: {
    // Original Rogue lays one room into each cell of a 3x3 grid, then links
    // neighbouring cells with passages. The grid guarantees rooms never
    // overlap and that each wall sprouts at most one corridor.
    gridCols: 3,
    gridRows: 3,
    // Chance a grid cell holds no room — a "gone room" in Rogue parlance,
    // reduced to a single corridor junction the passages thread through.
    goneRoomChance: 0.18,
    // After the spanning tree links every cell, each remaining adjacency has
    // this chance to add a loop-forming extra passage.
    extraConnChance: 0.15,
    // Room dimensions are the FLOOR interior; walls/corners wrap outside it.
    roomMinW: 4,
    roomMaxW: 11,
    roomMinH: 3,
    roomMaxH: 6,
    // Per-room size mode (original Rogue varied room size freely within a cell).
    // With probability largeRoomChance a room biases toward the largest interior
    // its cell can safely hold (a grand chamber); with smallRoomChance it biases
    // toward the minimum (a closet); otherwise the full range is sampled. Both
    // stay within [roomMin, cell max], so start/stairs rooms need no special
    // handling — they are no smaller or larger than today's possible extremes.
    largeRoomChance: 0.16,
    smallRoomChance: 0.16,
    // Maze cells: the authentic Rogue "different-shaped room". Instead of a
    // rectangle, one eligible cell can fill with a twisty maze of corridors.
    // None on floors 1-3 (learn the game first); at most one per floor so it
    // stays special. Counts against the same non-room budget as gone cells, so
    // the floor never drops below its real-room safety floor.
    mazeRoomMinFloor: 4,
    mazeRoomChance: 0.12,
    spawn: {
      foodChance: 0.28,
      consumableChance: 0.65,
      goldCut: 0.25, // cumulative thresholds within the consumable roll
      potionCut: 0.65,
      scrollCut: 0.85,
      // From BALANCE.wands.spawnMinFloor, the slice scrollCut..wandCut becomes a
      // wand; the rest (wandCut..1) stays a repair scroll. On shallow floors the
      // whole scrollCut..1 slice is a repair scroll (wands gated out).
      wandCut: 0.90,
      gearChance: 0.45,
      monsterChance: 0.82,
    },
    // Dark rooms (original-Rogue style): a room with no ambient light reveals
    // only the player's immediate 3x3 until lit. Never on floors 1-2 (learn the
    // game first) or floor 20 (the finale stays lit). Chance climbs with depth.
    // See design/implemented/dark_rooms_and_light_plan.md.
    darkRoomBase: 0.15,
    darkRoomFloorScale: 0.03,
    darkRoomMaxChance: 0.5,
    // When false, the up/down stair rooms are never dark. Default true: stairs
    // can sit in darkness (found by walking in), which adds tension without ever
    // blocking reachability (darkness never changes walkability).
    darkStairRooms: true,
    traps: {
      floor4Chance: 0.5,
      midEarlyChance: 0.65,
      extraBudgetChance: 0.4,
      lateExtraBudgetChance: 0.5,
      revealChance: 0.35,
      sleepTurns: 2,
      adjacentMonsterSleepTurns: 1,
      trapdoorLastFloor: 18,
      cost: {
        bear: 1,
        sleep_gas: 1,
        teleport: 1,
        dart: 2,
        trapdoor: 2,
      },
    },
  },
  fov: {
    rays: 72,
    angleStepDeg: 5,
    // How far the player sees in a normal (lit) room or corridor, in tiles.
    radius: 6,
    // Sight radius inside an unlit (dark) room: only the immediate 3x3 block
    // around the player. See design/implemented/visibility_and_fov.md.
    darkRadius: 1,
  },
  player: {
    regenInterval: 15, // turns between +1 HP regen
    levelUpHpMultiplier: 1.15,
    hungerFatigued: 190, // status-label thresholds
    hungerHungry: 425,
  },
  combat: {
    playerHitBonus: 2,
    monsterHitBonus: 1,
    defenseDivisor: 4,
    monsterDamageScale: 0.5,
    strengthBonus: 10,
    disarmDivisor: 2,
    staffFireBonus: 3,
    staffArcaneHeal: 2,
    frostFreezeChance: 0.25,
    frostFreezeTurns: 1,
  },
  gearHealth: {
    baseWearChance: 0.15,
    damageWearScale: 0.08,
    minWearChance: 0.15,
    maxWearChance: 0.65,
    wornRatio: 0.66,
    badRatio: 0.33,
  },
  monster: {
    wanderSkipChance: 0.4,
    aggroRange: 6,
    // Rogue-style depth-gated spawning: a monster is in the random pool from the
    // floor it first appears (minFloor) until `spawnDepthBand` floors deeper, so
    // shallow monsters phase out as you descend and each depth feels distinct.
    // Variety tracks DUNGEON DEPTH, not player level. Larger = monsters linger
    // longer (more variety per floor); smaller = tighter, faster-rotating pools.
    spawnDepthBand: 5,
    // Acquisition range for a monster standing on a dark (unlit) tile. Darkness
    // cuts both ways: a creature that can't see you can't beeline for you from
    // across a black room, so dark rooms aren't a one-sided player nerf. The
    // 'hunt' style chases when dist < range, so 3 means "a creature within ~2
    // tiles in the dark still finds you" while it stays blind across the room.
    // An already-hunting ambusher keeps its scent regardless.
    darkAggroRange: 3,
  },
  status: {
    vigorTurns: 100,
    midasTurns: 100,
    strengthTurns: 100,
    invisTurns: 50,
    armorTurns: 100,
    vigorHpMultiplier: 2,
    armorDefBonus: 100,
    midasGoldMultiplier: 1.2,
  },
  potions: {
    healAmount: 12,
  },
  // Read-on-demand scroll effects (see design/planning/scrolls_overhaul_plan.md).
  scrolls: {
    sleepTurns: 4,          // Scroll of Sleep: turns the player is out
    holdMonsterTurns: 8,    // Scroll of Hold Monster: turns held in place
    enchantWeaponBonus: 1,  // Scroll of Enchant Weapon: +dmg to the target weapon
    enchantArmorBonus: 1,   // Scroll of Enchant Armor: +def/+maxDef to target armor
  },
  gold: {
    variance: 0.1, // +/- 10%
    // A hoard-guardian (dragon/golem) drops this many chests' worth of gold for
    // its floor on death — the payoff for clearing a leashed treasure-defender.
    hoardMultiplier: 5,
  },
  loot: {
    legendaryMinFloor: 12,
    epicFloorScale: 0.006,
    rareBase: 0.1,
    rareFloorScale: 0.012,
    uncommonBase: 0.25,
    uncommonFloorScale: 0.01,
    gearDmgFloorScale: 1.5,
    gearDefFloorScale: 1.0,
  },
  // Wands/staves: zapped at range, never consume charges. Power is gated by a
  // per-item cooldown (caps burst) plus a flat hunger cost per zap (caps
  // sustain). See design/planning/wands_and_staves_plan.md.
  wands: {
    defaultCooldown: 4,        // turns; overridable per type below
    defaultHungerCost: 8,      // hunger units per zap (per-turn drain is 1)
    maxRange: 8,               // bolt/beam travels up to this many tiles
    // Staff tier = "the larger sibling": shorter cooldown, bigger damage.
    staffCooldownReduction: 1, // turns shaved off a staff's cooldown (min 1)
    staffDamageBonus: 2,       // flat damage added for staff-tier damage wands
    // Damage bolts scale with floor like gear does.
    damageFloorScale: 0.75,    // per-floor bonus for non-striking damage wands
    damageVariance: 0.25,      // +/- spread on bolt damage (magic missile excluded)
    strikingBase: 4,
    strikingFloorScale: 1.0,
    magicMissileBase: 3,       // low variance, never misses
    coldBase: 3,
    coldFreezeTurns: 2,        // reuses monster.frozenTurns
    fireBase: 5,
    lightningBase: 6,          // beam: hits each monster in line
    drainLifeBase: 6,
    drainLifeSelfCostRatio: 0.5,   // player pays this fraction of damage as HP
    sleepFreezeTurns: 3,
    cancellationTurns: 12,
    // Spawning: wands enter the consumable roll from this floor, as a small
    // slice carved out below the scroll cut. See BALANCE.map.spawn.wandCut.
    spawnMinFloor: 4,
    // Per-type overrides (turns / hunger). Control effects cost more.
    cooldown: {
      striking: 3, magic_missile: 3, cold: 4, fire: 4, lightning: 5,
      sleep: 6, polymorph: 10, teleport_away: 6, cancellation: 8,
      drain_life: 6, light: 2, invisibility: 12, nothing: 1,
    } as Record<string, number>,
    hungerCost: {
      striking: 6, magic_missile: 6, cold: 8, fire: 8, lightning: 10,
      sleep: 10, polymorph: 18, teleport_away: 12, cancellation: 14,
      drain_life: 12, light: 4, invisibility: 20, nothing: 2,
    } as Record<string, number>,
  },
} as const;

export const RARITY_CONFIG: Record<string, RarityConfig> = {
  common: { name: "Common", color: "#ffffff", multiplier: 1.0 },
  uncommon: { name: "Uncommon", color: "#1eff00", multiplier: 1.2 },
  rare: { name: "Rare", color: "#0070dd", multiplier: 1.5 },
  epic: { name: "Epic", color: "#a335ee", multiplier: 1.9 },
  legendary: { name: "Legendary", color: "#ff8000", multiplier: 2.5 }
};

export const XP_REQUIREMENTS: Record<number, number> = {
  1: 1400, 2: 3600, 3: 6500, 4: 10100, 5: 14400,
  6: 19400, 7: 25200, 8: 31700, 9: 38900, 10: 47400,
  11: 58600, 12: 71600, 13: 85700, 14: 95800, 15: 111800,
  16: 129100, 17: 147500, 18: 167100, 19: 187900, 20: 209800
};

export const MONSTER_XP_TABLE: Record<number, Record<string, number>> = {
  1: { "Brown Bat": 35, "Orc": 35 },
  2: { "Brown Bat": 26, "Orc": 26, "Snake": 72 },
  3: { "Brown Bat": 20, "Orc": 20, "Snake": 54, "Hobgoblin": 100 },
  4: { "Brown Bat": 15, "Orc": 15, "Snake": 41, "Hobgoblin": 75, "Eagle": 126 },
  5: { "Brown Bat": 0, "Orc": 0, "Snake": 30, "Hobgoblin": 56, "Eagle": 95, "Leprechaun": 180 },
  6: { "Hobgoblin": 42, "Eagle": 71, "Leprechaun": 135, "Jungle Flesheater": 216, "King Cobra": 216, "Kalius King Cobra": 485 },
  7: { "Eagle": 53, "Leprechaun": 101, "Jungle Flesheater": 162, "King Cobra": 162, "Kalius King Cobra": 364, "Indus Worm": 265 },
  8: { "Leprechaun": 76, "Jungle Flesheater": 122, "King Cobra": 122, "Kalius King Cobra": 273, "Indus Worm": 199, "Pygmy": 317, "Pantier Pygmy King": 704 },
  9: { "Jungle Flesheater": 92, "King Cobra": 92, "Kalius King Cobra": 205, "Indus Worm": 149, "Pygmy": 238, "Pantier Pygmy King": 528, "Nymph": 354 },
  10: { "Indus Worm": 112, "Pygmy": 179, "Pantier Pygmy King": 396, "Nymph": 266, "Rabid Ostrich": 379 },
  11: { "Pygmy": 134, "Pantier Pygmy King": 297, "Nymph": 200, "Rabid Ostrich": 284, "Minotaur": 469, "Michael the Minotaur": 1172 },
  12: { "Nymph": 150, "Rabid Ostrich": 213, "Minotaur": 352, "Michael the Minotaur": 879, "Unicorn": 551 },
  13: { "Rabid Ostrich": 160, "Minotaur": 264, "Michael the Minotaur": 660, "Unicorn": 413, "Yeti": 612 },
  14: { "Minotaur": 198, "Michael the Minotaur": 495, "Unicorn": 310, "Yeti": 459, "Troll": 684, "Trogdor the Troll": 1597 },
  15: { "Unicorn": 233, "Yeti": 356, "Troll": 513, "Trogdor the Troll": 1198, "Golem": 799, "Gary the Golem": 1863 },
  16: { "Yeti": 267, "Troll": 385, "Trogdor the Troll": 899, "Golem": 599, "Gary the Golem": 1397, "Flying Serpent": 861 },
  17: { "Troll": 289, "Trogdor the Troll": 674, "Golem": 449, "Gary the Golem": 1048, "Flying Serpent": 646, "Cyclops": 952, "Colossal Cyclops": 2682 },
  18: { "Golem": 337, "Gary the Golem": 786, "Flying Serpent": 485, "Cyclops": 714, "Colossal Cyclops": 2012, "Quinotaur": 1044 },
  19: { "Flying Serpent": 364, "Cyclops": 536, "Colossal Cyclops": 1509, "Quinotaur": 783, "Xelhua": 1139, "Zombie": 1139, "Zachary the Zombie": 3132 },
  20: { "Cyclops": 402, "Colossal Cyclops": 1132, "Quinotaur": 587.25, "Xelhua": 854, "Zombie": 854, "Zachary the Zombie": 2349 }
};

export const CHEST_GOLD_TABLE: Record<number, number> = {
  1: 15, 2: 25, 3: 30, 4: 45, 5: 60, 6: 80, 7: 100, 8: 120, 9: 150, 10: 160,
  11: 200, 12: 230, 13: 300, 14: 350, 15: 410, 16: 550, 17: 700, 18: 900, 19: 1000, 20: 1200
};

export const MONSTER_DATABASE: MonsterTemplate[] = [
  { symbol: 'O', name: 'Orc', hp: 24, atk: 7, color: '#556b2f', minFloor: 1 },
  { symbol: 'B', name: 'Brown Bat', hp: 22, atk: 8, color: '#8b4513', minFloor: 1 },
  { symbol: 'S', name: 'Snake', hp: 25, atk: 9, color: '#ff0000', minFloor: 2 },
  { symbol: 'H', name: 'Hobgoblin', hp: 29, atk: 11, color: '#ffff00', minFloor: 3 },
  { symbol: 'E', name: 'Eagle', hp: 33, atk: 17, color: '#d3d3d3', minFloor: 4 }, // atk 12→17: gives the gentle `raptor` dive enough bite to land FAIR at floor 4 (an eagle hits harder than a bat)
  { symbol: 'L', name: 'Leprechaun', hp: 38, atk: 15, color: '#00ff00', minFloor: 5 },
  { symbol: 'J', name: 'Jungle Flesheater', hp: 44, atk: 17, color: '#006400', minFloor: 6 },
  { symbol: 'K', name: 'King Cobra', hp: 48, atk: 15, color: '#cd853f', minFloor: 6 },
  { symbol: 'K↑', name: 'Kalius King Cobra', hp: 65, atk: 15, color: '#cd853f', minFloor: 6, special: 'hero' },
  { symbol: 'I', name: 'Indus Worm', hp: 51, atk: 18, color: '#f5f5dc', minFloor: 7 },
  { symbol: 'P', name: 'Pygmy', hp: 58, atk: 22, color: '#d2b48c', minFloor: 8 },
  { symbol: 'P↑', name: 'Pantier Pygmy King', hp: 72, atk: 22, color: '#d2b48c', minFloor: 8, special: 'hero' },
  { symbol: 'N', name: 'Nymph', hp: 67, atk: 23, color: '#e6e6fa', minFloor: 9 },
  { symbol: 'R', name: 'Rabid Ostrich', hp: 77, atk: 25, color: '#d3d3d3', minFloor: 10 },
  { symbol: 'M', name: 'Minotaur', hp: 89, atk: 30, color: '#8b4513', minFloor: 11 },
  { symbol: 'M↑', name: 'Michael the Minotaur', hp: 96, atk: 32, color: '#8b4513', minFloor: 11, special: 'hero' },
  { symbol: 'U', name: 'Unicorn', hp: 102, atk: 32, color: '#ffffff', minFloor: 12 },
  { symbol: 'Y', name: 'Yeti', hp: 117, atk: 34, color: '#ffffff', minFloor: 13 },
  { symbol: 'T', name: 'Troll', hp: 135, atk: 36, color: '#00ff00', minFloor: 14 },
  { symbol: 'T↑', name: 'Trogdor the Troll', hp: 150, atk: 37, color: '#00ff00', minFloor: 14, special: 'hero' },
  { symbol: 'G', name: 'Golem', hp: 155, atk: 39, color: '#d2b48c', minFloor: 15 },
  { symbol: 'G↑', name: 'Gary the Golem', hp: 170, atk: 41, color: '#d2b48c', minFloor: 15, special: 'hero' },
  // atk 42 → 85: the Flying Serpent is a kiter (ranged poker). Its bolt is
  // telegraphed + chip damage, so it connects only a fraction of each turn and
  // reads "easy" at the plain-melee base atk (see the §3 telegraph-gating gotcha
  // in guides/monster-authoring.md). Bumped to land the FAIR band at floor 16
  // (harness threat ~0.42, mid-fair). Not comparable to a plain-melee row's atk.
  { symbol: 'F', name: 'Flying Serpent', hp: 178, atk: 85, color: '#39ff14', minFloor: 16 },
  { symbol: 'C', name: 'Cyclops', hp: 205, atk: 75, color: '#ffdab9', minFloor: 17 },
  { symbol: 'C↑', name: 'Colossal Cyclops', hp: 225, atk: 85, color: '#ffdab9', minFloor: 17, special: 'hero' },
  { symbol: 'Q', name: 'Quinotaur', hp: 236, atk: 47, color: '#ffff00', minFloor: 18 },
  { symbol: 'V', name: 'Xelhua', hp: 271, atk: 49, color: '#ff0000', minFloor: 19 },
  { symbol: 'Z', name: 'Zombie', hp: 275, atk: 49, color: '#00ff00', minFloor: 19 },
  { symbol: 'Z↑', name: 'Zachary the Zombie', hp: 300, atk: 51, color: '#00ff00', minFloor: 19, special: 'hero' },
  { symbol: 'A', name: 'Apperation', hp: 312, atk: 52, color: '#556666', minFloor: 20 },
  { symbol: 'A↑', name: 'Agitated Apperation', hp: 330, atk: 55, color: '#556666', minFloor: 20 },
  { symbol: 'D', name: 'Dragon', hp: 380, atk: 44, color: '#00ff00', minFloor: 20 },
  { symbol: 'D↑', name: 'Dragon King', hp: 1050, atk: 27, color: '#00ff00', minFloor: 20, special: 'boss' },
  { symbol: 'M*', name: 'Marcus the Brave', hp: 900, atk: 25, color: '#ffd700', minFloor: 20, special: 'boss' }
];

export const GEAR_POOL: Record<string, GearItem[]> = {
  helm: [ {name:"Leather Cap", def:1, maxDef:1}, {name:"Iron Helm", def:3, maxDef:3}, {name:"Dragon Visor", def:5, maxDef:5} ],
  chest: [ {name:"Cloth Shirt", def:1, maxDef:1}, {name:"Chainmail", def:4, maxDef:4}, {name:"Platemail", def:8, maxDef:8} ],
  legs: [ {name:"Leather Pants", def:1, maxDef:1}, {name:"Iron Greaves", def:3, maxDef:3}, {name:"Dragon Legs", def:5, maxDef:5} ],
  gauntlets: [ {name:"Cloth Gloves", def:1, maxDef:1}, {name:"Iron Gauntlets", def:2, maxDef:2}, {name:"Mithril Fists", def:4, maxDef:4} ],
  boots: [ {name:"Leather Shoes", def:1, maxDef:1}, {name:"Steel Sabatons", def:2, maxDef:2}, {name:"Winged Boots", def:4, maxDef:4} ],
  shield: [ {name:"Buckler", def:2, maxDef:2}, {name:"Kite Shield", def:4, maxDef:4}, {name:"Tower Shield", def:7, maxDef:7} ],
  dagger: [ {name:"Steel Dagger", dmg:3}, {name:"Assassin Dirk", dmg:5}, {name:"Void Blade", dmg:7} ],
  '1h_sword': [ {name:"Shortsword", dmg:5}, {name:"Broadsword", dmg:8}, {name:"Rune Blade", dmg:12} ],
  '2h_sword': [ {name:"Claymore", dmg:10}, {name:"Zweihander", dmg:16}, {name:"Dragon Slayer", dmg:22} ],
  '1h_mace': [ {name:"Club", dmg:6}, {name:"Morningstar", dmg:9}, {name:"Meteor Hammer", dmg:13} ],
  '2h_mace': [ {name:"Warhammer", dmg:12}, {name:"Earth Breaker", dmg:18}, {name:"Titan Maul", dmg:25} ],
  staff: [ {name:"Fire Staff", dmg:4, type:'staff', rarity:'common'}, {name:"Frost Staff", dmg:4, type:'staff', rarity:'common'}, {name:"Arcane Staff", dmg:4, type:'staff', rarity:'common'} ]
};

/** The zappable wand/staff catalog, parallel to GEAR_POOL. Persistent items —
 *  no charges. `cooldownRemaining`/`identified` are added at spawn/pickup. */
export const WAND_POOL: WandItem[] = [
  { name: 'Wand of Striking',      wandType: 'striking',      tier: 'wand',  rarity: 'common' },
  { name: 'Wand of Magic Missile', wandType: 'magic_missile', tier: 'wand',  rarity: 'common' },
  { name: 'Wand of Cold',          wandType: 'cold',          tier: 'wand',  rarity: 'uncommon' },
  { name: 'Wand of Fire',          wandType: 'fire',          tier: 'wand',  rarity: 'uncommon' },
  { name: 'Staff of Lightning',    wandType: 'lightning',     tier: 'staff', rarity: 'rare' },
  { name: 'Wand of Sleep',         wandType: 'sleep',         tier: 'wand',  rarity: 'uncommon' },
  { name: 'Wand of Polymorph',     wandType: 'polymorph',     tier: 'wand',  rarity: 'rare' },
  { name: 'Wand of Teleportation', wandType: 'teleport_away', tier: 'wand',  rarity: 'uncommon' },
  { name: 'Wand of Cancellation',  wandType: 'cancellation',  tier: 'wand',  rarity: 'rare' },
  { name: 'Staff of Drain Life',   wandType: 'drain_life',    tier: 'staff', rarity: 'rare' },
  { name: 'Wand of Light',         wandType: 'light',         tier: 'wand',  rarity: 'common' },
  { name: 'Wand of Invisibility',  wandType: 'invisibility',  tier: 'wand',  rarity: 'rare' },
  { name: 'Wand of Nothing',       wandType: 'nothing',       tier: 'wand',  rarity: 'common' },
];

let currentTunables: TunableConfig = { ...DEFAULT_TUNABLES };

export function loadConfig(): TunableConfig {
  const saved = localStorage.getItem('rogue_config_tunables');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      currentTunables = { ...DEFAULT_TUNABLES, ...parsed };
    } catch (e) {
      console.error("Failed to parse config overrides", e);
    }
  }
  return currentTunables;
}

export function saveConfig(tunables: TunableConfig) {
  currentTunables = { ...tunables };
  localStorage.setItem('rogue_config_tunables', JSON.stringify(currentTunables));
}

export function resetConfig(): TunableConfig {
  localStorage.removeItem('rogue_config_tunables');
  currentTunables = { ...DEFAULT_TUNABLES };
  return currentTunables;
}

export function getConfig(): TunableConfig {
  return currentTunables;
}

/**
 * Returns a dynamically scaled monster list or individual stats based on tunables.
 */
export function getScaledMonsterHP(baseHp: number, name: string): number {
  if (name === 'Brown Bat') return currentTunables.batHpOverride;
  if (name === 'Orc') return currentTunables.orcHpOverride;
  return Math.round(baseHp * (currentTunables.monsterHpScale / 100));
}

export function getScaledMonsterAtk(baseAtk: number): number {
  return Math.round(baseAtk * (currentTunables.monsterAtkScale / 100));
}

export function getScaledXpRequirements(): Record<number, number> {
  const scaled: Record<number, number> = {};
  for (const levelStr in XP_REQUIREMENTS) {
    const lvl = parseInt(levelStr);
    scaled[lvl] = Math.round(XP_REQUIREMENTS[lvl] * currentTunables.xpMultiplier);
  }
  return scaled;
}
