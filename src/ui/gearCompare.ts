/* Gear comparison helpers — the shared "is this better?" logic the HUD,
 * the loadout hub, and the inventory grid all render from.
 *
 * The game-state side (effective defense, durability) lives in ../gearHealth;
 * this module only layers comparison/verdict semantics on top so we never
 * duplicate stat math. */

import type { GearItem } from '../types';
import { effectiveDefense, gearHealthRatio } from '../gearHealth';
import { primaryGearStat, type EquipmentStatKind } from './equipmentStats';

/** How a candidate item stacks up against what's currently equipped. */
export type GearVerdict = 'upgrade' | 'sidegrade' | 'downgrade';

export interface GearComparison {
  /** Candidate primary stat minus current (effective defense, or attack). */
  statDelta: number;
  /** Candidate max defense minus current. 0 for weapons (no durability). */
  durabilityDelta: number;
  verdict: GearVerdict;
  /** True when the candidate is >= the current item on every axis (effective
   *  defense, max defense, condition) and strictly greater on at least one —
   *  the "clearly better in every way" case. Against an empty slot, true for any
   *  candidate with a positive primary stat. */
  strictlyBetter: boolean;
}

function isReal(item: GearItem | undefined): item is GearItem {
  return !!item && item.name !== 'None';
}

function maxDefenseOf(item: GearItem): number {
  return item.health?.max ?? item.maxDef ?? effectiveDefense(item);
}

/** Condition ratio in [0,1]; 1 when the item has no durability concept. */
function conditionOf(item: GearItem): number {
  return gearHealthRatio(item) ?? 1;
}

/** Compare a candidate against the currently-equipped item for a slot.
 *  `current` may be undefined or the "None" placeholder (an empty slot). */
export function compareGear(
  current: GearItem | undefined,
  candidate: GearItem,
  kind: EquipmentStatKind
): GearComparison {
  const candStat = primaryGearStat(candidate, kind);
  const curStat = primaryGearStat(current, kind);
  const statDelta = candStat - curStat;

  // Empty slot: any real candidate is a strict improvement over nothing.
  if (!isReal(current)) {
    return {
      statDelta,
      durabilityDelta: kind === 'defense' ? maxDefenseOf(candidate) : 0,
      verdict: candStat > 0 ? 'upgrade' : 'sidegrade',
      strictlyBetter: candStat > 0,
    };
  }

  const verdict: GearVerdict = statDelta > 0 ? 'upgrade' : statDelta < 0 ? 'downgrade' : 'sidegrade';

  if (kind !== 'defense') {
    // Weapons have no durability axis; the only axis is attack.
    return { statDelta, durabilityDelta: 0, verdict, strictlyBetter: statDelta > 0 };
  }

  const candMax = maxDefenseOf(candidate);
  const curMax = maxDefenseOf(current);
  const candCond = conditionOf(candidate);
  const curCond = conditionOf(current);

  const allAtLeast = candStat >= curStat && candMax >= curMax && candCond >= curCond;
  const anyGreater = candStat > curStat || candMax > curMax || candCond > curCond;

  return {
    statDelta,
    durabilityDelta: candMax - curMax,
    verdict,
    strictlyBetter: allAtLeast && anyGreater,
  };
}

/** Strict ranking tuple: higher is better, compared lexicographically. */
function rankTuple(item: GearItem, kind: EquipmentStatKind): [number, number, number] {
  if (kind === 'attack') return [item.dmg ?? 0, 0, 0];
  return [effectiveDefense(item), maxDefenseOf(item), conditionOf(item)];
}

function tupleGreater(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Index of the single strongest equippable item in `items` (rank by effective
 *  stat, then max defense, then condition). Skips the "None" placeholder.
 *  Returns -1 when there is no real item. */
export function bestIndex(items: GearItem[], kind: EquipmentStatKind): number {
  let best = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isReal(item)) continue;
    if (best === -1 || tupleGreater(rankTuple(item, kind), rankTuple(items[best], kind))) {
      best = i;
    }
  }
  return best;
}
