import { describe, expect, it } from 'vitest';
import { createPlayer } from '../player';
import type { EquipSlotView } from './store.svelte';
import { buildEquipmentView } from './equipmentView';

function slotView(views: EquipSlotView[], slot: string): EquipSlotView {
  const view = views.find((item) => item.slot === slot);
  if (!view) throw new Error(`Missing ${slot} equipment view`);
  return view;
}

describe('equipment view assembly', () => {
  it('adds stats, availability counts, and upgrade cues to weapon and armor slots', () => {
    const player = createPlayer();
    player.inventory.weapons.push({ name: 'Shortsword', type: '1h_sword', dmg: 5, rarity: 'uncommon' });
    player.inventory.gauntlets.push({ name: 'Iron Gauntlets', def: 2, maxDef: 2, rarity: 'uncommon' });

    const views = buildEquipmentView(player);

    expect(slotView(views, 'mainHand')).toMatchObject({
      itemName: 'Iron Dagger',
      statLabel: 'ATK +2',
      availableCount: 1,
      hasUpgrade: true,
    });
    expect(slotView(views, 'mainHand').options[1]).toMatchObject({
      label: 'Shortsword',
      meta: 'ATK +5',
    });

    expect(slotView(views, 'gauntlets')).toMatchObject({
      empty: true,
      statLabel: 'DEF 0',
      availableCount: 1,
      hasUpgrade: true,
    });
    expect(slotView(views, 'gauntlets').options[1]).toMatchObject({
      label: 'Iron Gauntlets',
      meta: 'DEF 2',
    });
  });

  it('counts legal off-hand alternatives and clears availability when two-handed gear locks the slot', () => {
    const player = createPlayer();
    player.inventory.shield.push({ name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' });
    player.inventory.weapons.push({ name: 'Steel Dagger', type: 'dagger', dmg: 3, rarity: 'common' });

    let offHand = slotView(buildEquipmentView(player), 'offHand');
    expect(offHand).toMatchObject({
      empty: true,
      statLabel: 'DEF 0',
      availableCount: 2,
      hasUpgrade: true,
    });
    expect(offHand.options.map((option) => [option.label, option.meta])).toEqual([
      ['None', undefined],
      ['Buckler', 'DEF 2'],
      ['Steel Dagger', 'ATK +3'],
    ]);

    player.inventory.weapons.push({ name: 'Warhammer', type: '2h_mace', dmg: 8, rarity: 'rare' });
    player.equipped.mainHand = 2;

    offHand = slotView(buildEquipmentView(player), 'offHand');
    expect(offHand).toMatchObject({
      empty: true,
      emptyLabel: '2H locked',
      statLabel: 'Locked',
      availableCount: 0,
      hasUpgrade: false,
    });
    expect(offHand.options).toEqual([
      {
        value: 'none:0',
        label: 'Disabled (2H weapon)',
        meta: 'Locked',
        rarityColor: 'var(--rarity-common)',
        selected: true,
        disabled: true,
      },
    ]);
  });
});
