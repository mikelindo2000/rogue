import { BALANCE } from '../config';
import type { PotionType } from '../types';
import { potionVisual } from '../itemVisuals';
import type { InventoryTooltipStat, PotionOption } from './store.svelte';
import { titleCase } from './format';

export function potionLabel(type: PotionType, count?: number): string {
  return `Potion of ${titleCase(type)}${count && count > 1 ? ` ×${count}` : ''}`;
}

export function buildPotionOptions(potions: PotionType[]): PotionOption[] {
  const stacks = new Map<PotionType, PotionOption>();

  potions.forEach((type, idx) => {
    const current = stacks.get(type);
    if (current) {
      current.count += 1;
      return;
    }

    const visual = potionVisual(type);
    stacks.set(type, {
      idx,
      label: titleCase(type),
      icon: visual.icon,
      color: visual.uiColor,
      count: 1,
    });
  });

  return Array.from(stacks.values());
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
