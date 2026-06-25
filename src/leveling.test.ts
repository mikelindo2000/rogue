import { describe, it, expect } from 'vitest';
import { createPlayer, gainXp } from './player';
import { getScaledXpRequirements, BALANCE, monsterKillXp, MONSTER_XP_TABLE, MONSTER_DATABASE } from './config';
import { StatusEffects } from './types';

const addLog = (_msg: string) => {};

function zeroStatus(): StatusEffects {
  return { vigorTurns: 0, midasTurns: 0, strengthTurns: 0, invisTurns: 0, armorTurns: 0, monsterDetectionTurns: 0 };
}

describe('monsterKillXp (depth-indexed, no under-level spiral)', () => {
  it('returns the floor-row value for a monster fought at its depth', () => {
    expect(monsterKillXp(1, 'Brown Bat')).toBe(MONSTER_XP_TABLE[1]['Brown Bat']);
    expect(monsterKillXp(17, 'Cyclops')).toBe(MONSTER_XP_TABLE[17]['Cyclops']);
  });

  it('pays out for deep monsters regardless of (low) player progress — the old spiral case', () => {
    // The bug: when XP keyed on player.level, a low-level player fighting a deep
    // monster got 0. Depth-indexing means every deep monster fought at-depth pays.
    for (const t of MONSTER_DATABASE) {
      if (t.special === 'boss') continue;
      expect(monsterKillXp(t.minFloor, t.name)).toBeGreaterThan(0);
    }
  });

  it('falls back to the nearest row for a monster lingering off its prime depth', () => {
    // Nymph (minFloor 9) isn't in the floor-20 row; it should still pay its nearest
    // listed value rather than 0.
    expect(MONSTER_XP_TABLE[20]?.['Nymph']).toBeUndefined();
    expect(monsterKillXp(20, 'Nymph')).toBeGreaterThan(0);
  });

  it('returns 0 for an unknown monster name', () => {
    expect(monsterKillXp(5, 'Not A Monster')).toBe(0);
  });
});

describe('gainXp', () => {
  it('returns false and does not change level for amount <= 0', () => {
    const player = createPlayer();
    const startLevel = player.level;
    const startXp = player.xp;

    expect(gainXp(player, 0, addLog, zeroStatus())).toBe(false);
    expect(gainXp(player, -50, addLog, zeroStatus())).toBe(false);
    expect(player.level).toBe(startLevel);
    expect(player.xp).toBe(startXp);
  });

  it('raises level to 2 and grows maxHp when granted exactly the level-1 requirement', () => {
    const player = createPlayer();
    const oldMaxHp = player.maxHp;
    const req = getScaledXpRequirements()[player.level]; // requirement for current level (1)

    const leveledUp = gainXp(player, req, addLog, zeroStatus());

    expect(leveledUp).toBe(true);
    expect(player.level).toBe(2);
    expect(player.maxHp).toBe(Math.floor(oldMaxHp * BALANCE.player.levelUpHpMultiplier));
    expect(player.xp).toBe(0); // exactly consumed, no leftover
  });

  it('levels up multiple times but never beyond level 20, and returns false once at cap', () => {
    const player = createPlayer();

    const leveledUp = gainXp(player, 100_000_000, addLog, zeroStatus());
    expect(leveledUp).toBe(true);
    expect(player.level).toBe(20);

    // Already at cap: further XP gains are no-ops returning false.
    const xpAtCap = player.xp;
    expect(gainXp(player, 100_000_000, addLog, zeroStatus())).toBe(false);
    expect(player.level).toBe(20);
    expect(player.xp).toBe(xpAtCap); // guard returns before adding xp
  });

  it('carries leftover XP correctly after a level-up', () => {
    const player = createPlayer();
    const xpReqs = getScaledXpRequirements();
    const req1 = xpReqs[player.level]; // level 1 -> 2 requirement
    const overflow = 250;

    const leveledUp = gainXp(player, req1 + overflow, addLog, zeroStatus());

    expect(leveledUp).toBe(true);
    expect(player.level).toBe(2);
    expect(player.xp).toBe(overflow);

    // Leftover must be below the requirement for the new current level.
    const req2 = xpReqs[player.level];
    expect(player.xp).toBeLessThan(req2);
  });
});
