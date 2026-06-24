import { ARMOR_SLOTS, type GearItem, type Player } from '../types';
import type { EquipOption, EquipSlotView, SlotUpgradeHint } from './store.svelte';
import { titleCase, rarityVar } from './format';
import { SLOT_ICON } from './icons';
import { gearArtUrl } from './inventoryArt';
import {
  availableEquipCount,
  gearHealthView,
  gearStatText,
  gearStatWithCondition,
  hasStatUpgrade,
  primaryGearStat,
  type EquipmentStatKind,
} from './equipmentStats';
import { bestIndex, compareGear } from './gearCompare';

function availableLabel(count: number): string {
  return count === 1 ? '1 item available to equip' : `${count} items available to equip`;
}

/** Custom generated art for an equipped item, or '' when the slot is empty. */
function slotArt(item: GearItem | undefined): string {
  return item && item.name !== 'None' ? gearArtUrl(item) : '';
}

/** Glanceable HUD hint: is a generally-/strictly-better item in the pack?
 *  `candidates` excludes the equipped item and the "None" placeholder. */
function upgradeHint(
  current: GearItem | undefined,
  candidates: GearItem[],
  kind: EquipmentStatKind
): SlotUpgradeHint | undefined {
  let best: GearItem | undefined;
  for (const item of candidates) {
    if (!item || item.name === 'None') continue;
    if (!best || primaryGearStat(item, kind) > primaryGearStat(best, kind)) best = item;
  }
  if (!best) return undefined;
  const cmp = compareGear(current, best, kind);
  if (cmp.statDelta <= 0 && !cmp.strictlyBetter) return undefined;
  return {
    strict: cmp.strictlyBetter,
    bestName: best.name,
    bestStat: gearStatText(best, kind),
  };
}

export function buildEquipmentView(player: Player): EquipSlotView[] {
  const views: EquipSlotView[] = [];
  const weapons = player.inventory.weapons;
  const mainIdx = player.equipped.mainHand;
  const main = weapons[mainIdx];
  const mainBest = bestIndex(weapons, 'attack');
  const mainOptions: EquipOption[] = weapons.map((w, i) => ({
    value: String(i),
    label: w.name,
    meta: gearStatText(w, 'attack'),
    rarityColor: rarityVar(w.rarity),
    selected: mainIdx === i,
    verdict: mainIdx === i ? undefined : compareGear(main, w, 'attack').verdict,
    strictlyBetter: mainIdx === i ? undefined : compareGear(main, w, 'attack').strictlyBetter,
    isBest: i === mainBest,
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
    artUrl: slotArt(main),
    availableCount: mainAvailable,
    availableLabel: availableLabel(mainAvailable),
    hasUpgrade: hasStatUpgrade(main, weapons.filter((_, i) => i !== mainIdx), 'attack'),
    upgrade: upgradeHint(main, weapons.filter((_, i) => i !== mainIdx), 'attack'),
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
    const shieldBest = bestIndex(player.inventory.shield, 'defense');
    player.inventory.shield.forEach((sh, i) => {
      if (i !== 0) {
        const val = 'shield:' + i;
        offCandidates.push({ item: sh, kind: 'defense' });
        // Compare shield-vs-shield only (defense kind); skip when the worn
        // off-hand is a weapon (kinds don't line up).
        const cmp = offKind === 'defense' && off !== val ? compareGear(offGear, sh, 'defense') : undefined;
        offOptions.push({
          value: val,
          label: sh.name,
          meta: gearStatWithCondition(sh, 'defense'),
          rarityColor: rarityVar(sh.rarity),
          selected: off === val,
          verdict: cmp?.verdict,
          strictlyBetter: cmp?.strictlyBetter,
          isBest: i === shieldBest,
          health: gearHealthView(sh, rarityVar(sh.rarity)),
        });
      }
    });
    if (main?.type === 'dagger') {
      weapons.forEach((w, i) => {
        if (w.type === 'dagger' && i !== mainIdx) {
          const val = 'weapon:' + i;
          offCandidates.push({ item: w, kind: 'attack' });
          const cmp = offKind === 'attack' && off !== val ? compareGear(offGear, w, 'attack') : undefined;
          offOptions.push({
            value: val,
            label: w.name,
            meta: gearStatText(w, 'attack'),
            rarityColor: rarityVar(w.rarity),
            selected: off === val,
            verdict: cmp?.verdict,
            strictlyBetter: cmp?.strictlyBetter,
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
    artUrl: is2H ? '' : slotArt(offGear),
    availableCount: offAvailable,
    availableLabel: availableLabel(offAvailable),
    hasUpgrade: offCandidates.some(({ item, kind }) => primaryUpgrade(offGear, offKind, item, kind)),
    upgrade: is2H
      ? undefined
      : upgradeHint(
          offKind === 'defense' ? offGear : undefined,
          player.inventory.shield.filter((_, i) => i !== 0 && `shield:${i}` !== off),
          'defense'
        ),
    options: offOptions,
    health: offKind === 'defense' ? gearHealthView(offGear, rarityVar(offRarity)) : undefined,
  });

  for (const slot of ARMOR_SLOTS) {
    const list = player.inventory[slot];
    const idx = player.equipped[slot];
    const cur = list[idx];
    const slotBest = bestIndex(list, 'defense');
    const options: EquipOption[] = list.map((a, i) => {
      const cmp = idx === i ? undefined : compareGear(cur, a, 'defense');
      return {
        value: String(i),
        label: a.name,
        meta: a.name === 'None' ? undefined : gearStatWithCondition(a, 'defense'),
        rarityColor: rarityVar(a.rarity),
        selected: idx === i,
        verdict: cmp?.verdict,
        strictlyBetter: cmp?.strictlyBetter,
        isBest: i === slotBest,
        health: a.name === 'None' ? undefined : gearHealthView(a, rarityVar(a.rarity)),
      };
    });
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
      artUrl: slotArt(cur),
      availableCount: available,
      availableLabel: availableLabel(available),
      hasUpgrade: hasStatUpgrade(cur, candidates, 'defense'),
      upgrade: upgradeHint(cur, candidates, 'defense'),
      options,
      health: gearHealthView(cur, rarityVar(cur?.rarity)),
    });
  }

  return views;
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
