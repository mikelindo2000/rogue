import type { RNG } from '../rng';

export const DUNGEON_BACKGROUNDS = Array.from({ length: 30 }, (_, i) => `bg_${i + 1}.png`);

/**
 * Returns the URL path to a background image file in public/backgrounds/
 */
export function backgroundUrl(name: string): string {
  return `/backgrounds/${name}`;
}

/**
 * Picks a random background image from the pool, optionally using a seedable RNG.
 */
export function pickRandomBg(rng?: RNG): string {
  if (rng) {
    const idx = Math.floor(rng.next() * DUNGEON_BACKGROUNDS.length);
    return DUNGEON_BACKGROUNDS[idx];
  }
  const idx = Math.floor(Math.random() * DUNGEON_BACKGROUNDS.length);
  return DUNGEON_BACKGROUNDS[idx];
}
