import { describe, expect, it } from 'vitest';
import { createFloorBackgroundPicker } from '../ui/backgrounds';
import { chromeOverlaysForFloor } from '../ui/chromeOverlays';
import { SCROLL_TYPES } from '../itemVisuals';
import type { RunSummaryV1 } from '../runStats';
import {
  END_RUN_ART_READY_WAIT_MS,
  FLOOR_BACKGROUND_READY_WAIT_MS,
  chromeOverlayTextureUrlsForFloor,
  combatPortraitArtUrlForReadiness,
  endRunArtReadinessPlan,
  floorStageImagePlan,
  inventoryArtUrlsForReadiness,
  likelyNeighborFloor,
  uniqueImageUrls,
} from './imageLoadPlans';

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

describe('floor stage image load plans', () => {
  it('uses the 180 ms readiness cap selected for floor background swaps', () => {
    expect(FLOOR_BACKGROUND_READY_WAIT_MS).toBe(180);
    expect(FLOOR_BACKGROUND_READY_WAIT_MS).toBeLessThan(200);
  });

  it('plans current floor background and chrome overlays as the critical target', () => {
    const plan = floorStageImagePlan({
      floor: 4,
      stairsNearby: false,
      pickBackground: floor => `floor-${String(floor).padStart(2, '0')}-a.png`,
    });

    expect(plan.current).toEqual({
      floor: 4,
      backgroundUrl: '/backgrounds/floor-04-a.png',
      chromeOverlayUrls: chromeOverlayTextureUrlsForFloor(4),
    });
    expect(plan.neighbor).toBeNull();
  });

  it('commits one deterministic neighbor background through the provided run picker', () => {
    const picker = createFloorBackgroundPicker({
      seed: 1,
      next: () => 0.9,
      int: max => max - 1,
      range: (_min, max) => max,
      chance: () => false,
      pick: arr => arr[arr.length - 1],
      getState: () => 1,
    });
    const plan = floorStageImagePlan({
      floor: 7,
      stairsNearby: true,
      pickBackground: floor => picker.pick(floor),
    });

    expect(plan.neighbor?.floor).toBe(8);
    expect(plan.neighbor?.backgroundUrl).toBe('/backgrounds/floor-08-d.png');
    expect(picker.pick(8)).toBe('floor-08-d.png');
  });

  it('predicts ascent after the amulet and does not warm a floor when escape is likely', () => {
    expect(likelyNeighborFloor(9, { hasAmulet: true })).toBe(8);
    expect(likelyNeighborFloor(1, { hasAmulet: true })).toBeNull();
  });

  it('uses the previous floor as the conservative fallback at max depth', () => {
    expect(likelyNeighborFloor(20)).toBe(19);
  });

  it('resolves only concrete chrome texture URLs for the requested floor', () => {
    const urls = chromeOverlayTextureUrlsForFloor(12);

    expect(urls).toHaveLength(chromeOverlaysForFloor(12).length);
    expect(urls.every(url => url.startsWith('/chrome-overlays/'))).toBe(true);
    expect(urls.every(url => url.endsWith('.png'))).toBe(true);
  });
});

describe('gameplay surface image load plans', () => {
  it('uses a short bounded readiness cap for opening end-run art', () => {
    expect(END_RUN_ART_READY_WAIT_MS).toBe(220);
    expect(END_RUN_ART_READY_WAIT_MS).toBeLessThan(300);
  });

  it('plans only the selected opening art plus a generic fallback for end-run readiness', () => {
    const plan = endRunArtReadinessPlan(summary({
      deathCause: 'monster',
      killedByMonsterId: 'orc',
    }));

    expect(plan.selected).toMatchObject({ scenario: 'monster-death', monsterId: 'orc' });
    expect(plan.selected.url).toMatch(/^\/endings\/monster-orc-[1-3]\.png$/);
    expect(plan.fallback.url).toMatch(/^\/endings\/death-default-[1-6]\.png$/);
  });

  it('keeps the victory finale as the selected opener without warming every victory ending', () => {
    const plan = endRunArtReadinessPlan(summary({ outcome: 'won', hp: 8 }));

    expect(plan.selected.url).toBe('/endings/victory-amulet-escape-1.png');
    expect(plan.fallback.url).toMatch(/^\/endings\/victory-default-[1-6]\.png$/);
  });

  it('dedupes inventory and equipment art without including empty placeholders', () => {
    expect(inventoryArtUrlsForReadiness(
      [
        { artUrl: '/inventory/scroll-of-light.png' },
        { artUrl: '' },
        { artUrl: '/inventory/scroll-of-light.png' },
      ],
      [
        { artUrl: '/inventory/long-sword.png' },
        { artUrl: '   ' },
      ],
    )).toEqual([
      '/inventory/scroll-of-light.png',
      '/inventory/long-sword.png',
    ]);
  });

  it('plans only the active combat portrait image from its slug', () => {
    expect(combatPortraitArtUrlForReadiness({ id: 'vampire-bat' })).toBe('/bestiary/vampire-bat.png');
    expect(combatPortraitArtUrlForReadiness(null)).toBeNull();
    expect(combatPortraitArtUrlForReadiness({ id: '' })).toBeNull();
  });

  it('preserves the first-seen order when collapsing duplicate image URLs', () => {
    expect(uniqueImageUrls(['/a.png', null, '/b.png', '/a.png', undefined, ''])).toEqual([
      '/a.png',
      '/b.png',
    ]);
  });
});
