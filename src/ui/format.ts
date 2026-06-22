/* Pure display helpers shared by the state bridge and components.
   No DOM, no runes — just game data → presentation mapping, so it can be unit
   tested and reused freely. */

import type { Rarity } from '../types';

/** Map a gear rarity to its UI color token (kept separate from RARITY_CONFIG,
 *  which colors the canvas glyphs and must not change). */
export function rarityVar(rarity: string | undefined): string {
  switch (rarity as Rarity) {
    case 'uncommon':
      return 'var(--rarity-uncommon)';
    case 'rare':
      return 'var(--rarity-rare)';
    case 'epic':
      return 'var(--rarity-epic)';
    case 'legendary':
      return 'var(--rarity-legendary)';
    default:
      return 'var(--rarity-common)';
  }
}

export type HungerTone = 'ok' | 'warn' | 'low' | 'crit';

export interface HungerView {
  status: string;
  pct: number; // 0–100, share of max hunger remaining
  tone: HungerTone;
}

/** Derive the hunger ring's label/percent/tone from raw hunger and thresholds. */
export function hungerView(
  hunger: number,
  fatigued: number,
  hungry: number,
  max: number
): HungerView {
  const pct = Math.max(0, Math.min(100, Math.round((hunger / max) * 100)));
  if (hunger === 0) return { status: 'Starving', pct, tone: 'crit' };
  if (hunger < fatigued) return { status: 'Fatigued', pct, tone: 'low' };
  if (hunger < hungry) return { status: 'Hungry', pct, tone: 'warn' };
  return { status: 'Satiated', pct, tone: 'ok' };
}

/** Cosmetic per-floor names (flavor only — the game has no floor names). */
const FLOOR_NAMES = [
  'The Sunless Halls',
  'The Weeping Caverns',
  'The Gnawed Tunnels',
  'The Ashen Vault',
  'The Drowned Crypt',
  'The Shattered Galleries',
  'The Ember Deeps',
  'The Hollow Reliquary',
  'The Bone Orchard',
  'The Silent Abyss',
];

export function floorName(floor: number): string {
  if (floor <= 0) return FLOOR_NAMES[0];
  return FLOOR_NAMES[(floor - 1) % FLOOR_NAMES.length];
}

/** Capitalize the first letter (potion/type labels). */
export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
