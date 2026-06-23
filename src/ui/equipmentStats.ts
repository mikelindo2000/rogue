import type { GearItem } from '../types';

export type EquipmentStatKind = 'attack' | 'defense';

export interface EquipCountOption {
  value: string;
  selected?: boolean;
  disabled?: boolean;
}

export function primaryGearStat(item: GearItem | undefined, kind: EquipmentStatKind): number {
  if (!item || item.name === 'None') return 0;
  return kind === 'attack' ? item.dmg ?? 0 : item.def ?? 0;
}

export function gearStatText(item: GearItem | undefined, kind: EquipmentStatKind): string {
  if (!item || item.name === 'None') return kind === 'attack' ? 'ATK +0' : 'DEF 0';
  if (kind === 'attack') return `ATK +${item.dmg ?? 0}`;

  const def = item.def ?? 0;
  const max = item.maxDef ?? def;
  return max > def ? `DEF ${def}/${max}` : `DEF ${def}`;
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
