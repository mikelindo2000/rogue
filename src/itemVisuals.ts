import type { PotionType, ScrollType } from './types';

export type PotionIconName = `potion-${PotionType}`;
export type ScrollIconName = `scroll-${ScrollType}`;

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
 * public/inventory/ using design/implemented/inventory_image_generation.md.
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

export interface ScrollVisual {
  icon: ScrollIconName;
  /** Floor-glyph color — distinct from the generic scroll (#cc66ff) and the
   *  repair scroll (#ff00ff). */
  mapColor: string;
  uiColor: string;
  accent: string;
}

export const SCROLL_TYPES = ['light'] as const satisfies readonly ScrollType[];

/**
 * Shared visual identity for named scrolls across the floor glyph and inventory.
 * Add a new scroll type here first, then add the paired icon in src/ui/icons.ts
 * and generated art in public/inventory/ per design/implemented/inventory_image_generation.md.
 */
export const SCROLL_VISUALS: Record<ScrollType, ScrollVisual> = {
  light: {
    icon: 'scroll-light',
    mapColor: '#ffd86b',
    uiColor: 'var(--scroll-light)',
    accent: 'warm-gold',
  },
};

export function scrollVisual(type: ScrollType): ScrollVisual {
  return SCROLL_VISUALS[type];
}
