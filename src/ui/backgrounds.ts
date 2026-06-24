import type { RNG } from '../rng';

export const FLOOR_BACKGROUND_VARIANTS = ['a', 'b', 'c', 'd'] as const;
export const FLOOR_MIN = 1;
export const FLOOR_MAX = 20;

export type FloorBackgroundVariant = (typeof FLOOR_BACKGROUND_VARIANTS)[number];

export interface FloorBackgroundTheme {
  floor: number;
  title: string;
  intensity: string;
}

export const FLOOR_BACKGROUND_THEMES: FloorBackgroundTheme[] = [
  { floor: 1, title: 'Ember Gate', intensity: 'quiet threshold' },
  { floor: 2, title: 'Collapsed Barracks', intensity: 'watchful ruin' },
  { floor: 3, title: 'Moss-Lit Cistern', intensity: 'damp unease' },
  { floor: 4, title: 'Goblin Warrens', intensity: 'crowded menace' },
  { floor: 5, title: 'Forgotten Chapel', intensity: 'haunted stillness' },
  { floor: 6, title: 'Verdigris Garden', intensity: 'poisoned growth' },
  { floor: 7, title: 'Sunken Archive', intensity: 'arcane pressure' },
  { floor: 8, title: 'Crystal Mines', intensity: 'razor shimmer' },
  { floor: 9, title: 'Fungal Furnace', intensity: 'sickly heat' },
  { floor: 10, title: 'Bone Market', intensity: 'grim spectacle' },
  { floor: 11, title: 'Violet Vaults', intensity: 'uncanny magic' },
  { floor: 12, title: 'Mirror Labyrinth', intensity: 'fractured dread' },
  { floor: 13, title: 'Storm Crypts', intensity: 'restless violence' },
  { floor: 14, title: 'Astral Prison', intensity: 'cosmic strain' },
  { floor: 15, title: 'Black Altar', intensity: 'ritual danger' },
  { floor: 16, title: 'Dragon Depths', intensity: 'scorched peril' },
  { floor: 17, title: 'Lava Aqueduct', intensity: 'molten urgency' },
  { floor: 18, title: 'Obsidian Armory', intensity: 'war at the door' },
  { floor: 19, title: 'Ashen Throne Approach', intensity: 'near-finale dread' },
  { floor: 20, title: 'Amulet Heart', intensity: 'final boss chamber' },
];

export const FLOOR_BACKGROUNDS = FLOOR_BACKGROUND_THEMES.flatMap(({ floor }) =>
  FLOOR_BACKGROUND_VARIANTS.map(variant => floorBackgroundName(floor, variant))
);

export const LEGACY_DUNGEON_BACKGROUNDS = Array.from({ length: 30 }, (_, i) => `bg_${i + 1}.png`);

/**
 * Returns the URL path to a background image file in public/backgrounds/
 */
export function backgroundUrl(name: string): string {
  return `/backgrounds/${name}`;
}

/**
 * Returns the four themed background variants for the requested floor.
 */
export function floorBackgrounds(floor: number): string[] {
  const safeFloor = clampFloor(floor);
  return FLOOR_BACKGROUND_VARIANTS.map(variant => floorBackgroundName(safeFloor, variant));
}

/**
 * Picks a random themed background for the requested floor, optionally using a seedable RNG.
 */
export function pickFloorBackground(floor: number, rng?: RNG): string {
  const backgrounds = floorBackgrounds(floor);
  if (rng) {
    const idx = Math.floor(rng.next() * backgrounds.length);
    return backgrounds[idx];
  }
  const idx = Math.floor(Math.random() * backgrounds.length);
  return backgrounds[idx];
}

function floorBackgroundName(floor: number, variant: FloorBackgroundVariant): string {
  return `floor-${String(floor).padStart(2, '0')}-${variant}.png`;
}

function clampFloor(floor: number): number {
  if (!Number.isFinite(floor)) return FLOOR_MIN;
  return Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, Math.trunc(floor)));
}
