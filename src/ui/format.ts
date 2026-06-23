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
export type SurvivalWarningTone = 'none' | 'hunger' | 'health' | 'both';

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

export interface SurvivalWarningInput {
  hp: number;
  maxHp: number;
  hunger: number;
  hungerFatigued: number;
}

export interface SurvivalWarningView {
  tone: SurvivalWarningTone;
  intensity: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Derive the ambient survival warning state for the app shell. */
export function survivalWarningView({
  hp,
  maxHp,
  hunger,
  hungerFatigued,
}: SurvivalWarningInput): SurvivalWarningView {
  const hungerStart = hungerFatigued + 50;
  const hpPct = maxHp > 0 ? hp / maxHp : 1;
  const healthActive = hp > 0 && hpPct <= 0.25;
  const hungerActive = hunger < hungerStart;

  if (!healthActive && !hungerActive) return { tone: 'none', intensity: 0 };

  const healthIntensity = healthActive
    ? 0.45 + clamp01((0.25 - hpPct) / 0.1) * 0.55
    : 0;
  const hungerIntensity = hungerActive
    ? 0.4 + clamp01((hungerStart - hunger) / Math.max(1, hungerStart)) * 0.6
    : 0;

  if (healthActive && hungerActive) {
    return { tone: 'both', intensity: Math.min(1, Math.max(healthIntensity, hungerIntensity) + 0.12) };
  }
  if (hungerActive) return { tone: 'hunger', intensity: hungerIntensity };
  return { tone: 'health', intensity: healthIntensity };
}

/** Flavor name shown in the top bar for each of the 20 floors, descending from
 *  the entrance halls toward the final boss floor. Not part of game logic. */
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
  'The Rusted Catacombs',
  'The Whispering Mire',
  'The Cinder Wastes',
  'The Fungal Warrens',
  'The Obsidian Span',
  'The Frostbound Vault',
  'The Screaming Dark',
  'The Molten Sanctum',
  'The Sundered Throne',
  'The Abyssal Gate',
  'The Heart of the Deep',
];

export function floorName(floor: number): string {
  if (floor <= 0) return FLOOR_NAMES[0];
  return FLOOR_NAMES[(floor - 1) % FLOOR_NAMES.length];
}

/** Capitalize the first letter (potion/type labels). */
export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
