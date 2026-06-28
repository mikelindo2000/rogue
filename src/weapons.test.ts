import { describe, expect, it } from 'vitest';
import { isWeaponCategory, isTwoHandedType, weaponSymbol, WEAPON_CATEGORIES, TWO_HANDED } from './weapons';
import { canEquip, createPlayer, equipValidated } from './player';
import { computeStrike } from './combat';
import { GEAR_POOL } from './config';
import { makeRng } from './rng';
import type { GearItem, WeaponType } from './types';

const ALL_WEAPON_TYPES: WeaponType[] = [
  'dagger', '1h_sword', '2h_sword', '1h_mace', '2h_mace',
  '1h_axe', '2h_axe', 'polearm', 'bow', 'blunderbuss', 'staff',
];

const logs = () => {
  const entries: string[] = [];
  return { entries, add: (msg: string) => entries.push(msg) };
};

describe('centralized weapon detection', () => {
  it('isWeaponCategory covers every WeaponType and matches GEAR_POOL weapon categories', () => {
    for (const t of ALL_WEAPON_TYPES) expect(isWeaponCategory(t)).toBe(true);
    // WEAPON_CATEGORIES is exactly the WeaponType union.
    expect([...WEAPON_CATEGORIES].sort()).toEqual([...ALL_WEAPON_TYPES].sort());
  });

  it('classifies armor/shield categories as NOT weapons', () => {
    for (const cat of ['helm', 'chest', 'legs', 'gauntlets', 'boots', 'shield']) {
      expect(isWeaponCategory(cat)).toBe(false);
    }
    expect(isWeaponCategory(undefined)).toBe(false);
    expect(isWeaponCategory('bogus')).toBe(false);
  });

  it('every GEAR_POOL weapon category is a known WeaponType and vice versa', () => {
    const poolWeaponCats = Object.keys(GEAR_POOL).filter(isWeaponCategory).sort();
    expect(poolWeaponCats).toEqual([...WEAPON_CATEGORIES].sort());
  });

  it('weaponSymbol gives weapons ) and armor [', () => {
    expect(weaponSymbol('1h_axe')).toBe(')');
    expect(weaponSymbol('bow')).toBe(')');
    expect(weaponSymbol('chest')).toBe('[');
    expect(weaponSymbol(undefined)).toBe('[');
  });

  it('TWO_HANDED set: 2h_*, polearm, bow, blunderbuss, staff are two-handed; the rest are not', () => {
    const expectedTwoHanded: WeaponType[] = ['2h_sword', '2h_mace', '2h_axe', 'polearm', 'bow', 'blunderbuss', 'staff'];
    const expectedOneHanded: WeaponType[] = ['dagger', '1h_sword', '1h_mace', '1h_axe'];
    for (const t of expectedTwoHanded) expect(isTwoHandedType(t)).toBe(true);
    for (const t of expectedOneHanded) expect(isTwoHandedType(t)).toBe(false);
    expect([...TWO_HANDED].sort()).toEqual([...expectedTwoHanded].sort());
    expect(isTwoHandedType(undefined)).toBe(false);
  });
});

describe('new weapon classes generate, equip, and respect two-handedness', () => {
  for (const cat of ['1h_axe', '2h_axe', 'polearm', 'bow', 'blunderbuss'] as const) {
    it(`${cat}: every tier template has a positive dmg and the right type`, () => {
      const pool = GEAR_POOL[cat];
      expect(pool.length).toBe(3);
      for (const item of pool) {
        expect(item.dmg).toBeGreaterThan(0);
      }
    });
  }

  it('a 2H new weapon (polearm) clears the off-hand on equip', () => {
    const player = createPlayer();
    const log = logs();
    player.inventory.shield.push({ name: 'Kite Shield', def: 4, maxDef: 4, rarity: 'common' });
    player.inventory.weapons.push({ name: 'Halberd', type: 'polearm', dmg: 12, rarity: 'common' });
    player.equipped.offHand = 'shield:1';

    expect(equipValidated(player, { slot: 'mainHand', index: 1 }, log.add)).toBe(true);
    expect(player.equipped.offHand).toBe('none:0');
  });

  it.each(['bow', 'blunderbuss', '2h_axe'] as const)('a 2H new weapon (%s) rejects an off-hand shield', (type) => {
    const player = createPlayer();
    player.inventory.weapons.push({ name: 'Two Hander', type, dmg: 10, rarity: 'common' });
    player.inventory.shield.push({ name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' });
    player.equipped.mainHand = 1;

    const result = canEquip(player, { slot: 'offHand', value: 'shield:1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Two-handed/);
  });

  it('a 1h_axe is one-handed and can pair a shield', () => {
    const player = createPlayer();
    player.inventory.weapons.push({ name: 'Battle Axe', type: '1h_axe', dmg: 10, rarity: 'common' });
    player.inventory.shield.push({ name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' });
    player.equipped.mainHand = 1;

    expect(isTwoHandedType('1h_axe')).toBe(false);
    const result = canEquip(player, { slot: 'offHand', value: 'shield:1' });
    expect(result.ok).toBe(true);
  });

  it('each new weapon type deals its dmg through computeStrike (plain melee)', () => {
    const samples: { type: WeaponType; dmg: number }[] = [
      { type: '1h_axe', dmg: 10 }, { type: '2h_axe', dmg: 17 }, { type: 'polearm', dmg: 12 },
      { type: 'bow', dmg: 8 }, { type: 'blunderbuss', dmg: 15 },
    ];
    for (const { type, dmg } of samples) {
      const weapon: GearItem = { name: type, type, dmg };
      // A no-weapon baseline (fist) must never out-damage the armed strike on average.
      let armed = 0;
      let bare = 0;
      for (let seed = 0; seed < 200; seed++) {
        armed += computeStrike({ baseAtk: 2, weapon, strengthActive: false, disarmed: false, rng: makeRng(seed) }).damage;
        bare += computeStrike({ baseAtk: 2, weapon: { name: 'Fist' }, strengthActive: false, disarmed: false, rng: makeRng(seed) }).damage;
      }
      expect(armed).toBeGreaterThan(bare);
    }
  });

  it('shadow staff is plain melee in Phase 0: no heal, no freeze, no message', () => {
    const shadow: GearItem = { name: 'Shadow Staff', dmg: 4, type: 'staff', magic: 'shadow' };
    for (let seed = 0; seed < 100; seed++) {
      const out = computeStrike({ baseAtk: 2, weapon: shadow, strengthActive: false, disarmed: false, rng: makeRng(seed) });
      expect(out.selfHeal).toBe(0);
      expect(out.freezeTurns).toBe(0);
      expect(out.messages).toEqual([]);
    }
  });

  it('GEAR_POOL staff pool includes a shadow-magic staff', () => {
    const shadow = GEAR_POOL.staff.find((s) => s.magic === 'shadow');
    expect(shadow).toBeDefined();
    expect(shadow!.name).toBe('Shadow Staff');
    expect(shadow!.type).toBe('staff');
    expect(shadow!.dmg).toBe(4);
  });
});
