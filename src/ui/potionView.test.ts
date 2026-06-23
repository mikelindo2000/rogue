import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config';
import type { PotionType } from '../types';
import { potionDetail, potionLabel, potionTooltipStats } from './potionView';

const POTIONS: PotionType[] = ['healing', 'strength', 'invisibility', 'armor'];

describe('potion view helpers', () => {
  it('formats stack labels consistently', () => {
    expect(potionLabel('healing')).toBe('Potion of Healing');
    expect(potionLabel('healing', 1)).toBe('Potion of Healing');
    expect(potionLabel('healing', 2)).toBe('Potion of Healing ×2');
  });

  it('provides detail copy for every potion type', () => {
    for (const type of POTIONS) {
      expect(potionDetail(type)).toMatch(/\.$/);
    }
    expect(potionDetail('strength')).toContain(String(BALANCE.combat.strengthBonus));
    expect(potionDetail('armor')).toContain(String(BALANCE.status.armorDefBonus));
  });

  it('provides right-rail tooltip stats for every potion type', () => {
    for (const type of POTIONS) {
      const stats = potionTooltipStats(type);
      expect(stats.length).toBeGreaterThanOrEqual(3);
      expect(stats[0].label).toBe('Effect');
      expect(stats.some((stat) => stat.tone === 'better')).toBe(true);
    }

    expect(potionTooltipStats('healing')).toContainEqual({
      label: 'Amount',
      value: `+${BALANCE.potions.healAmount} HP`,
      tone: 'better',
    });
  });
});
