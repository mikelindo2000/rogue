import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunSummaryV1 } from '../runStats';
import { SCROLL_TYPES } from '../itemVisuals';
import { MONSTER_DATABASE } from '../config';
import { monsterId } from '../discovery';
import {
  ALL_END_RUN_ART_FILES,
  END_RUN_ART_FILES,
  MONSTER_DEATH_ART_FILES,
  VICTORY_FINALE_ART_FILE,
  endRunArtUrl,
  pickEndRunArt,
  pickFallbackEndRunArt,
  pickOpeningEndRunArt,
  selectEndRunArtScenario,
  selectMonsterDeathArtId,
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

  it('defines three ordinary death images for every monster', () => {
    expect(MONSTER_DEATH_ART_FILES).toHaveLength(102);
    expect(MONSTER_DEATH_ART_FILES).toContain('monster-orc-1.png');
    expect(MONSTER_DEATH_ART_FILES).toContain('monster-marcus-the-brave-3.png');
    expect(ALL_END_RUN_ART_FILES).toHaveLength(157);
  });

  it('keeps the monster death generator catalogue aligned with runtime monsters', () => {
    const script = resolve(process.cwd(), 'scripts/gen-monster-death-art.mjs');
    const generatedIds = JSON.parse(execFileSync(process.execPath, [script, '--list-ids'], { encoding: 'utf8' })) as string[];

    expect(generatedIds).toEqual(MONSTER_DATABASE.map(monsterId));
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

  it('picks monster-specific art for ordinary monster deaths', () => {
    const run = summary({ deathCause: 'monster', killedByMonsterId: 'orc' });
    expect(selectMonsterDeathArtId(run)).toBe('orc');
    expect(pickEndRunArt(run)).toMatchObject({ scenario: 'monster-death', monsterId: 'orc' });
    expect(pickEndRunArt(run).file).toMatch(/^monster-orc-[1-3]\.png$/);
  });

  it('keeps special death scenarios ahead of ordinary monster death art', () => {
    const base = { deathCause: 'monster' as const, killedByMonsterId: 'orc' };
    expect(selectMonsterDeathArtId(summary({ ...base, floorReached: 20 }))).toBeNull();
    expect(pickEndRunArt(summary({ ...base, floorReached: 20 })).file).toMatch(/^death-floor20-[1-6]\.png$/);
    expect(selectMonsterDeathArtId(summary({ ...base, secretsFound: 3 }))).toBeNull();
    expect(pickEndRunArt(summary({ ...base, secretsFound: 3 })).file).toMatch(/^wall-whisperer-[1-6]\.png$/);
    expect(selectMonsterDeathArtId(summary({ ...base, monstersKilled: 40 }))).toBeNull();
    expect(pickEndRunArt(summary({ ...base, monstersKilled: 40 })).file).toMatch(/^dungeon-cleaner-[1-6]\.png$/);
    expect(selectMonsterDeathArtId(summary({ ...base, goldCollected: 1500 }))).toBeNull();
    expect(pickEndRunArt(summary({ ...base, goldCollected: 1500 })).file).toMatch(/^chest-enthusiast-[1-6]\.png$/);
  });

  it('keeps starvation deaths on the starvation art path', () => {
    const run = summary({ deathCause: 'starvation', killedByMonsterId: 'orc' });
    expect(selectMonsterDeathArtId(run)).toBeNull();
    expect(pickEndRunArt(run).file).toMatch(/^death-starvation-[1-6]\.png$/);
  });

  it('falls back to default death art for missing or unknown monster ids', () => {
    const run = summary({ deathCause: 'monster', killedByMonsterId: 'does-not-exist' });
    expect(selectMonsterDeathArtId(run)).toBeNull();
    expect(pickEndRunArt(run).file).toMatch(/^death-default-[1-6]\.png$/);
    expect(pickFallbackEndRunArt(run).file).toMatch(/^death-default-[1-6]\.png$/);
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
