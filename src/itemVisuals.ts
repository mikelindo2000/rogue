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

export const SCROLL_TYPES = [
  'light', 'repair', 'magic_mapping', 'monster_detection', 'teleportation', 'hold_monster', 'sleep',
  'create_monster', 'aggravate_monsters', 'enchant_weapon', 'enchant_armor',
  'protect_armor', 'remove_curse', 'identify', 'food_detection', 'gold_detection',
  'monster_confusion', 'scare_monster', 'blank_paper',
] as const satisfies readonly ScrollType[];

/**
 * Shared visual identity for named scrolls across the floor glyph and inventory.
 * Add a new scroll type here first, then add the paired icon in src/ui/icons.ts
 * and generated art in public/inventory/ per design/implemented/inventory_image_generation.md.
 */
export const SCROLL_VISUALS: Record<ScrollType, ScrollVisual> = {
  light:              { icon: 'scroll-light',              mapColor: '#ffd86b', uiColor: 'var(--scroll-light)', accent: 'warm-gold' },
  repair:             { icon: 'scroll-repair',             mapColor: '#b9c4d0', uiColor: '#b9c4d0', accent: 'silver anvil' },
  magic_mapping:      { icon: 'scroll-magic_mapping',      mapColor: '#6bb8ff', uiColor: '#6bb8ff', accent: 'blueprint blue' },
  monster_detection:  { icon: 'scroll-monster_detection',  mapColor: '#66e0c2', uiColor: '#66e0c2', accent: 'psychic teal' },
  teleportation:      { icon: 'scroll-teleportation',      mapColor: '#b06bff', uiColor: '#b06bff', accent: 'portal violet' },
  hold_monster:       { icon: 'scroll-hold_monster',       mapColor: '#8fcfd6', uiColor: '#8fcfd6', accent: 'spectral teal' },
  sleep:              { icon: 'scroll-sleep',              mapColor: '#9fb0ff', uiColor: '#9fb0ff', accent: 'drowsy periwinkle' },
  create_monster:     { icon: 'scroll-create_monster',     mapColor: '#ff6b6b', uiColor: '#ff6b6b', accent: 'summoning red' },
  aggravate_monsters: { icon: 'scroll-aggravate_monsters', mapColor: '#ff944d', uiColor: '#ff944d', accent: 'alarm orange' },
  enchant_weapon:     { icon: 'scroll-enchant_weapon',     mapColor: '#7db8ff', uiColor: '#7db8ff', accent: 'rune blue' },
  enchant_armor:      { icon: 'scroll-enchant_armor',      mapColor: '#9fd0a0', uiColor: '#9fd0a0', accent: 'warding green' },
  protect_armor:      { icon: 'scroll-protect_armor',      mapColor: '#ffd27a', uiColor: '#ffd27a', accent: 'golden ward' },
  remove_curse:       { icon: 'scroll-remove_curse',       mapColor: '#d0d0d8', uiColor: '#d0d0d8', accent: 'cleansing white' },
  identify:           { icon: 'scroll-identify',           mapColor: '#cda6ff', uiColor: '#cda6ff', accent: 'revealing lavender' },
  food_detection:     { icon: 'scroll-food_detection',     mapColor: '#e0a062', uiColor: '#e0a062', accent: 'warm amber' },
  gold_detection:     { icon: 'scroll-gold_detection',     mapColor: '#ffe066', uiColor: '#ffe066', accent: 'coin gold' },
  monster_confusion:  { icon: 'scroll-monster_confusion',  mapColor: '#ff7ab0', uiColor: '#ff7ab0', accent: 'dizzy crimson' },
  scare_monster:      { icon: 'scroll-scare_monster',      mapColor: '#c0c6cf', uiColor: '#c0c6cf', accent: 'fearful gray' },
  blank_paper:        { icon: 'scroll-blank_paper',        mapColor: '#cbb89a', uiColor: '#cbb89a', accent: 'muted beige' },
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
