import { describe, expect, it } from 'vitest';
import { createPlayer } from '../../player';
import { projectInventory } from './inventoryProjection';

describe('projectInventory', () => {
  it('builds inventory cells, equipment, potion summaries, and readied wand without store writes', () => {
    const player = createPlayer();
    player.inventory.food = 2;
    player.inventory.potions.push('healing', 'healing');
    player.inventory.scrolls.push('light', 'light');
    player.inventory.wands.push({
      name: 'Wand of Cold',
      wandType: 'cold',
      tier: 'wand',
      rarity: 'rare',
      cooldownRemaining: 3,
    });
    player.inventory.weapons.push({
      name: 'Jeweled Sword',
      type: '1h_sword',
      dmg: 8,
      rarity: 'rare',
    });
    player.inventory.shield.push({
      name: 'Kite Shield',
      def: 4,
      maxDef: 4,
      rarity: 'uncommon',
    });

    const projection = projectInventory(player);

    expect(projection.equipment.map(slot => slot.slot)).toContain('mainHand');
    expect(projection.potions).toEqual([expect.objectContaining({ idx: 0, label: 'Healing', count: 2 })]);
    expect(projection.count).toBe(projection.cells.length);
    expect(projection.cells.map(item => item.label)).toEqual(expect.arrayContaining([
      'Rations ×2',
      'Potion of Healing ×2',
      'Scroll of Light ×2',
      'Wand of Cold (recharging 3)',
      'Jeweled Sword',
      'Kite Shield',
    ]));
    expect(projection.cells.find(item => item.ref.kind === 'food')?.actions.map(action => action.label)).toEqual([
      'Eat',
      'Drop',
    ]);
    expect(projection.cells.find(item => item.ref.kind === 'wand')?.actions[0]).toMatchObject({
      action: 'zap',
      disabled: true,
      reason: 'Recharging (3)',
    });
  });
});
