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
    const weaponCategories = new Set([
      'dagger', 'staff', '1h_sword', '2h_sword', '1h_mace', '2h_mace',
      '1h_axe', '2h_axe', 'polearm', 'bow', 'blunderbuss',
    ]);

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
        expect(gear!.health).toEqual({ current: gear!.def, max: gear!.def });
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

  it('gates gear tiers by floor: no top-tier (Titan Maul etc.) drops before its threshold', () => {
    const [, t1min, t2min] = BALANCE.loot.tierMinFloor;
    const tierNames = (i: number) =>
      new Set(Object.values(GEAR_POOL).map((p) => p[i]?.name).filter(Boolean));
    const t1 = tierNames(1);
    const t2 = tierNames(2);
    const baseName = (n: string) => n.replace(/ \+\d+$/, '');

    for (let seed = 1; seed <= 1500; seed++) {
      // Below the tier-1 gate: only tier-0 base templates may appear.
      const below1 = generateGearItem(t1min - 1, 'common', makeRng(seed))!;
      expect(t1.has(baseName(below1.name))).toBe(false);
      expect(t2.has(baseName(below1.name))).toBe(false);
      // Below the tier-2 gate: tier-2 (Titan Maul, Dragon Slayer, Platemail…) is barred.
      const below2 = generateGearItem(t2min - 1, 'common', makeRng(seed + 99_999))!;
      expect(t2.has(baseName(below2.name))).toBe(false);
    }
  });

  it('is deterministic: same (floor, rarity, seed) yields deeply equal gear', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const a = generateGearItem(8, 'rare', makeRng(seed));
      const b = generateGearItem(8, 'rare', makeRng(seed));
      expect(a).toEqual(b);
    }
  });

  it('can roll every weapon category, including the new ones', () => {
    const newWeaponCats = ['1h_axe', '2h_axe', 'polearm', 'bow', 'blunderbuss'];
    const seen = new Set<string>();
    // Floor 8 so all tiers are eligible; many seeds to cover the weighted pool.
    for (let seed = 1; seed <= 4000 && newWeaponCats.some((c) => !seen.has(c)); seed++) {
      const gear = generateGearItem(8, 'common', makeRng(seed));
      if (gear) seen.add(gear.category);
    }
    for (const cat of newWeaponCats) {
      expect(seen.has(cat), `loot never rolled category ${cat}`).toBe(true);
    }
  });

  it('preserves the ≈50/50 weapon:armor loot ratio despite the new weapon classes', () => {
    // The weighted single-pick must keep weapons and armor roughly balanced; a
    // naive flat pick over all categories would push weapons to ~65%.
    const weaponCats = new Set([
      'dagger', 'staff', '1h_sword', '2h_sword', '1h_mace', '2h_mace',
      '1h_axe', '2h_axe', 'polearm', 'bow', 'blunderbuss',
    ]);
    let weapons = 0;
    let total = 0;
    const N = 20000;
    for (let seed = 1; seed <= N; seed++) {
      const gear = generateGearItem(8, 'common', makeRng(seed));
      if (!gear) continue;
      total++;
      if (weaponCats.has(gear.category)) weapons++;
    }
    const ratio = weapons / total;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });
});
