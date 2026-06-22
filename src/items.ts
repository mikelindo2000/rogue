import { GEAR_POOL, RARITY_CONFIG, getConfig } from './config';
import { GearItem } from './types';

export function rollLootRarity(floor: number): string {
  const tunables = getConfig();
  const rand = Math.random();

  const legendaryChance = tunables.dropLegendary / 100; // default 0.02
  const epicChance = (tunables.dropEpic / 100) + (floor * 0.006); // default 0.03 + floor * 0.006
  const rareChance = 0.10 + (floor * 0.012);
  const uncommonChance = 0.25 + (floor * 0.01);

  if (floor >= 12 && rand < legendaryChance) return 'legendary';
  if (rand < epicChance) return 'epic';
  if (rand < epicChance + rareChance) return 'rare';
  if (rand < epicChance + rareChance + uncommonChance) return 'uncommon';
  return 'common';
}

export function generateGearItem(floor: number, rarity: string): (GearItem & { category: string; color: string }) | null {
  const categories = Object.keys(GEAR_POOL);
  const cat = categories[Math.floor(Math.random() * categories.length)];
  const pool = GEAR_POOL[cat];
  if (!pool || pool.length === 0) return null;

  const template = JSON.parse(JSON.stringify(pool[Math.floor(Math.random() * pool.length)]));
  const rConfig = RARITY_CONFIG[rarity || 'common'];
  const mult = rConfig.multiplier;
  template.rarity = rarity;
  template.category = cat;
  template.color = rConfig.color;

  if (template.dmg !== undefined) {
    const baseBonus = Math.floor(floor * 1.5);
    template.dmg = Math.round((template.dmg + baseBonus) * mult);
    template.name += ` +${baseBonus}`;
  }
  if (template.def !== undefined) {
    const baseBonus = Math.floor(floor * 1.0);
    template.def = Math.round((template.def + baseBonus) * mult);
    template.maxDef = template.def;
    template.name += ` +${baseBonus}`;
  }

  return template;
}
