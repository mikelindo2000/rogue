import { describe, expect, it } from 'vitest';
import { diffEquipped, type EquipSnapshot } from './equipment';

const base: EquipSnapshot = {
  mainHand: 'Sword:5',
  offHand: 'none',
  helm: 'none',
  chest: 'Tunic:2',
  legs: 'none',
  gauntlets: 'none',
  boots: 'none',
};

const snap = (over: Partial<EquipSnapshot>): EquipSnapshot => ({ ...base, ...over });
const types = (a: EquipSnapshot, b: EquipSnapshot) => diffEquipped(a, b).map(e => e.type);

describe('diffEquipped', () => {
  it('emits nothing when unchanged', () => {
    expect(types(base, snap({}))).toEqual([]);
  });

  it('equipping armor into an empty slot emits equipArmor', () => {
    expect(types(base, snap({ helm: 'Cap:1' }))).toEqual(['equipment.equipArmor']);
  });

  it('swapping one armor piece for another emits equipArmor', () => {
    expect(types(base, snap({ chest: 'Plate:6' }))).toEqual(['equipment.equipArmor']);
  });

  it('removing armor emits unequipArmor', () => {
    expect(types(base, snap({ chest: 'none' }))).toEqual(['equipment.unequipArmor']);
  });

  it('changing the main-hand weapon emits equipWeapon', () => {
    expect(types(base, snap({ mainHand: 'Axe:8' }))).toEqual(['equipment.equipWeapon']);
  });

  it('equipping an off-hand weapon emits equipWeapon', () => {
    expect(types(base, snap({ offHand: 'weapon:Dagger:3' }))).toEqual(['equipment.equipWeapon']);
  });

  it('equipping a shield emits equipArmor', () => {
    expect(types(base, snap({ offHand: 'shield:Buckler:2' }))).toEqual(['equipment.equipArmor']);
  });

  it('removing a shield emits unequipArmor', () => {
    const withShield = snap({ offHand: 'shield:Buckler:2' });
    expect(types(withShield, snap({ offHand: 'none' }))).toEqual(['equipment.unequipArmor']);
  });

  it('a two-handed weapon that clears an off-hand shield emits both cues', () => {
    const withShield = snap({ offHand: 'shield:Buckler:2' });
    const twoHander = snap({ mainHand: 'Greatsword:12', offHand: 'none' });
    expect(types(withShield, twoHander)).toEqual([
      'equipment.equipWeapon',
      'equipment.unequipArmor',
    ]);
  });

  it('clearing an off-hand weapon does not emit an armor cue', () => {
    const withOffWeapon = snap({ offHand: 'weapon:Dagger:3' });
    expect(types(withOffWeapon, snap({ offHand: 'none' }))).toEqual([]);
  });
});
