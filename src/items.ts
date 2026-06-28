import { GEAR_POOL, RARITY_CONFIG, BALANCE, getConfig } from './config';
import { FloorGear, Rarity } from './types';
import { RNG } from './rng';
import { normalizeGearHealth } from './gearHealth';
import { isWeaponCategory } from './weapons';

/**
 * A weighted list of every GEAR_POOL category that preserves today's ≈50/50
 * weapon:armor split despite the weapon-class expansion. A flat
 * `rng.pick(Object.keys(GEAR_POOL))` would push weapons from ~50% to ~65% once 5
 * weapon categories were added; a two-step group-then-category pick would fix the
 * ratio but add an rng draw per loot roll, cascading seeded determinism. Instead
 * we keep a SINGLE `rng.pick` over this list, repeating each weapon category
 * (`armorCount`)× and each armor category (`weaponCount`)× so the two groups carry
 * equal total weight. One draw ⇒ the rng draw COUNT per loot roll is unchanged
 * (downstream seeded determinism preserved); only WHICH item a given seed yields
 * shifts. Built once at module load. */
const WEIGHTED_GEAR_CATEGORIES: string[] = (() => {
  const all = Object.keys(GEAR_POOL);
  const weapons = all.filter(isWeaponCategory);
  const armor = all.filter((c) => !isWeaponCategory(c));
  const weighted: string[] = [];
  // Repeat each weapon `armor.length`× and each armor `weapons.length`× so each
  // group totals weapons.length * armor.length ⇒ a 50/50 weapon:armor split.
  for (const w of weapons) for (let i = 0; i < armor.length; i++) weighted.push(w);
  for (const a of armor) for (let i = 0; i < weapons.length; i++) weighted.push(a);
  return weighted;
})();

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
  // Single rng.pick over a WEIGHTED category list (preserves the ≈50/50
  // weapon:armor ratio and the per-roll draw count). See WEIGHTED_GEAR_CATEGORIES.
  const cat = rng.pick(WEIGHTED_GEAR_CATEGORIES);
  return buildGearInCategory(cat, floor, rarity, rng);
}

/** Generate gear in a SPECIFIC category (e.g. a monster drop that must be a
 *  dagger). Same tier-gating + depth/rarity scaling as `generateGearItem`, but
 *  the category is fixed by the caller rather than rolled. Draws one rng.pick
 *  (the template within the category's eligible tier), mirroring
 *  generateGearItem's per-call draw count. */
export function generateGearItemInCategory(
  category: string,
  floor: number,
  rarity: Rarity,
  rng: RNG,
): FloorGear | null {
  return buildGearInCategory(category, floor, rarity, rng);
}

function buildGearInCategory(cat: string, floor: number, rarity: Rarity, rng: RNG): FloorGear | null {
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
