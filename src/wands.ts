/* Pure helpers for the wand/staff line: cooldown + hunger gating, target-mode
 * classification, and floor-gated spawn selection. Effect resolution lives in
 * the engine (it mutates monsters/player); this module stays side-effect free
 * so it is trivially unit-testable. See design/implemented/wands_and_staves_plan.md. */

import { BALANCE, WAND_POOL } from './config';
import { rollLootRarity } from './items';
import type { Rarity, WandItem, WandType } from './types';
import type { RNG } from './rng';

const RARITY_RANK: Record<Rarity, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};

/** Cooldown a freshly-zapped wand of this kind incurs. Staves recharge faster. */
export function wandCooldown(wand: WandItem): number {
  const base = BALANCE.wands.cooldown[wand.wandType] ?? BALANCE.wands.defaultCooldown;
  if (wand.tier === 'staff') return Math.max(1, base - BALANCE.wands.staffCooldownReduction);
  return base;
}

/** Hunger a single zap of this wand costs, on top of the per-turn drain. */
export function wandHungerCost(wand: WandItem): number {
  return BALANCE.wands.hungerCost[wand.wandType] ?? BALANCE.wands.defaultHungerCost;
}

/** Self-targeted wands ignore aim direction and resolve on the player. */
export function isSelfTargetWand(type: WandType): boolean {
  return type === 'light' || type === 'invisibility' || type === 'nothing';
}

/** Lightning is the only beam in v1: it pierces and hits every monster in line
 *  (all other wands stop on the first monster). */
export function isBeamWand(type: WandType): boolean {
  return type === 'lightning';
}

/** A fresh, carry-ready copy of a catalog wand (cooldown reset, identified). */
export function spawnWand(template: WandItem): WandItem {
  return { ...template, cooldownRemaining: 0, identified: true };
}

/**
 * Pick a floor-appropriate wand: roll a rarity for the floor (same curve gear
 * uses), then choose uniformly among catalog wands at or below that rarity, so
 * high-impact wands (Polymorph, Lightning, …) only surface on deeper floors.
 */
export function pickWandForFloor(floor: number, rng: RNG): WandItem {
  const rolled = rollLootRarity(floor, rng);
  const cap = RARITY_RANK[rolled];
  const eligible = WAND_POOL.filter(w => RARITY_RANK[w.rarity ?? 'common'] <= cap);
  const pool = eligible.length > 0 ? eligible : WAND_POOL;
  return spawnWand(rng.pick(pool));
}
