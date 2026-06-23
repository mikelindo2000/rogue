import type { EquipSlot, GearItem, InventoryRef, Player, WeaponType } from '../types';
import { canEquip } from '../player';
import { titleCase } from './format';
import { SLOT_ICON } from './icons';
import type { InventoryComparisonView, InventoryTooltipStat } from './store.svelte';
import {
  gearStatText,
  primaryGearStat,
  shortGearStatText,
  type EquipmentStatKind,
} from './equipmentStats';

export function weaponTypeLabel(type?: string): string {
  if (!type) return 'Unknown';
  return titleCase(type.replace(/^1h_/, 'one-handed ').replace(/^2h_/, 'two-handed ').replace(/_/g, ' '));
}

export function gearTooltipStats(item: GearItem, kind: EquipmentStatKind): InventoryTooltipStat[] {
  const rows: InventoryTooltipStat[] = [];

  if (kind === 'attack') {
    rows.push({ label: 'Damage', value: String(item.dmg ?? 0), tone: 'better' });
    rows.push({ label: 'Type', value: weaponTypeLabel(item.type) });
    rows.push({ label: 'Hands', value: weaponHandsLabel(item.type) });
    if (item.magic) rows.push({ label: 'Magic', value: titleCase(item.magic) });
    return rows;
  }

  const def = item.def ?? 0;
  const max = item.maxDef ?? def;
  rows.push({ label: 'Defense', value: max > def ? `${def}/${max}` : String(def), tone: 'better' });
  rows.push({ label: 'Durability', value: `${def}/${max}` });
  return rows;
}

export function buildInventoryComparisons(
  player: Player,
  ref: InventoryRef,
  item: GearItem
): InventoryComparisonView[] {
  if (ref.kind === 'weapon') return weaponComparisons(player, ref.index, item);
  if (ref.kind === 'armor') {
    return [
      comparisonRow({
        slot: ref.slot,
        current: player.inventory[ref.slot][player.equipped[ref.slot]],
        currentKind: 'defense',
        candidate: item,
        candidateKind: 'defense',
      }),
    ];
  }
  if (ref.kind === 'shield') {
    const off = equippedOffHand(player);
    const result = canEquip(player, { slot: 'offHand', value: `shield:${ref.index}` });
    return [
      comparisonRow({
        slot: 'offHand',
        current: off.item,
        currentKind: off.kind,
        candidate: item,
        candidateKind: 'defense',
        blockedReason: result.ok ? undefined : result.reason,
      }),
    ];
  }
  return [];
}

function weaponComparisons(player: Player, index: number, item: GearItem): InventoryComparisonView[] {
  const off = equippedOffHand(player);
  const rows = [
    comparisonRow({
      slot: 'mainHand',
      current: player.inventory.weapons[player.equipped.mainHand],
      currentKind: 'attack',
      candidate: item,
      candidateKind: 'attack',
    }),
  ];

  const offResult = canEquip(player, { slot: 'offHand', value: `weapon:${index}` });
  if (offResult.ok || item.type === 'dagger') {
    rows.push(
      comparisonRow({
        slot: 'offHand',
        current: off.item,
        currentKind: off.kind,
        candidate: item,
        candidateKind: 'attack',
        blockedReason: offResult.ok ? undefined : offResult.reason,
      })
    );
  }
  if (isTwoHandedWeapon(item) && off.item && off.item.name !== 'None') {
    rows.push(offHandClearedRow(off.item, off.kind));
  }

  return rows;
}

function equippedOffHand(player: Player): { item: GearItem | undefined; kind: EquipmentStatKind } {
  const off = player.equipped.offHand;
  if (off.startsWith('shield:')) {
    return { item: player.inventory.shield[Number(off.split(':')[1])], kind: 'defense' };
  }
  if (off.startsWith('weapon:')) {
    return { item: player.inventory.weapons[Number(off.split(':')[1])], kind: 'attack' };
  }
  return { item: undefined, kind: 'defense' };
}

function comparisonRow({
  slot,
  current,
  currentKind,
  candidate,
  candidateKind,
  blockedReason,
}: {
  slot: EquipSlot;
  current: GearItem | undefined;
  currentKind: EquipmentStatKind;
  candidate: GearItem;
  candidateKind: EquipmentStatKind;
  blockedReason?: string;
}): InventoryComparisonView {
  const effectiveCurrentKind = current && current.name !== 'None' ? currentKind : candidateKind;
  const delta = primaryGearStat(candidate, candidateKind) - primaryGearStat(current, effectiveCurrentKind);
  const comparable = effectiveCurrentKind === candidateKind;
  const tone = blockedReason ? 'blocked' : comparable ? deltaTone(delta) : 'same';

  return {
    slot,
    slotLabel: slotLabel(slot),
    icon: SLOT_ICON[slot],
    currentName: current && current.name !== 'None' ? current.name : 'Empty',
    currentStatLabel: gearStatText(current, effectiveCurrentKind),
    candidateStatLabel: gearStatText(candidate, candidateKind),
    deltaLabel: blockedReason ? 'locked' : comparable ? deltaLabel(delta) : 'swap',
    tone,
    note: blockedReason,
  };
}

function slotLabel(slot: EquipSlot): string {
  if (slot === 'mainHand') return 'Main hand';
  if (slot === 'offHand') return 'Off-hand';
  return titleCase(slot);
}

function deltaTone(delta: number): InventoryComparisonView['tone'] {
  if (delta > 0) return 'better';
  if (delta < 0) return 'worse';
  return 'same';
}

function deltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function offHandClearedRow(current: GearItem, currentKind: EquipmentStatKind): InventoryComparisonView {
  const loss = -primaryGearStat(current, currentKind);
  return {
    slot: 'offHand',
    slotLabel: 'Off-hand',
    icon: SLOT_ICON.offHand,
    currentName: current.name,
    currentStatLabel: gearStatText(current, currentKind),
    candidateName: 'Empty',
    candidateStatLabel: currentKind === 'attack' ? 'ATK +0' : 'DEF 0',
    deltaLabel: deltaLabel(loss),
    tone: loss < 0 ? 'worse' : 'same',
    note: 'Equipping this clears your off-hand.',
  };
}

function isTwoHandedWeapon(item: GearItem): boolean {
  return item.type?.startsWith('2h_') || item.type === 'staff';
}

function weaponHandsLabel(type: WeaponType | undefined): string {
  if (type?.startsWith('2h_') || type === 'staff') return 'Two-handed';
  return 'One-handed';
}

export { shortGearStatText };
