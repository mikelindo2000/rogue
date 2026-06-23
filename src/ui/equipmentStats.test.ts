import { describe, expect, it } from 'vitest';
import {
  availableEquipCount,
  gearHealthView,
  gearStatWithCondition,
  gearStatText,
  hasStatUpgrade,
  primaryGearStat,
  shortGearStatText,
} from './equipmentStats';

describe('equipment stat display helpers', () => {
  it('formats primary attack and defense stats compactly', () => {
    expect(gearStatText({ name: 'Iron Dagger', dmg: 2 }, 'attack')).toBe('ATK +2');
    expect(gearStatText({ name: 'Cracked Shield', def: 2, maxDef: 4 }, 'defense')).toBe('DEF 2/4');
    expect(gearStatText({ name: 'Cloth Gloves', def: 1, maxDef: 1 }, 'defense')).toBe('DEF 1');
    expect(shortGearStatText({ name: 'Cracked Shield', def: 2, maxDef: 4 }, 'defense')).toBe('DEF 2/4');
    expect(gearStatWithCondition({ name: 'Cracked Shield', def: 1, maxDef: 4 }, 'defense')).toBe('DEF 1/4 · critical');
  });

  it('treats empty gear as zero stats', () => {
    expect(primaryGearStat({ name: 'None', def: 9 }, 'defense')).toBe(0);
    expect(gearStatText(undefined, 'attack')).toBe('ATK +0');
    expect(gearStatText({ name: 'None' }, 'defense')).toBe('DEF 0');
  });

  it('counts only real equip alternatives', () => {
    expect(
      availableEquipCount(
        [
          { value: 'none:0' },
          { value: 'shield:1', selected: true },
          { value: 'shield:2' },
          { value: 'weapon:1', disabled: true },
        ],
        ['none:0']
      )
    ).toBe(1);
  });

  it('detects stat upgrades against the current item', () => {
    expect(
      hasStatUpgrade(
        { name: 'Cloth Gloves', def: 1 },
        [
          { name: 'Leather Gloves', def: 1 },
          { name: 'Iron Gauntlets', def: 2 },
        ],
        'defense'
      )
    ).toBe(true);

    expect(
      hasStatUpgrade(
        { name: 'Warhammer', dmg: 12 },
        [{ name: 'Iron Dagger', dmg: 2 }],
        'attack'
      )
    ).toBe(false);
  });

  it('builds condition view data for defensive gear', () => {
    expect(gearHealthView({ name: 'Buckler', def: 3, maxDef: 3 }, 'var(--rarity-common)')).toEqual({
      label: '3/3',
      ratio: 1,
      tone: 'good',
      color: 'var(--rarity-common)',
    });
    expect(gearHealthView({ name: 'Broken Buckler', def: 0, maxDef: 3 }, 'var(--rarity-common)')).toMatchObject({
      label: '0/3',
      ratio: 0,
      tone: 'broken',
      color: 'var(--text-faint)',
    });
    expect(gearHealthView({ name: 'Iron Dagger', dmg: 2 }, 'var(--rarity-common)')).toBeUndefined();
  });
});
