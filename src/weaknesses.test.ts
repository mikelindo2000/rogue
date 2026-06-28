import { describe, it, expect } from 'vitest';
import {
  MONSTER_WEAKNESSES,
  describeWeakness,
  monsterWeakness,
  weaknessBonus,
  type MonsterWeakness,
} from './weaknesses';
import type { GearItem } from './types';
import { GEAR_POOL } from './config';

describe('MONSTER_WEAKNESSES table (Phase-1 assignments)', () => {
  it('maps a weapon-class weakness verbatim from the sheet', () => {
    expect(MONSTER_WEAKNESSES['zombie']).toEqual({
      bonusDamage: 8,
      label: 'Axes',
      weaponTypes: ['1h_axe', '2h_axe'],
    });
  });

  it('maps a magic-school weakness verbatim from the sheet', () => {
    expect(MONSTER_WEAKNESSES['apperation']).toEqual({
      bonusDamage: 12,
      label: 'Fire Magic',
      magic: 'fire',
    });
  });

  it("marks the Dragon King weak to all weapons at +20", () => {
    expect(MONSTER_WEAKNESSES['dragon-king']).toEqual({
      bonusDamage: 20,
      label: 'All weapons',
      allWeapons: true,
    });
  });

  it('SKIPS the unmappable monsters (no clean weapon/magic class)', () => {
    for (const id of ['pygmy', 'kalius-king-cobra', 'trogdor-the-troll']) {
      expect(MONSTER_WEAKNESSES[id]).toBeUndefined();
    }
  });
});

describe('weaknessBonus (engine resolution)', () => {
  const axeWeakness: MonsterWeakness = { bonusDamage: 8, label: 'Axes', weaponTypes: ['1h_axe', '2h_axe'] };
  const fireWeakness: MonsterWeakness = { bonusDamage: 12, label: 'Fire Magic', magic: 'fire' };
  const allWeakness: MonsterWeakness = { bonusDamage: 20, label: 'All weapons', allWeapons: true };

  it('returns the bonus when the weapon type counters', () => {
    const axe: GearItem = { name: 'Axe', dmg: 5, type: '1h_axe' };
    expect(weaknessBonus(axeWeakness, axe)).toBe(8);
  });

  it('returns 0 when the weapon type does not counter', () => {
    const sword: GearItem = { name: 'Sword', dmg: 5, type: '1h_sword' };
    expect(weaknessBonus(axeWeakness, sword)).toBe(0);
  });

  it('returns the bonus when an equipped staff matches the magic school', () => {
    const fireStaff: GearItem = { name: 'Fire Staff', dmg: 5, type: 'staff', magic: 'fire' };
    expect(weaknessBonus(fireWeakness, fireStaff)).toBe(12);
  });

  it('returns 0 for a staff of the wrong school, or a non-staff', () => {
    const frostStaff: GearItem = { name: 'Frost Staff', dmg: 5, type: 'staff', magic: 'frost' };
    const sword: GearItem = { name: 'Sword', dmg: 5, type: '1h_sword' };
    expect(weaknessBonus(fireWeakness, frostStaff)).toBe(0);
    expect(weaknessBonus(fireWeakness, sword)).toBe(0);
  });

  it('allWeapons matches any weapon (anything with a type)', () => {
    const dagger: GearItem = { name: 'Dagger', dmg: 2, type: 'dagger' };
    const bow: GearItem = { name: 'Bow', dmg: 4, type: 'bow' };
    expect(weaknessBonus(allWeakness, dagger)).toBe(20);
    expect(weaknessBonus(allWeakness, bow)).toBe(20);
  });

  it('returns 0 when there is no weakness or no weapon', () => {
    const axe: GearItem = { name: 'Axe', dmg: 5, type: '1h_axe' };
    expect(weaknessBonus(undefined, axe)).toBe(0);
    expect(weaknessBonus(axeWeakness, undefined)).toBe(0);
    // A bare weapon with no type (e.g. a test fist) never counters.
    const fist: GearItem = { name: 'Fist', dmg: 1 };
    expect(weaknessBonus(allWeakness, fist)).toBe(0);
  });
});

describe('equippable staffs carry a magic school (read-site parity)', () => {
  // Each staff in GEAR_POOL is equipped as-is into inventory.weapons and read
  // directly by weaknessBonus, so it must carry the `magic` field its name
  // implies — otherwise magic-school weaknesses silently never fire for it.
  const cases: [string, string, string][] = [
    ['Fire Staff', 'fire', 'apperation'],   // +12 Fire Magic
    ['Frost Staff', 'frost', 'indus-worm'], // +5 Frost Magic
    ['Arcane Staff', 'arcane', 'nymph'],    // +6 Arcane Magic
    ['Shadow Staff', 'shadow', 'unicorn'],  // +6 Shadow Magic
  ];

  for (const [name, magic, monsterId] of cases) {
    it(`${name} sets magic:'${magic}' and counters ${monsterId}`, () => {
      const staff = GEAR_POOL['staff'].find((s) => s.name === name);
      expect(staff).toBeDefined();
      expect(staff!.magic).toBe(magic);
      const weakness = MONSTER_WEAKNESSES[monsterId];
      expect(weaknessBonus(weakness, staff)).toBe(weakness.bonusDamage);
    });
  }
});

describe('describeWeakness / monsterWeakness (bestiary)', () => {
  it('renders the label and a "+N dmg" bonus string', () => {
    expect(describeWeakness({ bonusDamage: 7, label: '1H Axe', weaponTypes: ['1h_axe'] })).toEqual({
      label: '1H Axe',
      bonus: '+7 dmg',
    });
  });

  it('resolves a monster id to its described weakness, null when none', () => {
    expect(monsterWeakness('troll')).toEqual({ label: '1H Axe', bonus: '+7 dmg' });
    expect(monsterWeakness('pygmy')).toBeNull();
  });
});
