import { getConfig } from '../../config';
import { potionVisual, scrollVisual, wandVisual } from '../../itemVisuals';
import { canEquip } from '../../player';
import { SCROLLS, scrollDisplayName } from '../../scrolls';
import {
  ARMOR_SLOTS,
  type InventoryRef,
  type Player,
  type PotionType,
  type ScrollType,
} from '../../types';
import { gearHealthView } from '../../ui/equipmentStats';
import { buildEquipmentView } from '../../ui/equipmentView';
import { titleCase, rarityVar } from '../../ui/format';
import { bestIndex, compareGear } from '../../ui/gearCompare';
import { SLOT_ICON } from '../../ui/icons';
import { foodArtUrl, gearArtUrl, potionArtUrl, scrollArtUrl, wandArtUrl } from '../../ui/inventoryArt';
import {
  buildInventoryComparisons,
  gearTooltipStats,
  shortGearStatText,
  weaponTypeLabel,
} from '../../ui/inventoryStats';
import { buildPotionOptions, potionDetail, potionLabel, potionTooltipStats } from '../../ui/potionView';
import { buildReadiedWandView } from '../../ui/readiedWandView';
import type { InventoryActionView, InventoryCell } from '../../ui/store.svelte';
import { wandDetail, wandLabel, wandTooltipStats } from '../../ui/wandView';

export interface InventoryProjection {
  readonly equipment: ReturnType<typeof buildEquipmentView>;
  readonly readiedWand: ReturnType<typeof buildReadiedWandView>;
  readonly cells: InventoryCell[];
  readonly count: number;
  readonly potions: ReturnType<typeof buildPotionOptions>;
}

export function projectInventory(player: Player): InventoryProjection {
  const cells = buildInventoryCells(player);
  return {
    equipment: buildEquipmentView(player),
    readiedWand: buildReadiedWandView(player),
    cells,
    count: cells.length,
    potions: buildPotionOptions(player.inventory.potions),
  };
}

function buildInventoryCells(player: Player): InventoryCell[] {
  const cells: InventoryCell[] = [];

  if (player.inventory.food > 0) {
    const ref: InventoryRef = { kind: 'food' };
    cells.push({
      icon: 'leaf',
      artUrl: foodArtUrl(),
      rarityColor: rarityVar('common'),
      count: player.inventory.food > 1 ? player.inventory.food : undefined,
      label: `Rations ×${player.inventory.food}`,
      detail: `Restores hunger. You can carry ${player.inventory.food}/${getConfig().playerMaxFood}.`,
      ref,
      actions: inventoryActions(player, ref),
    });
  }

  const potCounts = new Map<PotionType, number>();
  player.inventory.potions.forEach(p => potCounts.set(p, (potCounts.get(p) ?? 0) + 1));
  for (const [type, n] of potCounts) {
    const ref: InventoryRef = { kind: 'potion', potionType: type };
    const visual = potionVisual(type);
    cells.push({
      icon: visual.icon,
      artUrl: potionArtUrl(type),
      rarityColor: visual.uiColor,
      count: n > 1 ? n : undefined,
      label: potionLabel(type, n),
      detail: potionDetail(type),
      tooltipStats: potionTooltipStats(type),
      ref,
      actions: inventoryActions(player, ref),
    });
  }

  const scrollCounts = new Map<ScrollType, number>();
  player.inventory.scrolls.forEach(s => scrollCounts.set(s, (scrollCounts.get(s) ?? 0) + 1));
  for (const [type, n] of scrollCounts) {
    const ref: InventoryRef = { kind: 'scroll', scrollType: type };
    const visual = scrollVisual(type);
    const def = SCROLLS[type];
    const name = scrollDisplayName(type);
    cells.push({
      icon: visual.icon,
      artUrl: scrollArtUrl(type),
      rarityColor: visual.uiColor,
      count: n > 1 ? n : undefined,
      label: n > 1 ? `${name} ×${n}` : name,
      detail: def.detail,
      statLabel: def.harmful ? 'Risky' : undefined,
      ref,
      actions: inventoryActions(player, ref),
    });
  }

  player.inventory.wands.forEach((wand, i) => {
    const ref: InventoryRef = { kind: 'wand', index: i };
    const visual = wandVisual(wand.wandType);
    const cd = wand.cooldownRemaining ?? 0;
    cells.push({
      icon: visual.icon,
      artUrl: wandArtUrl(wand),
      rarityColor: rarityVar(wand.rarity),
      count: cd > 0 ? cd : undefined,
      label: wandLabel(wand),
      detail: wandDetail(wand),
      tooltipStats: wandTooltipStats(wand),
      ref,
      actions: inventoryActions(player, ref),
    });
  });

  const mainWeapon = player.inventory.weapons[player.equipped.mainHand];
  const weaponBest = bestIndex(player.inventory.weapons, 'attack');
  player.inventory.weapons.forEach((w, i) => {
    if (i !== player.equipped.mainHand && player.equipped.offHand !== 'weapon:' + i) {
      const ref: InventoryRef = { kind: 'weapon', index: i };
      const cmp = compareGear(mainWeapon, w, 'attack');
      cells.push({
        icon: 'sword',
        artUrl: gearArtUrl(w),
        rarityColor: rarityVar(w.rarity),
        label: w.name,
        detail: `${weaponTypeLabel(w.type)} weapon. ${w.dmg ?? 0} damage.`,
        statLabel: shortGearStatText(w, 'attack'),
        tooltipStats: gearTooltipStats(w, 'attack'),
        comparisons: buildInventoryComparisons(player, ref, w),
        verdict: cmp.verdict,
        strictlyBetter: cmp.strictlyBetter,
        isBest: i === weaponBest,
        ref,
        actions: inventoryActions(player, ref),
      });
    }
  });

  for (const slot of ARMOR_SLOTS) {
    const wornArmor = player.inventory[slot][player.equipped[slot]];
    const armorBest = bestIndex(player.inventory[slot], 'defense');
    player.inventory[slot].forEach((a, i) => {
      if (i !== player.equipped[slot] && a.name !== 'None') {
        const ref: InventoryRef = { kind: 'armor', slot, index: i };
        const cmp = compareGear(wornArmor, a, 'defense');
        cells.push({
          icon: SLOT_ICON[slot],
          artUrl: gearArtUrl(a),
          rarityColor: rarityVar(a.rarity),
          label: a.name,
          detail: `${titleCase(slot)} armor. ${a.def ?? 0}/${a.maxDef ?? a.def ?? 0} defense.`,
          statLabel: shortGearStatText(a, 'defense'),
          health: gearHealthView(a, rarityVar(a.rarity)),
          tooltipStats: [
            { label: 'Slot', value: titleCase(slot) },
            ...gearTooltipStats(a, 'defense'),
          ],
          comparisons: buildInventoryComparisons(player, ref, a),
          verdict: cmp.verdict,
          strictlyBetter: cmp.strictlyBetter,
          isBest: i === armorBest,
          ref,
          actions: inventoryActions(player, ref),
        });
      }
    });
  }

  const wornShield = player.equipped.offHand.startsWith('shield:')
    ? player.inventory.shield[Number(player.equipped.offHand.split(':')[1])]
    : undefined;
  const shieldBest = bestIndex(player.inventory.shield, 'defense');
  player.inventory.shield.forEach((s, i) => {
    if (i !== 0 && player.equipped.offHand !== 'shield:' + i) {
      const ref: InventoryRef = { kind: 'shield', index: i };
      const cmp = compareGear(wornShield, s, 'defense');
      cells.push({
        icon: 'shield-dome',
        artUrl: gearArtUrl(s),
        rarityColor: rarityVar(s.rarity),
        label: s.name,
        detail: `Off-hand shield. ${s.def ?? 0}/${s.maxDef ?? s.def ?? 0} defense.`,
        statLabel: shortGearStatText(s, 'defense'),
        health: gearHealthView(s, rarityVar(s.rarity)),
        tooltipStats: [
          { label: 'Slot', value: 'Off-hand' },
          ...gearTooltipStats(s, 'defense'),
        ],
        comparisons: buildInventoryComparisons(player, ref, s),
        verdict: cmp.verdict,
        strictlyBetter: cmp.strictlyBetter,
        isBest: i === shieldBest,
        ref,
        actions: inventoryActions(player, ref),
      });
    }
  });

  return cells;
}

function inventoryActions(player: Player, ref: InventoryRef): InventoryActionView[] {
  const drop: InventoryActionView = { action: 'drop', label: 'Drop' };

  if (ref.kind === 'food') {
    return [{ action: 'use', label: 'Eat' }, drop];
  }
  if (ref.kind === 'potion') {
    return [{ action: 'use', label: 'Drink' }, drop];
  }
  if (ref.kind === 'scroll') {
    return [{ action: 'use', label: 'Read' }, drop];
  }
  if (ref.kind === 'wand') {
    const wand = player.inventory.wands[ref.index];
    const recharging = (wand?.cooldownRemaining ?? 0) > 0;
    return [{
      action: 'zap',
      label: 'Zap',
      disabled: recharging,
      reason: recharging ? `Recharging (${wand?.cooldownRemaining})` : undefined,
    }, drop];
  }

  if (ref.kind === 'weapon') {
    const main = canEquip(player, { slot: 'mainHand', index: ref.index });
    const actions: InventoryActionView[] = [
      {
        action: 'equip',
        label: 'Equip main',
        disabled: !main.ok,
        reason: main.ok ? undefined : main.reason,
      },
    ];
    const off = canEquip(player, { slot: 'offHand', value: `weapon:${ref.index}` });
    actions.push({
      action: 'equipOffHand',
      label: 'Equip off-hand',
      disabled: !off.ok,
      reason: off.ok ? undefined : off.reason,
    });
    actions.push(drop);
    return actions;
  }

  if (ref.kind === 'armor') {
    const result = canEquip(player, { slot: ref.slot, index: ref.index });
    return [{
      action: 'equip',
      label: `Equip ${titleCase(ref.slot)}`,
      disabled: !result.ok,
      reason: result.ok ? undefined : result.reason,
    }, drop];
  }

  const result = canEquip(player, { slot: 'offHand', value: `shield:${ref.index}` });
  return [{
    action: 'equip',
    label: 'Equip shield',
    disabled: !result.ok,
    reason: result.ok ? undefined : result.reason,
  }, drop];
}
