import { describe, expect, it } from 'vitest';
import type { RunSummaryV1 } from '../runStats';
import { SCROLL_TYPES } from '../itemVisuals';
import {
  END_RUN_ART_FILES,
  VICTORY_FINALE_ART_FILE,
  endRunArtUrl,
  pickEndRunArt,
  pickOpeningEndRunArt,
  selectEndRunArtScenario,
} from './endRunArt';

function summary(overrides: Partial<RunSummaryV1> = {}): RunSummaryV1 {
  return {
    runId: 'run-a',
    completedAt: '2026-06-22T12:00:00.000Z',
    outcome: 'died',
    scoreVersion: 2,
    score: 1200,
    seed: 42,
    turns: 500,
    elapsedMs: 30_000,
    floorReached: 1,
    deepestFloor: 1,
    playerLevel: 1,
    xp: 0,
    hp: 0,
    maxHp: 12,
    goldHeld: 0,
    goldCollected: 0,
    finalDefense: 0,
    hunger: 1000,
    inventory: {
      food: 0,
      potions: { healing: 0, strength: 0, invisibility: 0, armor: 0 },
      scrolls: Object.fromEntries(SCROLL_TYPES.map(t => [t, 0])) as RunSummaryV1['inventory']['scrolls'],
      weapons: 0,
      armor: 0,
      shields: 0,
    },
    equipped: {},
    monstersKilled: 0,
    killsByMonsterId: {},
    killsByArchetype: {},
    bossesDefeated: 0,
    heroesDefeated: 0,
    damageDealt: 0,
    damageTaken: 0,
    biggestHitDealt: 0,
    biggestHitTaken: 0,
    attacksMade: 0,
    searchesAttempted: 0,
    secretsFound: 0,
    tilesExplored: 0,
    chestsOpened: 0,
    foodEaten: 0,
    potionsDrunk: { healing: 0, strength: 0, invisibility: 0, armor: 0 },
    gearPickedUpByRarity: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, unknown: 0 },
    stairDescents: 0,
    stairAscents: 0,
    title: 'The dungeon claims another',
    awards: [],
    finalLogs: [],
    ...overrides,
  };
}

describe('end run art', () => {
  it('defines 54 ending images', () => {
    expect(END_RUN_ART_FILES).toHaveLength(54);
    expect(END_RUN_ART_FILES).toContain('victory-fast-1.png');
    expect(END_RUN_ART_FILES).toContain('death-default-6.png');
  });

  it('maps files to public ending URLs', () => {
    expect(endRunArtUrl('victory-default-3.png')).toBe('/endings/victory-default-3.png');
  });

  it('uses the same scenario priority as the run title design', () => {
    expect(selectEndRunArtScenario(summary({ outcome: 'won', turns: 800 }))).toBe('victory-fast');
    expect(selectEndRunArtScenario(summary({ outcome: 'won', turns: 1500, hp: 2 }))).toBe('victory-heartbeat');
    expect(selectEndRunArtScenario(summary({ floorReached: 20 }))).toBe('death-floor20');
    expect(selectEndRunArtScenario(summary({ deathCause: 'starvation' }))).toBe('death-starvation');
    expect(selectEndRunArtScenario(summary({ secretsFound: 3 }))).toBe('wall-whisperer');
    expect(selectEndRunArtScenario(summary({ monstersKilled: 40 }))).toBe('dungeon-cleaner');
    expect(selectEndRunArtScenario(summary({ goldCollected: 1500 }))).toBe('chest-enthusiast');
    expect(selectEndRunArtScenario(summary({ outcome: 'won', turns: 1500, hp: 8 }))).toBe('victory-default');
  });

  it('picks a stable variant from run identity', () => {
    const run = summary({ runId: 'stable', seed: 999, turns: 1234, score: 8000 });
    expect(pickEndRunArt(run)).toEqual(pickEndRunArt(run));
    expect(pickEndRunArt(run).file).toMatch(/^death-default-[1-6]\.png$/);
  });

  it('uses the dedicated finale artwork as the first victory image', () => {
    const run = summary({ outcome: 'won', title: 'Escaped the dungeon' });
    expect(VICTORY_FINALE_ART_FILE).toBe('victory-amulet-escape-1.png');
    expect(pickOpeningEndRunArt(run)).toMatchObject({
      scenario: 'victory-finale',
      file: VICTORY_FINALE_ART_FILE,
      url: '/endings/victory-amulet-escape-1.png',
    });
  });
});
