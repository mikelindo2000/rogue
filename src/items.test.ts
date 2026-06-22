import { describe, it, expect } from 'vitest';
import { makeRng } from './rng';
import { rollLootRarity, generateGearItem } from './items';
import { GEAR_POOL, RARITY_CONFIG, BALANCE } from './config';
import { Rarity } from './types';

const VALID_RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

describe('rollLootRarity', () => {
  it('always returns one of the five valid rarities', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (let floor = 1; floor <= 20; floor++) {
        const rarity = rollLootRarity(floor, makeRng(seed));
        expect(VALID_RARITIES).toContain(rarity);
      }
    }
  });

  it("never returns 'legendary' below BALANCE.loot.legendaryMinFloor", () => {
    const minFloor = BALANCE.loot.legendaryMinFloor;
    for (let floor = 1; floor < minFloor; floor++) {
      for (let seed = 1; seed <= 500; seed++) {
        const rarity = rollLootRarity(floor, makeRng(seed));
        expect(rarity).not.toBe('legendary');
      }
    }
  });
});

describe('generateGearItem', () => {
  const gearCategories = Object.keys(GEAR_POOL);

  it('returns non-null gear with a valid category, color, and rarity', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const gear = generateGearItem(5, 'common', makeRng(seed));
      expect(gear).not.toBeNull();
      expect(gearCategories).toContain(gear!.category);
      expect(gear!.color).toBe(RARITY_CONFIG.common.color);
      expect(gear!.rarity).toBe('common');
    }
  });

  it('weapons have a numeric dmg, armor/shields have numeric def === maxDef, and names get a +bonus suffix', () => {
    const weaponCategories = new Set(['dagger', 'staff', '1h_sword', '2h_sword', '1h_mace', '2h_mace']);

    for (let seed = 1; seed <= 200; seed++) {
      const gear = generateGearItem(5, 'common', makeRng(seed));
      expect(gear).not.toBeNull();
      const cat = gear!.category;

      if (weaponCategories.has(cat)) {
        expect(typeof gear!.dmg).toBe('number');
        expect(gear!.def).toBeUndefined();
      } else {
        expect(typeof gear!.def).toBe('number');
        expect(gear!.maxDef).toBe(gear!.def);
        expect(gear!.dmg).toBeUndefined();
      }

      // Both branches append a " +<bonus>" suffix to the name.
      expect(gear!.name).toMatch(/ \+\d+$/);
    }
  });

  it('scales stats up by rarity multiplier for a fixed seed and floor', () => {
    const seed = 12345;
    const floor = 6;

    for (const higher of ['uncommon', 'rare', 'epic', 'legendary'] as Rarity[]) {
      const common = generateGearItem(floor, 'common', makeRng(seed))!;
      const scaled = generateGearItem(floor, higher, makeRng(seed))!;

      expect(common.category).toBe(scaled.category);
      expect(RARITY_CONFIG[higher].multiplier).toBeGreaterThan(RARITY_CONFIG.common.multiplier);

      if (common.dmg !== undefined) {
        expect(scaled.dmg!).toBeGreaterThanOrEqual(common.dmg);
      } else {
        expect(scaled.def!).toBeGreaterThanOrEqual(common.def!);
      }
    }
  });

  it('epic and legendary stats are >= common for the same seed+floor', () => {
    const seed = 777;
    const floor = 12;
    const common = generateGearItem(floor, 'common', makeRng(seed))!;
    const epic = generateGearItem(floor, 'epic', makeRng(seed))!;
    const legendary = generateGearItem(floor, 'legendary', makeRng(seed))!;

    expect(common.category).toBe(epic.category);
    expect(common.category).toBe(legendary.category);

    const stat = (g: typeof common) => (g.dmg !== undefined ? g.dmg : g.def!);
    expect(stat(epic)).toBeGreaterThanOrEqual(stat(common));
    expect(stat(legendary)).toBeGreaterThanOrEqual(stat(common));
  });

  it('is deterministic: same (floor, rarity, seed) yields deeply equal gear', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const a = generateGearItem(8, 'rare', makeRng(seed));
      const b = generateGearItem(8, 'rare', makeRng(seed));
      expect(a).toEqual(b);
    }
  });
});
