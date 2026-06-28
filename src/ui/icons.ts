/* Icon registry — line/stroke icons transcribed from the design's inline SVGs.
   Each entry is the inner markup of a 24×24 viewBox; <Icon> wraps it with the
   shared stroke styling (currentColor, round caps/joins). Keeping the path data
   in one place lets every component pull from the same visual vocabulary.

   Inventory item families should be grouped as small registries below rather
   than appended into one long object. When adding a potion, update
   src/itemVisuals.ts first, then add the paired bottle + cue icon here. */

import type { PotionIconName, ScrollIconName, WandIconName } from '../itemVisuals';

export type CoreIconName =
  | 'coin'
  | 'shield' // heraldic shield — defense stat
  | 'shield-dome' // round shield — off-hand / shield item
  | 'sword'
  | 'helm'
  | 'chest'
  | 'legs'
  | 'gauntlets'
  | 'boots'
  | 'leaf' // food / eat
  | 'book' // scroll
  | 'key'
  | 'pouch'
  | 'sliders' // settings
  | 'volume' // sound on
  | 'mute' // sound off
  | 'copy'; // copy to clipboard

const CORE_ICONS: Record<CoreIconName, string> = {
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.8 10h3.4a1.6 1.6 0 010 3.2H10"/>',
  shield: '<path d="M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  'shield-dome': '<path d="M5 13a7 7 0 0114 0v3H5z"/><path d="M5 16h14"/>',
  sword: '<path d="M5 19l9-9"/><path d="M14 10l4-4 1-3-3 1-4 4z"/><path d="M4 18l2 2"/>',
  helm: '<path d="M5 13a7 7 0 0114 0v3H5z"/><path d="M5 16h14"/><path d="M12 8v8"/>',
  chest: '<path d="M8 4l4 2 4-2 3 3-2 3v9H7v-9L5 7z"/>',
  legs: '<rect x="6" y="4" width="5" height="16" rx="1"/><rect x="13" y="4" width="5" height="16" rx="1"/>',
  gauntlets:
    '<path d="M7 11V6a1.4 1.4 0 012.8 0v4m0 0V5a1.4 1.4 0 012.8 0v5m0 0V6a1.4 1.4 0 012.8 0v6a6 6 0 01-6 6H9a3 3 0 01-3-3v-1l-1-1.5a1.4 1.4 0 012-2"/>',
  boots: '<path d="M8 3v9l-2 1-1 4v3h12v-2a4 4 0 00-4-4h-2V3z"/>',
  leaf: '<path d="M14 4a5 5 0 00-5 8l-5 5 1.6 1.6L11 14a5 5 0 003-10z"/><path d="M5 19l1.4-1.4"/>',
  book: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 9.5h8M8 13h8M8 16.5h5"/>',
  key: '<circle cx="8.5" cy="8.5" r="3.5"/><path d="M11 11l8.5 8.5M16 16l2-2M18 18l2-2"/>',
  pouch: '<path d="M5 13a4 4 0 014-7h6a4 4 0 014 7l-1 6H6z"/>',
  sliders:
    '<path d="M4 7h9"/><circle cx="16" cy="7" r="2"/><path d="M18 7h2"/><path d="M4 12h2"/><circle cx="8" cy="12" r="2"/><path d="M10 12h10"/><path d="M4 17h11"/><circle cx="17" cy="17" r="2"/><path d="M19 17h1"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9.5a4 4 0 010 5"/><path d="M18.5 7a7 7 0 010 10"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
};

const bottle = '<path d="M9 3h6M10 3v5l-4 9a1.8 1.8 0 001.7 2.5h8.6A1.8 1.8 0 0018 17l-4-9V3"/><path d="M7.5 14h9"/>';

const POTION_ICONS: Record<PotionIconName, string> = {
  'potion-healing': `${bottle}<path d="M12 10.5v5M9.5 13h5"/>`,
  'potion-strength': `${bottle}<path d="M12.9 9.7l-2.6 4h3.3l-2.5 4.6"/>`,
  'potion-invisibility': `${bottle}<path d="M8.4 13s1.4-2.1 3.6-2.1 3.6 2.1 3.6 2.1-1.4 2.1-3.6 2.1S8.4 13 8.4 13z"/><circle cx="12" cy="13" r="1.05"/>`,
  'potion-armor': `${bottle}<path d="M12 10l3 1.2v2.1c0 1.8-1.2 3.1-3 3.9-1.8-.8-3-2.1-3-3.9v-2.1z"/>`,
};

// Named scrolls share a rolled-parchment body with a per-type emblem. The
// `light` scroll carries a small sun/rune burst. Add new scrolls here when you
// add a ScrollType + its SCROLL_VISUALS entry.
const scroll = '<path d="M7 4h8a2 2 0 012 2v12a2 2 0 01-2 2H7"/><path d="M7 4a2 2 0 00-2 2v0a2 2 0 002 2M7 20a2 2 0 002-2V6"/>';

const SCROLL_ICONS: Record<ScrollIconName, string> = {
  // sun/rune burst
  'scroll-light': `${scroll}<circle cx="13" cy="12" r="2"/><path d="M13 7.5v1.5M13 15v1.5M8.8 12h1.4M16 12h1.4M10.2 9.2l1 1M14.8 13.8l1 1M15.8 9.2l-1 1M10.2 14.8l1-1"/>`,
  // anvil with a mending spark
  'scroll-repair': `${scroll}<path d="M8.5 11h7l-1.3 2.2H10.8z"/><path d="M12 13.4v3M10 16.4h4"/><path d="M15.4 9l.3 1 1 .3-1 .3-.3 1-.3-1-1-.3 1-.3z"/>`,
  // dungeon grid
  'scroll-magic_mapping': `${scroll}<rect x="9" y="9" width="6.5" height="6.5" rx="0.6"/><path d="M12.2 9v6.5M9 12.2h6.5"/>`,
  // watching eye with monster glyph pings
  'scroll-monster_detection': `${scroll}<path d="M8.6 12s1.5-2.3 3.4-2.3 3.4 2.3 3.4 2.3-1.5 2.3-3.4 2.3S8.6 12 8.6 12z"/><circle cx="12" cy="12" r="0.85"/><path d="M8.6 8.7l.8.8M15.4 8.7l-.8.8M8.6 15.3l.8-.8M15.4 15.3l-.8-.8"/>`,
  // portal spiral
  'scroll-teleportation': `${scroll}<path d="M12.5 15a2.6 2.6 0 10-2.6-3.3 1.6 1.6 0 103.1.5"/>`,
  // two chain links
  'scroll-hold_monster': `${scroll}<rect x="8.6" y="10.7" width="3.5" height="2.6" rx="1.3"/><rect x="11.6" y="10.7" width="3.5" height="2.6" rx="1.3"/>`,
  // crescent moon
  'scroll-sleep': `${scroll}<path d="M14.6 9.6a3.3 3.3 0 100 4.9 3.9 3.9 0 010-4.9z"/>`,
  // three claws
  'scroll-create_monster': `${scroll}<path d="M9.6 9.4l.9 5.4M12.3 9l.3 5.6M15 9.4l-.9 5.4"/>`,
  // radiating sound waves
  'scroll-aggravate_monsters': `${scroll}<circle cx="9.6" cy="12.2" r="0.9"/><path d="M11.6 9.8a4 4 0 010 4.8M13.8 8.4a7 7 0 010 7.6"/>`,
  // sword with a spark
  'scroll-enchant_weapon': `${scroll}<path d="M9.4 16.2l4.6-4.6M14 11.6l1.6-1.6M9 15.6l1 1"/><path d="M15.4 12.6l.3 1 1 .3-1 .3-.3 1-.3-1-1-.3 1-.3z"/>`,
  // breastplate
  'scroll-enchant_armor': `${scroll}<path d="M9.4 9.6l2.6 1 2.6-1 .9 1.6-1 1.1v3.3H9.5v-3.3l-1-1.1z"/>`,
  // shield under a warding dome
  'scroll-protect_armor': `${scroll}<path d="M12 10l2.8 1v2c0 1.7-1.1 2.8-2.8 3.4-1.7-.6-2.8-1.7-2.8-3.4v-2z"/><path d="M8.7 9.6a3.3 2.8 0 016.6 0"/>`,
  // broken chain (gap between links)
  'scroll-remove_curse': `${scroll}<rect x="8.4" y="10.6" width="3" height="2.6" rx="1.3"/><rect x="12.6" y="10.6" width="3" height="2.6" rx="1.3"/><path d="M11.6 9.4l.8 1.1M12.4 14.5l.8 1.1"/>`,
  // watching eye
  'scroll-identify': `${scroll}<path d="M8.6 12s1.5-2.4 3.4-2.4 3.4 2.4 3.4 2.4-1.5 2.4-3.4 2.4S8.6 12 8.6 12z"/><circle cx="12" cy="12" r="1"/>`,
  // bread leaf
  'scroll-food_detection': `${scroll}<path d="M14.2 9.4a3 3 0 00-3 4.6l-2.4 2 1 1 2.4-2.4a3 3 0 002-5.2z"/>`,
  // coin
  'scroll-gold_detection': `${scroll}<circle cx="12" cy="12.2" r="3"/><path d="M12 10.4v3.6M10.9 11.2h2.1a1 1 0 010 2H11"/>`,
  // twin disorientation swirls
  'scroll-monster_confusion': `${scroll}<path d="M9.6 11.6a1.5 1.5 0 102 1.4"/><path d="M14.4 12.8a1.5 1.5 0 10-2-1.4"/>`,
  // a frightened mask
  'scroll-scare_monster': `${scroll}<path d="M9.2 10.2h5.6v1.8a2.8 2.8 0 01-5.6 0z"/><circle cx="10.8" cy="11" r="0.5"/><circle cx="13.2" cy="11" r="0.5"/>`,
  // blank parchment — no emblem
  'scroll-blank_paper': `${scroll}`,
};

// Wands share a diagonal rod (handle at lower-left, tip at upper-right); each
// type carries a distinct emblem at the tip, drawn around (16.5, 7.5). Add a new
// wand here when you add a WandType + its WAND_VISUALS entry.
const wandRod = '<path d="M4 20l9.5-9.5"/><path d="M3 19l2 2"/>';

const WAND_ICONS: Record<WandIconName, string> = {
  // force impact — short rays bursting from the tip
  'wand-striking': `${wandRod}<path d="M16.5 7.5l2.4-2.4M16.5 7.5l2.9.5M16.5 7.5l-.5 2.9M16.5 7.5l2.4 2.4"/>`,
  // a sharp arcane dart leaving the tip
  'wand-magic_missile': `${wandRod}<path d="M13.6 10.4l5.8-5.8"/><path d="M16.6 4.6h2.8v2.8"/>`,
  // forked lightning bolt
  'wand-lightning': `${wandRod}<path d="M17.5 4l-2.6 3.6h2.8l-2.6 3.6"/>`,
  // teardrop flame
  'wand-fire': `${wandRod}<path d="M16.5 4.4c2.4 2 2.4 4.2 0 5.6-2.4-1.4-2.4-3.6 0-5.6z"/>`,
  // six-point frost star
  'wand-cold': `${wandRod}<path d="M16.5 4.2v6.6M13.6 5.9l5.8 3.2M19.4 5.9l-5.8 3.2"/>`,
  // a sleepy crescent moon
  'wand-sleep': `${wandRod}<path d="M19 4.6a3.4 3.4 0 100 5.8 4.2 4.2 0 010-5.8z"/>`,
  // mutating spiral
  'wand-polymorph': `${wandRod}<path d="M16.5 10.4a2.9 2.9 0 10-2.9-2.9 1.8 1.8 0 103.6 0"/>`,
  // concentric portal rings
  'wand-teleport_away': `${wandRod}<circle cx="16.5" cy="7.5" r="3"/><circle cx="16.5" cy="7.5" r="1"/>`,
  // null sign — circle struck through
  'wand-cancellation': `${wandRod}<circle cx="16.5" cy="7.5" r="3"/><path d="M14.4 9.6l4.2-4.2"/>`,
  // a draining heart
  'wand-drain_life': `${wandRod}<path d="M16.5 10.6c-2.4-1.7-3.4-3.2-2-4.5.9-.8 1.8-.1 2 .6.2-.7 1.1-1.4 2-.6 1.4 1.3.4 2.8-2 4.5z"/>`,
  // radiant sun
  'wand-light': `${wandRod}<circle cx="16.5" cy="7.5" r="1.8"/><path d="M16.5 3.7v1.4M16.5 9.9v1.4M12.7 7.5h1.4M18.9 7.5h1.4M13.8 4.8l1 1M18.2 9.2l1 1M19.2 4.8l-1 1M13.8 10.2l1-1"/>`,
  // a watching eye (here, then gone)
  'wand-invisibility': `${wandRod}<path d="M13.4 7.5s1.4-2.1 3.1-2.1 3.1 2.1 3.1 2.1-1.4 2.1-3.1 2.1-3.1-2.1-3.1-2.1z"/><circle cx="16.5" cy="7.5" r=".85"/>`,
  // a hollow nub — the dud
  'wand-nothing': `${wandRod}<circle cx="16.5" cy="7.5" r="1.9"/>`,
};

export type IconName = CoreIconName | PotionIconName | ScrollIconName | WandIconName;

export const ICONS: Record<IconName, string> = {
  ...CORE_ICONS,
  ...POTION_ICONS,
  ...SCROLL_ICONS,
  ...WAND_ICONS,
};

/** Icon used for each equipment slot when filled or empty. */
export const SLOT_ICON: Record<string, IconName> = {
  mainHand: 'sword',
  offHand: 'shield-dome',
  helm: 'helm',
  chest: 'chest',
  legs: 'legs',
  gauntlets: 'gauntlets',
  boots: 'boots',
};
