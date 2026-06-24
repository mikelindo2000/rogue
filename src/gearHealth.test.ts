import { describe, expect, it } from 'vitest';
import { createPlayer, getTotalDef } from './player';
import type { GearItem } from './types';
import type { RNG } from './rng';
import {
  damageEquippedGear,
  effectiveDefense,
  gearHealthLabel,
  gearHealthTone,
  normalizeGearHealth,
  repairAllDefensiveGear,
} from './gearHealth';

function riggedRng(roll = 0): RNG {
  return {
    seed: 1,
    next: () => roll,
    int: max => Math.min(max - 1, Math.floor(roll * max)),
    range: (min, max) => Math.min(max, min + Math.floor(roll * (max - min + 1))),
    chance: p => roll < p,
    pick: arr => arr[0],
    getState: () => 0,
  };
}

describe('gear health', () => {
  it('normalizes legacy def/maxDef armor into explicit health', () => {
    const chainmail: GearItem = { name: 'Chainmail', def: 3, maxDef: 5 };

    normalizeGearHealth(chainmail);

    expect(chainmail.health).toEqual({ current: 3, max: 5 });
    expect(effectiveDefense(chainmail)).toBe(3);
    expect(gearHealthLabel(chainmail)).toBe('3/5');
    expect(gearHealthTone(chainmail)).toBe('worn');
  });

  it('clamps corrupt health and keeps def/maxDef synced', () => {
    const shield: GearItem = { name: 'Cracked Shield', def: 9, maxDef: 4, health: { current: -2, max: 4 } };

    normalizeGearHealth(shield);

    expect(shield.health).toEqual({ current: 0, max: 4 });
    expect(shield.def).toBe(0);
    expect(shield.maxDef).toBe(4);
    expect(gearHealthTone(shield)).toBe('broken');
  });

  it('damages one equipped defensive item and broken gear contributes no defense', () => {
    const player = createPlayer();
    player.inventory.chest[1] = { name: 'Tattered Rags', def: 1, maxDef: 1, health: { current: 1, max: 1 } };
    player.equipped.chest = 1;

    const result = damageEquippedGear(player, riggedRng(0), 8);

    expect(result).toMatchObject({ slot: 'chest', before: 1, after: 0, max: 1, broken: true });
    expect(player.inventory.chest[1].health).toEqual({ current: 0, max: 1 });
    expect(getTotalDef(player, { vigorTurns: 0, midasTurns: 0, strengthTurns: 0, invisTurns: 0, armorTurns: 0, monsterDetectionTurns: 0 })).toBe(0);
  });

  it('skips empty gear and leaves gear untouched when wear chance misses', () => {
    const player = createPlayer();
    player.inventory.chest[1] = { name: 'Tattered Rags', def: 1, maxDef: 1, health: { current: 1, max: 1 } };
    player.equipped.chest = 1;

    const result = damageEquippedGear(player, riggedRng(0.99), 1);

    expect(result).toBeNull();
    expect(player.inventory.chest[1].health).toEqual({ current: 1, max: 1 });
  });

  it('repairs all carried armor and shields', () => {
    const player = createPlayer();
    player.inventory.chest[1] = { name: 'Chainmail', def: 2, maxDef: 5, health: { current: 2, max: 5 } };
    player.inventory.shield.push({ name: 'Buckler', def: 0, maxDef: 3, health: { current: 0, max: 3 } });

    const repaired = repairAllDefensiveGear(player);

    expect(repaired).toBe(2);
    expect(player.inventory.chest[1].health).toEqual({ current: 5, max: 5 });
    expect(player.inventory.chest[1].def).toBe(5);
    expect(player.inventory.shield[1].health).toEqual({ current: 3, max: 3 });
    expect(player.inventory.shield[1].def).toBe(3);
  });
});
