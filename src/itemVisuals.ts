import type { PotionType } from './types';

export type PotionIconName = `potion-${PotionType}`;

export interface PotionVisual {
  icon: PotionIconName;
  mapColor: string;
  uiColor: string;
  accent: string;
}

export const POTION_TYPES = ['healing', 'strength', 'invisibility', 'armor'] as const satisfies readonly PotionType[];

/**
 * Shared visual identity for potions across the floor glyph, compact inventory
 * icons, popover choices, and full inventory modal. Add new potion types here
 * first, then add the paired icon path in src/ui/icons.ts and generated art in
 * public/inventory/ using design/INVENTORY_IMAGE_GENERATION.md.
 */
export const POTION_VISUALS: Record<PotionType, PotionVisual> = {
  healing: {
    icon: 'potion-healing',
    mapColor: '#ff5a6f',
    uiColor: 'var(--potion-healing)',
    accent: 'red',
  },
  strength: {
    icon: 'potion-strength',
    mapColor: '#f59f1a',
    uiColor: 'var(--potion-strength)',
    accent: 'amber',
  },
  invisibility: {
    icon: 'potion-invisibility',
    mapColor: '#9fdcff',
    uiColor: 'var(--potion-invisibility)',
    accent: 'silver-blue',
  },
  armor: {
    icon: 'potion-armor',
    mapColor: '#6aa6d8',
    uiColor: 'var(--potion-armor)',
    accent: 'steel-blue',
  },
};

export function potionVisual(type: PotionType): PotionVisual {
  return POTION_VISUALS[type];
}
