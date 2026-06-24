import type { GearItem } from '../types';
import {
  effectiveDefense,
  gearHealthLabel,
  gearHealthRatio,
  gearHealthTone,
  type GearHealthTone,
} from '../gearHealth';
import type { GearHealthView } from './store.svelte';

export type EquipmentStatKind = 'attack' | 'defense';

export interface EquipCountOption {
  value: string;
  selected?: boolean;
  disabled?: boolean;
}

export function primaryGearStat(item: GearItem | undefined, kind: EquipmentStatKind): number {
  if (!item || item.name === 'None') return 0;
  return kind === 'attack' ? item.dmg ?? 0 : effectiveDefense(item);
}

export function gearStatText(item: GearItem | undefined, kind: EquipmentStatKind): string {
  if (!item || item.name === 'None') return kind === 'attack' ? 'ATK +0' : 'DEF 0';
  if (kind === 'attack') return `ATK +${item.dmg ?? 0}`;

  const def = effectiveDefense(item);
  const max = item.health?.max ?? item.maxDef ?? def;
  return max > def ? `DEF ${def}/${max}` : `DEF ${def}`;
}

export function shortGearStatText(item: GearItem | undefined, kind: EquipmentStatKind): string {
  if (!item || item.name === 'None') return kind === 'attack' ? 'ATK 0' : 'DEF 0';
  if (kind === 'attack') return `ATK ${item.dmg ?? 0}`;
  const def = effectiveDefense(item);
  const max = item.health?.max ?? item.maxDef ?? def;
  return max > def ? `DEF ${def}/${max}` : `DEF ${def}`;
}

function conditionColor(tone: GearHealthTone, fallbackColor: string): string {
  if (tone === 'good') return fallbackColor;
  if (tone === 'worn') return 'var(--accent)';
  if (tone === 'bad') return 'var(--danger)';
  if (tone === 'broken') return 'var(--text-faint)';
  return fallbackColor;
}

export function gearHealthView(item: GearItem | undefined, fallbackColor: string): GearHealthView | undefined {
  const label = gearHealthLabel(item);
  const ratio = gearHealthRatio(item);
  const tone = gearHealthTone(item);
  if (!label || ratio === null || tone === 'none') return undefined;
  // gearHealthLabel normalizes the item in place, so health is populated here.
  const current = item?.health?.current ?? 0;
  const max = item?.health?.max ?? current;
  return {
    label,
    ratio,
    current,
    max,
    tone,
    color: conditionColor(tone, fallbackColor),
  };
}

export function gearConditionText(item: GearItem | undefined): string | undefined {
  const tone = gearHealthTone(item);
  if (tone === 'worn') return 'worn';
  if (tone === 'bad') return 'critical';
  if (tone === 'broken') return 'broken';
  return undefined;
}

export function gearStatWithCondition(item: GearItem | undefined, kind: EquipmentStatKind): string {
  const stat = gearStatText(item, kind);
  if (kind !== 'defense') return stat;
  const condition = gearConditionText(item);
  return condition ? `${stat} · ${condition}` : stat;
}

export function availableEquipCount(
  options: EquipCountOption[],
  emptyValues: readonly string[] = []
): number {
  const empty = new Set(emptyValues);
  return options.filter((option) => !option.selected && !option.disabled && !empty.has(option.value)).length;
}

export function hasStatUpgrade(
  current: GearItem | undefined,
  candidates: GearItem[],
  kind: EquipmentStatKind
): boolean {
  const currentStat = primaryGearStat(current, kind);
  return candidates.some((item) => primaryGearStat(item, kind) > currentStat);
}
