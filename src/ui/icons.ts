/* Icon registry — line/stroke icons transcribed from the design's inline SVGs.
   Each entry is the inner markup of a 24×24 viewBox; <Icon> wraps it with the
   shared stroke styling (currentColor, round caps/joins). Keeping the path data
   in one place lets every component pull from the same visual vocabulary. */

export type IconName =
  | 'coin'
  | 'shield' // heraldic shield — defense stat
  | 'shield-dome' // round shield — off-hand / shield item
  | 'sword'
  | 'helm'
  | 'chest'
  | 'legs'
  | 'gauntlets'
  | 'boots'
  | 'potion'
  | 'leaf' // food / eat
  | 'book' // scroll
  | 'key'
  | 'pouch';

export const ICONS: Record<IconName, string> = {
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
  potion: '<path d="M9 3h6M10 3v5l-4 9a1.8 1.8 0 001.7 2.5h8.6A1.8 1.8 0 0018 17l-4-9V3"/><path d="M7.5 14h9"/>',
  leaf: '<path d="M14 4a5 5 0 00-5 8l-5 5 1.6 1.6L11 14a5 5 0 003-10z"/><path d="M5 19l1.4-1.4"/>',
  book: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 9.5h8M8 13h8M8 16.5h5"/>',
  key: '<circle cx="8.5" cy="8.5" r="3.5"/><path d="M11 11l8.5 8.5M16 16l2-2M18 18l2-2"/>',
  pouch: '<path d="M5 13a4 4 0 014-7h6a4 4 0 014 7l-1 6H6z"/>',
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
