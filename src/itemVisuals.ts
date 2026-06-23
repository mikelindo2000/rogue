import type { PotionType, ScrollType, WandType } from './types';

export type PotionIconName = `potion-${PotionType}`;
export type ScrollIconName = `scroll-${ScrollType}`;
export type WandIconName = `wand-${WandType}`;

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

export interface WandVisual {
  icon: WandIconName;
  /** Floor-glyph color — wands share the '/' glyph, distinguished by tint. */
  mapColor: string;
  /** UI tint for the wand cell/name when no rarity color overrides it. */
  uiColor: string;
  accent: string;
}

export const WAND_TYPES = [
  'striking', 'magic_missile', 'lightning', 'fire', 'cold', 'sleep',
  'polymorph', 'teleport_away', 'cancellation', 'drain_life', 'light',
  'invisibility', 'nothing',
] as const satisfies readonly WandType[];

/**
 * Shared visual identity for wands across the floor glyph and inventory. Add a
 * new wand type here first, then add the paired icon in src/ui/icons.ts and
 * generated art in public/inventory/ per
 * design/implemented/inventory_image_generation.md.
 */
export const WAND_VISUALS: Record<WandType, WandVisual> = {
  striking:      { icon: 'wand-striking',      mapColor: '#c9ccd6', uiColor: '#c9ccd6', accent: 'steel gray' },
  magic_missile: { icon: 'wand-magic_missile', mapColor: '#7db8ff', uiColor: '#7db8ff', accent: 'arcane blue' },
  lightning:     { icon: 'wand-lightning',     mapColor: '#9fe8ff', uiColor: '#9fe8ff', accent: 'electric blue' },
  fire:          { icon: 'wand-fire',          mapColor: '#ff8a3c', uiColor: '#ff8a3c', accent: 'molten orange' },
  cold:          { icon: 'wand-cold',          mapColor: '#8fd4ff', uiColor: '#8fd4ff', accent: 'icy blue' },
  sleep:         { icon: 'wand-sleep',         mapColor: '#b79cff', uiColor: '#b79cff', accent: 'dusky violet' },
  polymorph:     { icon: 'wand-polymorph',     mapColor: '#6fe6b0', uiColor: '#6fe6b0', accent: 'shifting opal' },
  teleport_away: { icon: 'wand-teleport_away', mapColor: '#b06bff', uiColor: '#b06bff', accent: 'deep violet' },
  cancellation:  { icon: 'wand-cancellation',  mapColor: '#9a9aa2', uiColor: '#9a9aa2', accent: 'muted gray' },
  drain_life:    { icon: 'wand-drain_life',    mapColor: '#ff5a78', uiColor: '#ff5a78', accent: 'blood crimson' },
  light:         { icon: 'wand-light',         mapColor: '#ffd86b', uiColor: '#ffd86b', accent: 'pale gold' },
  invisibility:  { icon: 'wand-invisibility',  mapColor: '#cfe6ef', uiColor: '#cfe6ef', accent: 'silver-blue' },
  nothing:       { icon: 'wand-nothing',       mapColor: '#9b958c', uiColor: '#9b958c', accent: 'dull gray' },
};

export function wandVisual(type: WandType): WandVisual {
  return WAND_VISUALS[type];
}
