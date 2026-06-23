import { describe, expect, it } from 'vitest';
import { createPlayer } from '../player';
import { buildInventoryComparisons, gearTooltipStats, shortGearStatText, weaponTypeLabel } from './inventoryStats';

describe('inventory stat helpers', () => {
  it('formats compact stat labels and weapon tooltip rows', () => {
    expect(shortGearStatText({ name: 'Shortsword', dmg: 5 }, 'attack')).toBe('ATK 5');
    expect(shortGearStatText({ name: 'Buckler', def: 2 }, 'defense')).toBe('DEF 2');
    expect(weaponTypeLabel('2h_mace')).toBe('Two-handed mace');
    expect(gearTooltipStats({ name: 'Fire Staff', type: 'staff', dmg: 7, magic: 'fire' }, 'attack')).toEqual([
      { label: 'Damage', value: '7', tone: 'better' },
      { label: 'Type', value: 'Staff' },
      { label: 'Hands', value: 'Two-handed' },
      { label: 'Magic', value: 'Fire' },
    ]);
  });

  it('compares carried weapons against equipped main hand and legal off-hand', () => {
    const player = createPlayer();
    const steelDagger = { name: 'Steel Dagger', type: 'dagger' as const, dmg: 3, rarity: 'common' as const };
    player.inventory.weapons.push(steelDagger);

    const comparisons = buildInventoryComparisons(player, { kind: 'weapon', index: 1 }, steelDagger);

    expect(comparisons).toHaveLength(2);
    expect(comparisons[0]).toMatchObject({
      slot: 'mainHand',
      currentName: 'Iron Dagger',
      currentStatLabel: 'ATK +2',
      candidateStatLabel: 'ATK +3',
      deltaLabel: '+1',
      tone: 'better',
    });
    expect(comparisons[1]).toMatchObject({
      slot: 'offHand',
      currentName: 'Empty',
      candidateStatLabel: 'ATK +3',
      deltaLabel: '+3',
      tone: 'better',
    });
  });

  it('shows locked off-hand comparison when a shield is blocked by a two-handed weapon', () => {
    const player = createPlayer();
    player.inventory.weapons.push({ name: 'Warhammer', type: '2h_mace', dmg: 8, rarity: 'rare' });
    player.equipped.mainHand = 1;
    const buckler = { name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' as const };
    player.inventory.shield.push(buckler);

    const comparisons = buildInventoryComparisons(player, { kind: 'shield', index: 1 }, buckler);

    expect(comparisons).toEqual([
      expect.objectContaining({
        slot: 'offHand',
        currentName: 'Empty',
        candidateStatLabel: 'DEF 2',
        deltaLabel: 'locked',
        tone: 'blocked',
        note: 'Two-handed weapons require an empty off-hand.',
      }),
    ]);
  });

  it('shows the off-hand loss when previewing a two-handed weapon', () => {
    const player = createPlayer();
    player.inventory.shield.push({ name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' });
    player.equipped.offHand = 'shield:1';
    const warhammer = { name: 'Warhammer', type: '2h_mace' as const, dmg: 8, rarity: 'rare' as const };
    player.inventory.weapons.push(warhammer);

    const comparisons = buildInventoryComparisons(player, { kind: 'weapon', index: 1 }, warhammer);

    expect(comparisons).toEqual([
      expect.objectContaining({
        slot: 'mainHand',
        candidateStatLabel: 'ATK +8',
        deltaLabel: '+6',
        tone: 'better',
      }),
      expect.objectContaining({
        slot: 'offHand',
        currentName: 'Buckler',
        currentStatLabel: 'DEF 2',
        candidateName: 'Empty',
        candidateStatLabel: 'DEF 0',
        deltaLabel: '-2',
        tone: 'worse',
        note: 'Equipping this clears your off-hand.',
      }),
    ]);
  });

  it('compares armor to the matching equipped slot', () => {
    const player = createPlayer();
    const chainmail = { name: 'Chainmail', def: 4, maxDef: 4, rarity: 'uncommon' as const };
    player.inventory.chest.push(chainmail);

    const comparisons = buildInventoryComparisons(player, { kind: 'armor', slot: 'chest', index: 2 }, chainmail);

    expect(comparisons).toEqual([
      expect.objectContaining({
        slot: 'chest',
        currentName: 'Tattered Rags',
        currentStatLabel: 'DEF 1',
        candidateStatLabel: 'DEF 4',
        deltaLabel: '+3',
        tone: 'better',
      }),
    ]);
  });
});
