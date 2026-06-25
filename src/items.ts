import { GEAR_POOL, RARITY_CONFIG, BALANCE, getConfig } from './config';
import { FloorGear, Rarity } from './types';
import { RNG } from './rng';
import { normalizeGearHealth } from './gearHealth';

export function rollLootRarity(floor: number, rng: RNG): Rarity {
  const tunables = getConfig();
  const rand = rng.next();
  const { loot } = BALANCE;

  const legendaryChance = tunables.dropLegendary / 100;
  const epicChance = tunables.dropEpic / 100 + floor * loot.epicFloorScale;
  const rareChance = loot.rareBase + floor * loot.rareFloorScale;
  const uncommonChance = loot.uncommonBase + floor * loot.uncommonFloorScale;

  if (floor >= loot.legendaryMinFloor && rand < legendaryChance) return 'legendary';
  if (rand < epicChance) return 'epic';
  if (rand < epicChance + rareChance) return 'rare';
  if (rand < epicChance + rareChance + uncommonChance) return 'uncommon';
  return 'common';
}

export function generateGearItem(floor: number, rarity: Rarity, rng: RNG): FloorGear | null {
  const categories = Object.keys(GEAR_POOL);
  const cat = rng.pick(categories);
  const pool = GEAR_POOL[cat];
  if (!pool || pool.length === 0) return null;

  // Tier gating: a category's pool is ordered weakest→strongest; only tiers
  // unlocked at this depth can drop (tier 0 is always available). This is why a
  // Titan Maul can't appear on floor 1. One rng.pick either way, so the draw
  // count — and thus the rest of level generation — is unchanged.
  const tierMin = BALANCE.loot.tierMinFloor;
  const eligible = pool.filter((_, i) => floor >= (tierMin[i] ?? tierMin[tierMin.length - 1]));
  const template: FloorGear = { ...rng.pick(eligible.length ? eligible : pool), category: cat };
  const rConfig = RARITY_CONFIG[rarity || 'common'];
  const mult = rConfig.multiplier;
  template.rarity = rarity;
  template.color = rConfig.color;

  if (template.dmg !== undefined) {
    const baseBonus = Math.floor(floor * BALANCE.loot.gearDmgFloorScale);
    template.dmg = Math.round((template.dmg + baseBonus) * mult);
    template.name += ` +${baseBonus}`;
  }
  if (template.def !== undefined) {
    const baseBonus = Math.floor(floor * BALANCE.loot.gearDefFloorScale);
    template.def = Math.round((template.def + baseBonus) * mult);
    template.maxDef = template.def;
    normalizeGearHealth(template);
    template.name += ` +${baseBonus}`;
  }

  return template;
}
