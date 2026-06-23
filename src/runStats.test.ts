import { describe, expect, it } from 'vitest';
import {
  buildRunSummary,
  calculateScore,
  chooseRunTitle,
  createRunStats,
  recordChest,
  recordDamageDealt,
  recordDamageTaken,
  recordFoodEaten,
  recordGearPickedUp,
  recordMonsterKilled,
  recordPotionDrunk,
  recordSearch,
  recordSecretReveal,
  recordStairs,
  recordStep,
} from './runStats';
import type { Monster, Player } from './types';

const player = (): Player => ({
  x: 1,
  y: 1,
  hp: 7,
  maxHp: 20,
  gold: 40,
  hunger: 500,
  baseAtk: 2,
  regenTurns: 0,
  disarmedHits: 0,
  undeadFoods: 0,
  level: 3,
  xp: 14,
  inventory: {
    food: 1,
    weapons: [{ name: 'Iron Dagger', dmg: 2, rarity: 'common' }],
    potions: ['healing', 'armor'],
    scrolls: ['light'],
    wands: [],
    shield: [{ name: 'None', def: 0 }],
    helm: [{ name: 'None', def: 0 }],
    chest: [{ name: 'Rags', def: 1 }],
    legs: [{ name: 'None', def: 0 }],
    gauntlets: [{ name: 'None', def: 0 }],
    boots: [{ name: 'None', def: 0 }],
  },
  equipped: { mainHand: 0, offHand: 'none:0', helm: 0, chest: 0, legs: 0, gauntlets: 0, boots: 0 },
});

const monster = (special?: Monster['special']): Monster => ({
  id: special === 'boss' ? 'dragon-king' : 'orc',
  x: 2,
  y: 1,
  symbol: 'O',
  name: special === 'boss' ? 'Dragon King' : 'Orc',
  hp: 0,
  maxHp: 10,
  atk: 3,
  color: '#fff',
  minFloor: 1,
  special,
  frozenTurns: 0,
});

describe('run stats', () => {
  it('records counters and builds a scored summary', () => {
    const stats = createRunStats(123, '2026-06-22T00:00:00.000Z');
    recordStep(stats);
    recordStep(stats, true);
    recordSearch(stats);
    recordSecretReveal(stats);
    recordStairs(stats, 2, 1);
    recordDamageDealt(stats, 11);
    recordDamageTaken(stats, 4);
    recordChest(stats, 25);
    recordFoodEaten(stats);
    recordPotionDrunk(stats, 'healing');
    recordGearPickedUp(stats, { name: 'Rune Blade', rarity: 'legendary' });
    recordMonsterKilled(stats, monster('boss'), { archetype: 'brute', xpGained: 50 });

    const summary = buildRunSummary({
      outcome: 'won',
      seed: 123,
      turns: 100,
      floorReached: 2,
      player: player(),
      finalDefense: 6,
      stats,
      finalLogs: ['Victory'],
      completedAt: '2026-06-22T00:02:00.000Z',
    });

    expect(summary.score).toBe(calculateScore(summary));
    expect(summary.deepestFloor).toBe(2);
    expect(summary.monstersKilled).toBe(1);
    expect(summary.killsByMonsterId['dragon-king']).toBe(1);
    expect(summary.bossesDefeated).toBe(1);
    expect(summary.goldCollected).toBe(25);
    expect(summary.potionsDrunk.healing).toBe(1);
    expect(summary.gearPickedUpByRarity.legendary).toBe(1);
    expect(summary.inventory.scrolls.light).toBe(1);
  });

  it('chooses deterministic flavor titles from ordered rules', () => {
    expect(chooseRunTitle({ outcome: 'died', turns: 500, hp: 0, floorReached: 20, secretsFound: 0, monstersKilled: 1, goldCollected: 0 })).toBe('So close to daylight');
    expect(chooseRunTitle({ outcome: 'died', turns: 500, hp: 0, floorReached: 2, secretsFound: 0, monstersKilled: 1, goldCollected: 0, deathCause: 'starvation' })).toBe('The pantry was the real boss');
    expect(chooseRunTitle({ outcome: 'won', turns: 900, hp: 10, floorReached: 20, secretsFound: 0, monstersKilled: 1, goldCollected: 0 })).toBe('Fastest blade in the dungeon');
  });

  it('keeps victory above a similar deep death and gives fast wins a scoring lane', () => {
    const deepDeath = calculateScore({
      outcome: 'died',
      turns: 1800,
      deepestFloor: 19,
      playerLevel: 14,
      goldCollected: 1800,
      monstersKilled: 75,
      bossesDefeated: 2,
      secretsFound: 4,
      damageTaken: 360,
    });
    const slowWin = calculateScore({
      outcome: 'won',
      turns: 2600,
      deepestFloor: 20,
      playerLevel: 17,
      goldCollected: 2100,
      monstersKilled: 90,
      bossesDefeated: 4,
      secretsFound: 3,
      damageTaken: 420,
    });
    const fastWin = calculateScore({
      outcome: 'won',
      turns: 1200,
      deepestFloor: 20,
      playerLevel: 15,
      goldCollected: 1400,
      monstersKilled: 65,
      bossesDefeated: 4,
      secretsFound: 2,
      damageTaken: 220,
    });

    expect(slowWin).toBeGreaterThan(deepDeath);
    expect(fastWin).toBeGreaterThanOrEqual(slowWin);
  });
});
