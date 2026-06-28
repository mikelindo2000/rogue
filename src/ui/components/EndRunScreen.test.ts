// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import EndRunScreen from './EndRunScreen.svelte';
import { ui } from '../store.svelte';
import { SCROLL_TYPES } from '../../itemVisuals';
import type { RunSummaryV1 } from '../../runStats';
import { assetReadinessService, type AssetReadinessRequest } from '../../assets/readiness';

function summary(overrides: Partial<RunSummaryV1> = {}): RunSummaryV1 {
  return {
    runId: 'run-end',
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
    finalLogs: ['The orc strikes the final blow.'],
    ...overrides,
  };
}

let host: ReturnType<typeof mount> | null = null;

async function renderEndRun(run: RunSummaryV1) {
  ui.gameOver = run.outcome === 'died';
  ui.gameWon = run.outcome === 'won';
  ui.endRunSummary = run;
  ui.endRunRecords = null;
  ui.endRunComparison = null;
  ui.endRunHistory = [run];
  ui.endRunPresentationReady = true;
  ui.endRunTransitionActive = false;
  host = mount(EndRunScreen, { target: document.body });
  flushSync();
  await tick();
  flushSync();
}

afterEach(() => {
  if (host) { unmount(host); host = null; }
  document.body.innerHTML = '';
  ui.gameOver = false;
  ui.gameWon = false;
  ui.endRunSummary = null;
  ui.endRunRecords = null;
  ui.endRunComparison = null;
  ui.endRunHistory = [];
  ui.endRunPresentationReady = true;
  ui.endRunTransitionActive = false;
  vi.restoreAllMocks();
});

describe('end-run screen art readiness', () => {
  it('requests only the selected opening art as critical-now', async () => {
    const requestImage = vi.spyOn(assetReadinessService, 'requestImage').mockImplementation((request: AssetReadinessRequest) => ({
      url: request.url,
      cancel: vi.fn(),
      snapshot: () => ({ kind: 'image', url: request.url, state: 'queued', priority: request.priority }),
      whenReady: () => Promise.resolve(true),
    }));

    await renderEndRun(summary({ deathCause: 'monster', killedByMonsterId: 'orc' }));
    await tick();
    flushSync();

    expect(requestImage).toHaveBeenCalledTimes(1);
    expect(requestImage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'image',
      url: expect.stringMatching(/^\/endings\/monster-orc-[1-3]\.png$/),
      priority: 'critical-now',
      reason: 'opening end-run art',
      owner: 'end-run-screen',
      optional: true,
    }));
    expect(document.querySelector<HTMLImageElement>('.art-curtain img')?.getAttribute('src'))
      .toMatch(/^\/endings\/monster-orc-[1-3]\.png$/);
  });

  it('uses the generic fallback when selected art readiness is late or failed', async () => {
    vi.spyOn(assetReadinessService, 'requestImage').mockImplementation((request: AssetReadinessRequest) => ({
      url: request.url,
      cancel: vi.fn(),
      snapshot: () => ({ kind: 'image', url: request.url, state: 'loading', priority: request.priority }),
      whenReady: () => Promise.resolve(false),
    }));

    await renderEndRun(summary({ deathCause: 'monster', killedByMonsterId: 'orc' }));
    await tick();
    flushSync();

    const img = document.querySelector<HTMLImageElement>('.art-curtain img');
    expect(img?.getAttribute('src')).toMatch(/^\/endings\/death-default-[1-6]\.png$/);
    expect(document.querySelector('.art-copy')?.textContent).toContain('The dungeon claims another');
  });
});
