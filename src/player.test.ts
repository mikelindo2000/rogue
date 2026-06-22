import { describe, expect, it } from 'vitest';
import { canEquip, createPlayer, equipValidated, inventoryRefToEquipTarget } from './player';

const logs = () => {
  const entries: string[] = [];
  return { entries, add: (msg: string) => entries.push(msg) };
};

describe('equipment validation', () => {
  it('clears off-hand equipment when a two-handed weapon is equipped', () => {
    const player = createPlayer();
    const log = logs();
    player.inventory.shield.push({ name: 'Kite Shield', def: 4, maxDef: 4, rarity: 'common' });
    player.inventory.weapons.push({ name: 'Warhammer', type: '2h_mace', dmg: 12, rarity: 'common' });
    player.equipped.offHand = 'shield:1';

    const equipped = equipValidated(player, { slot: 'mainHand', index: 1 }, log.add);

    expect(equipped).toBe(true);
    expect(player.equipped.mainHand).toBe(1);
    expect(player.equipped.offHand).toBe('none:0');
    expect(log.entries).toContain('Off-hand unequipped (2-Handed weapon requirement).');
  });

  it('rejects off-hand shields while a two-handed weapon is equipped', () => {
    const player = createPlayer();
    player.inventory.weapons.push({ name: 'Claymore', type: '2h_sword', dmg: 10, rarity: 'common' });
    player.inventory.shield.push({ name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' });
    player.equipped.mainHand = 1;

    const result = canEquip(player, { slot: 'offHand', value: 'shield:1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Two-handed/);
  });

  it('allows off-hand daggers only when both hands use different daggers', () => {
    const player = createPlayer();
    const log = logs();
    player.inventory.weapons.push({ name: 'Steel Dagger', type: 'dagger', dmg: 3, rarity: 'common' });
    player.inventory.weapons.push({ name: 'Shortsword', type: '1h_sword', dmg: 5, rarity: 'common' });

    expect(equipValidated(player, { slot: 'offHand', value: 'weapon:1' }, log.add)).toBe(true);
    expect(player.equipped.offHand).toBe('weapon:1');

    const sameHand = canEquip(player, { slot: 'offHand', value: 'weapon:0' });
    expect(sameHand.ok).toBe(false);

    expect(equipValidated(player, { slot: 'mainHand', index: 2 }, log.add)).toBe(true);
    expect(player.equipped.offHand).toBe('none:0');
    expect(log.entries).toContain('Off-hand weapon unequipped.');
  });

  it('rejects non-canonical off-hand command values', () => {
    const player = createPlayer();
    const log = logs();
    player.inventory.shield.push({ name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' });
    player.inventory.weapons.push({ name: 'Steel Dagger', type: 'dagger', dmg: 3, rarity: 'common' });

    expect(equipValidated(player, { slot: 'offHand', value: 'shield:1:stale' }, log.add)).toBe(false);
    expect(equipValidated(player, { slot: 'offHand', value: 'weapon:01' }, log.add)).toBe(false);
    expect(player.equipped.offHand).toBe('none:0');
    expect(log.entries).toContain('That off-hand item cannot be equipped.');
  });

  it('maps inventory refs to their equipment targets', () => {
    const player = createPlayer();
    player.inventory.helm.push({ name: 'Iron Helm', def: 3, maxDef: 3, rarity: 'common' });
    player.inventory.shield.push({ name: 'Buckler', def: 2, maxDef: 2, rarity: 'common' });

    expect(inventoryRefToEquipTarget(player, { kind: 'weapon', index: 0 })).toEqual({ slot: 'mainHand', index: 0 });
    expect(inventoryRefToEquipTarget(player, { kind: 'armor', slot: 'helm', index: 1 })).toEqual({ slot: 'helm', index: 1 });
    expect(inventoryRefToEquipTarget(player, { kind: 'shield', index: 1 })).toEqual({ slot: 'offHand', value: 'shield:1' });
    expect(inventoryRefToEquipTarget(player, { kind: 'armor', slot: 'boots', index: 9 })).toBeNull();
  });
});
