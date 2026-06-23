import { BALANCE } from '../config';
import type { PotionType } from '../types';
import type { InventoryTooltipStat } from './store.svelte';
import { titleCase } from './format';

export function potionLabel(type: PotionType, count?: number): string {
  return `Potion of ${titleCase(type)}${count && count > 1 ? ` ×${count}` : ''}`;
}

export function potionDetail(type: PotionType): string {
  switch (type) {
    case 'healing':
      return `Restores up to ${BALANCE.potions.healAmount} health.`;
    case 'strength':
      return `Adds ${BALANCE.combat.strengthBonus} attack for ${BALANCE.status.strengthTurns} turns.`;
    case 'invisibility':
      return `Makes monsters lose track of you for ${BALANCE.status.invisTurns} turns.`;
    case 'armor':
      return `Adds ${BALANCE.status.armorDefBonus} defense for ${BALANCE.status.armorTurns} turns.`;
  }
}

export function potionTooltipStats(type: PotionType): InventoryTooltipStat[] {
  switch (type) {
    case 'healing':
      return [
        { label: 'Effect', value: 'Heal' },
        { label: 'Amount', value: `+${BALANCE.potions.healAmount} HP`, tone: 'better' },
        { label: 'Timing', value: 'Instant' },
      ];
    case 'strength':
      return [
        { label: 'Effect', value: 'Attack' },
        { label: 'Bonus', value: `+${BALANCE.combat.strengthBonus} ATK`, tone: 'better' },
        { label: 'Duration', value: `${BALANCE.status.strengthTurns} turns` },
      ];
    case 'invisibility':
      return [
        { label: 'Effect', value: 'Stealth' },
        { label: 'Aggro', value: 'Drops track', tone: 'better' },
        { label: 'Duration', value: `${BALANCE.status.invisTurns} turns` },
      ];
    case 'armor':
      return [
        { label: 'Effect', value: 'Defense' },
        { label: 'Bonus', value: `+${BALANCE.status.armorDefBonus} DEF`, tone: 'better' },
        { label: 'Duration', value: `${BALANCE.status.armorTurns} turns` },
      ];
  }
}
