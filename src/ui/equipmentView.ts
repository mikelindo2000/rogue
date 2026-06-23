import { ARMOR_SLOTS, type GearItem, type Player } from '../types';
import type { EquipOption, EquipSlotView } from './store.svelte';
import { titleCase, rarityVar } from './format';
import { SLOT_ICON } from './icons';
import {
  availableEquipCount,
  gearHealthView,
  gearStatText,
  gearStatWithCondition,
  hasStatUpgrade,
  type EquipmentStatKind,
} from './equipmentStats';

function availableLabel(count: number): string {
  return count === 1 ? '1 item available to equip' : `${count} items available to equip`;
}

function primaryUpgrade(
  current: GearItem | undefined,
  currentKind: EquipmentStatKind,
  candidate: GearItem,
  candidateKind: EquipmentStatKind
): boolean {
  if (!current || current.name === 'None') return hasStatUpgrade(current, [candidate], candidateKind);
  if (currentKind !== candidateKind) return false;
  return hasStatUpgrade(current, [candidate], currentKind);
}

export function buildEquipmentView(player: Player): EquipSlotView[] {
  const views: EquipSlotView[] = [];
  const weapons = player.inventory.weapons;
  const mainIdx = player.equipped.mainHand;
  const main = weapons[mainIdx];
  const mainOptions = weapons.map((w, i) => ({
    value: String(i),
    label: w.name,
    meta: gearStatText(w, 'attack'),
    rarityColor: rarityVar(w.rarity),
    selected: mainIdx === i,
  }));
  const mainAvailable = availableEquipCount(mainOptions);

  views.push({
    slot: 'mainHand',
    label: 'Main hand',
    icon: SLOT_ICON.mainHand,
    itemName: main && main.name !== 'None' ? main.name : '',
    statLabel: gearStatText(main, 'attack'),
    rarityColor: rarityVar(main?.rarity),
    empty: !main || main.name === 'None',
    availableCount: mainAvailable,
    availableLabel: availableLabel(mainAvailable),
    hasUpgrade: hasStatUpgrade(main, weapons.filter((_, i) => i !== mainIdx), 'attack'),
    options: mainOptions,
  });

  const is2H = main?.type?.startsWith('2h_') || main?.type === 'staff';
  const off = player.equipped.offHand;
  let offName = 'None';
  let offRarity: string | undefined = 'common';
  let offGear: GearItem | undefined;
  let offKind: EquipmentStatKind = 'defense';
  if (off.startsWith('shield:')) {
    const s = player.inventory.shield[Number(off.split(':')[1])];
    if (s) {
      offName = s.name;
      offRarity = s.rarity;
      offGear = s;
    }
  } else if (off.startsWith('weapon:')) {
    const w = weapons[Number(off.split(':')[1])];
    if (w) {
      offName = w.name;
      offRarity = w.rarity;
      offGear = w;
      offKind = 'attack';
    }
  }

  let offOptions: EquipOption[];
  const offCandidates: { item: GearItem; kind: EquipmentStatKind }[] = [];
  if (is2H) {
    offOptions = [
      {
        value: 'none:0',
        label: 'Disabled (2H weapon)',
        meta: 'Locked',
        rarityColor: rarityVar('common'),
        selected: true,
        disabled: true,
      },
    ];
  } else {
    offOptions = [
      { value: 'none:0', label: 'None', rarityColor: rarityVar('common'), selected: off === 'none:0' },
    ];
    player.inventory.shield.forEach((sh, i) => {
      if (i !== 0) {
        const val = 'shield:' + i;
        offCandidates.push({ item: sh, kind: 'defense' });
        offOptions.push({
          value: val,
          label: sh.name,
          meta: gearStatWithCondition(sh, 'defense'),
          rarityColor: rarityVar(sh.rarity),
          selected: off === val,
        });
      }
    });
    if (main?.type === 'dagger') {
      weapons.forEach((w, i) => {
        if (w.type === 'dagger' && i !== mainIdx) {
          const val = 'weapon:' + i;
          offCandidates.push({ item: w, kind: 'attack' });
          offOptions.push({
            value: val,
            label: w.name,
            meta: gearStatText(w, 'attack'),
            rarityColor: rarityVar(w.rarity),
            selected: off === val,
          });
        }
      });
    }
  }
  const offAvailable = availableEquipCount(offOptions, ['none:0']);
  views.push({
    slot: 'offHand',
    label: 'Off-hand',
    icon: SLOT_ICON.offHand,
    itemName: is2H || offName === 'None' ? '' : offName,
    emptyLabel: is2H ? '2H locked' : undefined,
    statLabel: is2H ? 'Locked' : gearStatText(offGear, offKind),
    rarityColor: rarityVar(offRarity),
    empty: is2H || offName === 'None',
    availableCount: offAvailable,
    availableLabel: availableLabel(offAvailable),
    hasUpgrade: offCandidates.some(({ item, kind }) => primaryUpgrade(offGear, offKind, item, kind)),
    options: offOptions,
    health: offKind === 'defense' ? gearHealthView(offGear, rarityVar(offRarity)) : undefined,
  });

  for (const slot of ARMOR_SLOTS) {
    const list = player.inventory[slot];
    const idx = player.equipped[slot];
    const cur = list[idx];
    const options = list.map((a, i) => ({
      value: String(i),
      label: a.name,
      meta: a.name === 'None' ? undefined : gearStatWithCondition(a, 'defense'),
      rarityColor: rarityVar(a.rarity),
      selected: idx === i,
    }));
    const available = availableEquipCount(options, ['0']);
    const candidates = list.filter((a, i) => i !== idx && a.name !== 'None');
    views.push({
      slot,
      label: titleCase(slot),
      icon: SLOT_ICON[slot],
      itemName: cur && cur.name !== 'None' ? cur.name : '',
      statLabel: gearStatText(cur, 'defense'),
      rarityColor: rarityVar(cur?.rarity),
      empty: !cur || cur.name === 'None',
      availableCount: available,
      availableLabel: availableLabel(available),
      hasUpgrade: hasStatUpgrade(cur, candidates, 'defense'),
      options,
      health: gearHealthView(cur, rarityVar(cur?.rarity)),
    });
  }

  return views;
}
