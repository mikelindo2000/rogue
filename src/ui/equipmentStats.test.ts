import { describe, expect, it } from 'vitest';
import {
  availableEquipCount,
  gearStatText,
  hasStatUpgrade,
  primaryGearStat,
} from './equipmentStats';

describe('equipment stat display helpers', () => {
  it('formats primary attack and defense stats compactly', () => {
    expect(gearStatText({ name: 'Iron Dagger', dmg: 2 }, 'attack')).toBe('ATK +2');
    expect(gearStatText({ name: 'Cracked Shield', def: 2, maxDef: 4 }, 'defense')).toBe('DEF 2/4');
    expect(gearStatText({ name: 'Cloth Gloves', def: 1, maxDef: 1 }, 'defense')).toBe('DEF 1');
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
});
