import { describe, expect, it } from 'vitest';
import type { RunSummaryV1 } from '../runStats';
import { SCROLL_TYPES } from '../itemVisuals';
import {
  clearRunHistory,
  compareRunToRecords,
  computeRecords,
  loadRunHistory,
  upsertRunSummary,
} from './runHistory';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
  key(index: number): string | null { return Array.from(this.map.keys())[index] ?? null; }
}

const summary = (id: string, patch: Partial<RunSummaryV1> = {}): RunSummaryV1 => ({
  runId: id,
  completedAt: `2026-06-22T00:00:${id.padStart(2, '0')}.000Z`,
  outcome: 'died',
  scoreVersion: 2,
  score: 100,
  seed: 1,
  turns: 100,
  elapsedMs: 1000,
  floorReached: 1,
  deepestFloor: 1,
  playerLevel: 1,
  xp: 0,
  hp: 0,
  maxHp: 12,
  goldHeld: 0,
  goldCollected: 0,
  finalDefense: 0,
  hunger: 0,
  inventory: { food: 0, potions: { healing: 0, strength: 0, invisibility: 0, armor: 0 }, scrolls: Object.fromEntries(SCROLL_TYPES.map(t => [t, 0])) as RunSummaryV1['inventory']['scrolls'], weapons: 1, armor: 5, shields: 1 },
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
  awards: ['Brave attempt'],
  finalLogs: [],
  ...patch,
});

describe('run history persistence', () => {
  it('loads an empty history and safely clears it', () => {
    const mem = new MemoryStorage();
    expect(loadRunHistory(mem)).toEqual({ runs: [] });
    upsertRunSummary(summary('1'), mem);
    clearRunHistory(mem);
    expect(loadRunHistory(mem)).toEqual({ runs: [] });
  });

  it('dedupes by runId and trims to 250 newest runs', () => {
    const mem = new MemoryStorage();
    upsertRunSummary(summary('1', { score: 10 }), mem);
    upsertRunSummary(summary('1', { score: 20 }), mem);
    expect(loadRunHistory(mem).runs).toHaveLength(1);
    expect(loadRunHistory(mem).runs[0].score).toBe(20);

    for (let i = 2; i <= 260; i++) upsertRunSummary(summary(String(i)), mem);
    const runs = loadRunHistory(mem).runs;
    expect(runs).toHaveLength(250);
    expect(runs[0].runId).toBe('260');
    expect(runs.some(run => run.runId === '1')).toBe(false);
  });

  it('drops malformed and stale-score summaries while loading history', () => {
    const mem = new MemoryStorage();
    mem.setItem('rogue_run_history', JSON.stringify({
      v: 1,
      data: {
        runs: [
          summary('valid'),
          { ...summary('missing-turns'), turns: undefined },
          { ...summary('old-score'), scoreVersion: 1 },
          { ...summary('nan'), damageTaken: Number.NaN },
        ],
      },
    }));

    expect(loadRunHistory(mem).runs.map(run => run.runId)).toEqual(['valid']);
  });
});

describe('run history records', () => {
  it('computes higher-is-better and lower-is-better records', () => {
    const records = computeRecords({
      runs: [
        summary('a', { outcome: 'won', score: 1000, turns: 400, elapsedMs: 5000, damageTaken: 12, deepestFloor: 20 }),
        summary('b', { outcome: 'won', score: 800, turns: 300, elapsedMs: 7000, damageTaken: 3, deepestFloor: 19 }),
      ],
    });

    expect(records.records.highestScore?.runId).toBe('a');
    expect(records.records.fastestVictoryTurns?.runId).toBe('b');
    expect(records.records.fewestVictoryDamageTaken?.runId).toBe('b');
    expect(records.totalVictories).toBe(2);
  });

  it('compares a current run to prior records', () => {
    const before = computeRecords({ runs: [summary('old', { score: 100, deepestFloor: 5, monstersKilled: 2 })] });
    const comparison = compareRunToRecords(summary('new', { score: 150, deepestFloor: 5, monstersKilled: 1 }), before);
    expect(comparison.badges.find(b => b.key === 'highestScore')?.status).toBe('new');
    expect(comparison.badges.find(b => b.key === 'deepestFloor')?.status).toBe('tied');
    expect(comparison.badges.some(b => b.key === 'mostMonstersKilled')).toBe(false);
  });
});
